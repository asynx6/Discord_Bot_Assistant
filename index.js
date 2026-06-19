import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import path from "node:path";
import { getAiInstruction, generateDynamicCode, regenerateWithErrorContext } from "./Modules/aiHandler.js";
import {
    extractImageFromMessage,
    visionUnsupportedMessage,
    isVisionUnsupportedError,
} from "./Modules/visionHandler.js";
import { executeAiAction } from "./Modules/discordActions.js";
import { saveContext, getContext, clearAllContext } from "./Modules/contextManager.js";
import { connectDB } from "./Modules/database.js";
import { validateEnv } from "./Modules/envValidator.js";
import { logger } from "./Modules/logger.js";
import { cooldown, CooldownTags } from "./Modules/cooldown.js";
import { metrics } from "./Modules/metrics.js";
import {
    saveDynamicCommand,
    registerDynamicCommand,
    loadAllDynamicCommands,
    executeDynamicCommand,
    listDynamicCommands,
    listDynamicCommandDetails,
    hasDynamicCommand,
    sanitizeName,
} from "./Modules/dynamicExecutor.js";
import { recordAndCheckMessage, phishingWarningMessage } from "./Modules/antiPhishing.js";
import {
    getDefaultRegistry,
    formatSystemList,
    parseSystemCommand,
} from "./Modules/systemRegistry.js";
import { getDefaultScheduler } from "./Modules/scheduler.js";
import {
    buildYesNoRow,
    resolveYesNoAnswer,
    expiredNoticeMessage,
    yesNoFooter,
} from "./Modules/interactiveUI.js";
import { getSystemHealth, formatDiagnosticEmbed } from "./Modules/diagnostic.js";
import { writeEnvVar, maskSecret } from "./Modules/envWriter.js";
import { detectTokenRequirements, buildSolicitMessage, parseTokenReply } from "./Modules/tokenSolicitor.js";
import mongoose from "mongoose";

let envConfig;
try {
    envConfig = validateEnv({ strict: false });
    logger.info("env.validated", {
        hasAi: envConfig.hasAi,
        aiSource: envConfig.aiSource,
        aiModel: envConfig.aiModel,
        aiBaseUrl: envConfig.aiBaseUrl,
        hasMongo: envConfig.hasMongo,
        ownerId: envConfig.ownerId,
    });
} catch (err) {
    logger.error("env.validation_failed", { error: err.message });
    if (err.missing) {
        console.error("\n" + (err.lines ?? err.message) + "\n");
    }
    process.exit(1);
}

const systemRegistry = getDefaultRegistry();
const scheduler = getDefaultScheduler();

// Ensure core systems are registered in the local registry on startup
async function bootstrapRegistry() {
    try {
        await systemRegistry.load();
    } catch { /* already loaded */ }
    const known = [
        { id: "daily_reminder", name: "Daily Reminder 12pm", description: "Sends a daily message at 12:00 Asia/Jakarta" },
        { id: "anti_phishing", name: "Anti-Phishing Guard", description: "Auto-deletes cross-channel spam" },
        { id: "dynamic_commands", name: "Dynamic Command Engine", description: "Generate + hot-reload user-defined commands" },
    ];
    for (const k of known) {
        const existing = systemRegistry.get(k.id);
        if (!existing) {
            await systemRegistry.set(k.id, {
                name: k.name,
                status: "on",
                description: k.description,
                schedule: k.id === "daily_reminder" ? { dailyAt: "12:00", timeZone: "Asia/Jakarta" } : null,
            });
        }
    }
}

connectDB().catch((err) => {
    logger.error("db.connect_failed", { error: err?.message });
});

// Load any previously-generated dynamic commands at startup so they survive restart.
loadAllDynamicCommands()
    .then((res) => logger.info("dynamic.startup_loaded", res))
    .catch((err) => logger.error("dynamic.startup_failed", { error: err?.message }));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration,
    ],
});

const processingLock = new Map();
// Track messages the bot itself posted for the dynamic-confirmation flow,
// so we can edit/disable the buttons on expiry.
const pendingDynamicConfirmations = new Map(); // messageId -> { suggestedName, intent, originalQuery, expiresAt }
const pendingTokenSolicitations = new Map(); // userId -> { envVars, missing, originalQuery, suggestedName, intent }

// ---------- Cron callbacks (registered in clientReady) ----------

async function sendDailyReminder() {
    const entry = systemRegistry.get("daily_reminder");
    if (!entry || entry.status !== "on") return;
    // Find the first channel the bot can write to in any guild
    for (const guild of client.guilds.cache.values()) {
        const ch = guild.channels.cache.find(
            (c) => c && c.isTextBased && c.isTextBased() && c.viewable && c.permissionsFor(guild.members.me)?.has("SendMessages")
        );
        if (ch) {
            const embed = {
                title: "⏰ Daily Reminder",
                description: "Halo bos! Udah jam 12 siang, jangan lupa makan & istirahat ya 🍱",
                color: 0xf39c12,
                timestamp: new Date().toISOString(),
                footer: { text: "Auto-reminder by Discord Bot Asistent" },
            };
            try {
                await ch.send({ embeds: [embed] });
                logger.info("scheduler.daily_reminder_sent", { channelId: ch.id, guildId: guild.id });
            } catch (err) {
                logger.warn("scheduler.daily_reminder_send_failed", { error: err?.message });
            }
            return;
        }
    }
    logger.warn("scheduler.daily_reminder_no_channel");
}

function pickCooldownTag(instruction) {
    const items = Object.keys(instruction)
        .filter((k) => /^\d+$/.test(k))
        .map((k) => instruction[k]);
    if (items.length === 0) return null;

    const bulkCount = items.length;
    if (bulkCount >= 5) return CooldownTags.BULK_CREATE;

    const names = items.map((i) => String(i?.action ?? "").toUpperCase());
    if (names.some((n) => n === "DELETE_CHANNEL" && items.find((i) => i.deleteAll === true))) {
        return CooldownTags.NUKE_DELETE;
    }
    if (names.includes("BAN")) return CooldownTags.BAN;
    if (names.includes("KICK")) return CooldownTags.KICK;
    if (names.includes("ROLE_ALL")) return CooldownTags.MASS_ROLE;
    if (names.includes("UNDO")) return CooldownTags.UNDO;

    return null;
}

function pickDynamicRequest(instruction) {
    if (!instruction || instruction.isError) return null;
    const items = Object.keys(instruction)
        .filter((k) => /^\d+$/.test(k))
        .map((k) => instruction[k]);
    const req = items.find((i) => (i.action || "").toUpperCase() === "DYNAMIC_REQUEST");
    return req || null;
}

async function askDynamicConfirmation(message, req) {
    const safeName = sanitizeName(req.suggestedName) || "unknown";
    const existing = hasDynamicCommand(safeName);

    const prompt = existing
        ? `🔧 Fitur **${safeName}** udah ada di cache lokal. Mau gw pake yang udah ada, atau generate ulang?\n\n` +
          `Intent: ${req.intent || "(tidak ada deskripsi)"}\n\n` +
          `Tekan tombol di bawah ini. _Expire dalam 60 detik._`
        : `🔧 Fitur **${safeName}** belum ada nih.\n\n` +
          `Intent: ${req.intent || "(tidak ada deskripsi)"}\n` +
          `Request asli: "${req.originalQuery || ""}"\n\n` +
          `Bot bakal:\n` +
          `  1. 🤖 Generate kode JavaScript via AI\n` +
          `  2. 🔍 Validasi syntax + safety\n` +
          `  3. 💾 Simpan ke \`commands/dynamic/handle_${safeName}.js\`\n` +
          `  4. ⚡ Hot-reload & langsung bisa dipake\n\n` +
          `Tekan tombol di bawah ini. _Expire dalam 60 detik._`;

    try {
        const { row, yesCustomId, noCustomId, expiresAt } = await buildYesNoRow(`dynamic:${safeName}`);
        const sent = await message.reply({
            content: prompt,
            components: [row],
        });
        pendingDynamicConfirmations.set(sent.id, {
            suggestedName: safeName,
            intent: req.intent,
            originalQuery: req.originalQuery,
            expiresAt,
            yesCustomId,
            noCustomId,
        });
        // Schedule expiry to disable the buttons after 60s
        setTimeout(() => expireConfirmation(sent, `dynamic:${safeName}`), Math.max(0, expiresAt - Date.now())).unref();
    } catch (err) {
        logger.error("dynamic.confirm_send_failed", { error: err?.message });
    }
}

async function expireConfirmation(originalMessage, tag) {
    try {
        const pending = Array.from(pendingDynamicConfirmations.entries()).find(
            ([, v]) => true
        );
        // Disable all buttons on the original message
        if (originalMessage && originalMessage.editReply) {
            const disabled = originalMessage.components?.[0]?.components?.map((c) => {
                try { return c.setDisabled(true); } catch { return c; }
            }) ?? [];
            await originalMessage.edit({ components: disabled.length ? [{ type: 1, components: disabled }] : [] }).catch(() => {});
        }
    } catch (err) {
        logger.warn("ui.expire_failed", { tag, error: err?.message });
    }
}

async function handleDynamicConfirmation(message, ctx) {
    const { suggestedName, intent, originalQuery } = ctx;
    const MAX_HEAL_ATTEMPTS = 3;
    let lastCode = null;
    let lastError = null;

    // Phase 0 (v1.4.0): Token solicitation — if the requested feature
    // description mentions known APIs, ask the user to provide tokens first.
    // We scan against the originalQuery (intent) because we don't have code yet.
    const preliminaryNeeds = detectTokenRequirements(
        `${intent ?? ""} ${originalQuery ?? ""}`
    );
    const existingEnv = Object.keys(process.env);
    const missingTokens = preliminaryNeeds.filter((t) => !existingEnv.includes(t.envVar));
    if (missingTokens.length > 0) {
        const solicit = buildSolicitMessage(missingTokens, {
            featureName: suggestedName,
            existingEnvVars: existingEnv,
        });
        const sent = await message.reply(solicit);
        pendingTokenSolicitations.set(message.author.id, {
            envVars: missingTokens,
            originalQuery,
            suggestedName,
            intent,
            promptMessageId: sent.id,
        });
        return;
    }

    let progressMsg = await message.reply("🤖 Lagi generate kode nih...");

    for (let attempt = 1; attempt <= MAX_HEAL_ATTEMPTS; attempt++) {
        try {
            // Phase 1: Generate (or regenerate with error context)
            let codegen;
            if (attempt === 1) {
                codegen = await generateDynamicCode(suggestedName, intent, originalQuery);
            } else {
                await progressMsg.edit(`🔧 Attempt #${attempt} — Lagi perbaiki kode karena runtime error: \`${(lastError || "unknown").slice(0, 80)}\``);
                codegen = await regenerateWithErrorContext(suggestedName, intent, originalQuery, lastCode, lastError, attempt);
            }

            if (codegen.isError) {
                logger.error("dynamic.heal.codegen_failed", { suggestedName, attempt, error: codegen.message });
                if (attempt === MAX_HEAL_ATTEMPTS) {
                    return progressMsg.edit(`❌ Gagal generate kode: ${codegen.message}`);
                }
                lastError = codegen.message;
                continue;
            }
            lastCode = codegen.code;

            // Phase 2: Validate
            await progressMsg.edit(attempt === 1 ? "🔍 Lagi validasi syntax & safety..." : `🔍 Attempt #${attempt} — Validasi kode baru...`);
            const saved = await saveDynamicCommand(suggestedName, codegen.code);
            if (!saved.ok) {
                logger.warn("dynamic.heal.save_rejected", { suggestedName, attempt, error: saved.error });
                lastError = saved.error;
                if (attempt === MAX_HEAL_ATTEMPTS) {
                    return progressMsg.edit(`❌ Kode ditolak validator: ${saved.error}`);
                }
                continue;
            }

            // Phase 3: Register
            await progressMsg.edit(`⚡ Attempt #${attempt} — Hot-reload command...`);
            const reg = await registerDynamicCommand(suggestedName);
            if (!reg.ok) {
                logger.error("dynamic.heal.register_failed", { suggestedName, attempt, error: reg.error });
                lastError = reg.error;
                if (attempt === MAX_HEAL_ATTEMPTS) {
                    return progressMsg.edit(`❌ Gagal load command: ${reg.error}`);
                }
                continue;
            }

            // Phase 4: Execute
            await progressMsg.edit(`🚀 Attempt #${attempt} — Lagi ngejalanin...`);
            const exec = await executeDynamicCommand(suggestedName, message, {
                raw: message.content,
                args: message.content.trim().split(/\s+/),
                intent,
                originalQuery,
            });

            if (exec.ok) {
                const finalText = exec.result
                    ? `✅ Command **${suggestedName}** jalan!${attempt > 1 ? ` (setelah ${attempt} self-heal attempt)` : ""}\n\n${exec.result}`
                    : `✅ Command **${suggestedName}** selesai tanpa output.`;
                await progressMsg.edit(finalText.length > 1900 ? finalText.slice(0, 1900) + "…" : finalText);
                logger.info("dynamic.heal.success", { suggestedName, attempt });
                return;
            }

            // Runtime error — capture for self-heal
            lastError = exec.error;
            logger.warn("dynamic.heal.runtime_error", { suggestedName, attempt, error: lastError });
            if (attempt === MAX_HEAL_ATTEMPTS) {
                return progressMsg.edit(
                    `❌ Self-healing gagal setelah ${MAX_HEAL_ATTEMPTS} percobaan.\n\n` +
                    `Error terakhir: \`${(lastError || "unknown").slice(0, 200)}\`\n\n` +
                    `Coba request ulang dengan deskripsi lebih jelas.`
                );
            }
        } catch (err) {
            logger.error("dynamic.heal.unexpected", { suggestedName, attempt, error: err?.message });
            lastError = err?.message ?? String(err);
            if (attempt === MAX_HEAL_ATTEMPTS) {
                return progressMsg.edit(`❌ Error unexpected: ${lastError}`);
            }
        }
    }
}

client.once("clientReady", async () => {
    logger.info("bot.ready", {
        tag: client.user.tag,
        guildCount: client.guilds.cache.size,
    });
    console.log(`✅ Bot online sebagai: ${client.user.tag}`);
    console.log(`📡 Tersambung ke ${client.guilds.cache.size} server`);

    client.user.setActivity("Discord Bot Asistant", { type: ActivityType.Listening });

    // v1.4.0 — bootstrap system registry + scheduler
    try {
        await bootstrapRegistry();
        const reminder = systemRegistry.get("daily_reminder");
        if (reminder && reminder.status === "on") {
            scheduler.register("daily_reminder", { dailyAt: "12:00", timeZone: "Asia/Jakarta" }, sendDailyReminder);
        }
        scheduler.start();
        logger.info("scheduler.startup_done", { jobCount: scheduler.size() });
    } catch (err) {
        logger.error("scheduler.startup_failed", { error: err?.message });
    }
});

client.on("error", (err) => {
    logger.error("client.error", { error: err?.message });
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.user.id !== process.env.DISCORD_OWNER_ID) {
        return interaction.reply({ content: "❌ Tombol ini bukan buat lo.", ephemeral: true });
    }
    const answer = resolveYesNoAnswer(interaction.customId);
    if (answer === null) {
        return interaction.reply({ content: expiredNoticeMessage(), ephemeral: true });
    }
    const pending = pendingDynamicConfirmations.get(interaction.message.id);
    if (!pending) {
        return interaction.reply({ content: "❌ Konfirmasi ini udah kadaluarsa. Request ulang kalo masih mau.", ephemeral: true });
    }
    pendingDynamicConfirmations.delete(interaction.message.id);
    if (answer === "no") {
        await interaction.update({ content: "👍 Yaudah, gw skip dulu. Kalo butuh tinggal bilang lagi.", components: [] });
        return;
    }
    // Yes — proceed with the confirmation flow
    await interaction.update({ content: "🤖 Oke, gw mulai generate...", components: [] });
    // Build a fake message-like object to reuse handleDynamicConfirmation
    const fakeMessage = {
        author: interaction.user,
        guild: interaction.guild,
        channel: interaction.channel,
        content: `Yes: ${pending.originalQuery}`,
        reply: (content) => interaction.channel.send(content),
    };
    return handleDynamicConfirmation(fakeMessage, {
        suggestedName: pending.suggestedName,
        intent: pending.intent,
        originalQuery: pending.originalQuery,
    });
});

client.on("warn", (msg) => {
    logger.warn("client.warn", { message: msg });
});

client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const botMention = `<@${client.user.id}>`;
    const botMentionMobile = `<@!${client.user.id}>`;

    let instruction;
    let isContextReply = false;
    let progressMsg = null;
    const previousContext = getContext(message);

    // ---------- v1.4.0: Anti-Phishing check (runs FIRST, before any other logic) ----------
    // Scan incoming message + image URLs and decide whether the same user
    // has just spammed the same content across multiple channels.
    if (previousContext && previousContext.__awaitingDynamicConfirm) {
        // handled below in confirmation flow
    } else {
        try {
            const antiPhishImageUrls = await extractImageFromMessage(message).catch(() => []);
            const phishResult = recordAndCheckMessage({
                userId: message.author.id,
                channelId: message.channel.id,
                messageId: message.id,
                text: message.content,
                imageUrls: antiPhishImageUrls,
            });
            if (phishResult.isPhishing) {
                // Delete the offending message + all related ones across channels
                let deletedCount = 0;
                for (const rel of phishResult.relatedMessages) {
                    try {
                        const ch = message.guild.channels.cache.get(rel.channelId) || await message.guild.channels.fetch(rel.channelId).catch(() => null);
                        if (!ch || !ch.isTextBased?.()) continue;
                        const msg = await ch.messages.fetch(rel.messageId).catch(() => null);
                        if (msg) {
                            await msg.delete().catch(() => {});
                            deletedCount++;
                        }
                    } catch (err) {
                        logger.warn("anti_phishing.delete_failed", { channelId: rel.channelId, error: err?.message });
                    }
                }
                logger.warn("anti_phishing.detected", {
                    userId: message.author.id,
                    channels: phishResult.distinctChannels,
                    relatedCount: phishResult.relatedMessages.length,
                    deletedCount,
                });
                // Notify the user (one-time DM) but don't block further messages
                const warning = phishingWarningMessage(phishResult, message.author.id);
                try {
                    await message.author.send(warning).catch(() => {
                        // Fall back to current channel if DMs are closed
                        if (message.channel.permissionsFor(message.guild.members.me)?.has("SendMessages")) {
                            message.channel.send(warning).catch(() => {});
                        }
                    });
                } catch {}
                return; // do not process the message further
            }
        } catch (err) {
            logger.warn("anti_phishing.check_failed", { error: err?.message });
        }
    }

    if (previousContext && previousContext.__awaitingDynamicConfirm) {
        if (message.author.id !== process.env.DISCORD_OWNER_ID) return;
        const reply = message.content.trim().toLowerCase();
        if (reply === "ya" || reply === "y" || reply === "yes" || reply === "ok" || reply === "lanjut") {
            return handleDynamicConfirmation(message, previousContext);
        }
        if (reply === "tidak" || reply === "n" || reply === "no" || reply === "gak" || reply === "batal" || reply === "cancel") {
            return message.reply("👍 Yaudah, gw skip dulu. Kalo butuh tinggal bilang lagi.");
        }
        return message.reply("Jawab **Ya** atau **Tidak** aja ya bos.");
    }

    if (previousContext) {
        if (message.author.id !== process.env.DISCORD_OWNER_ID) return;

        instruction = previousContext;
        const firstKey = Object.keys(instruction).find((k) => /^\d+$/.test(k));

        if (instruction[firstKey]) {
            const item = instruction[firstKey];
            if (!item.url) item.url = message.content.trim();
            else if (!item.name) item.name = message.content.trim();
            else item.content = message.content.trim();
        }
        isContextReply = true;
    } else {
        if (
            !message.content.startsWith(botMention) &&
            !message.content.startsWith(botMentionMobile)
        ) {
            return;
        }
        if (message.author.id !== process.env.DISCORD_OWNER_ID) return;

        const userInput = message.content
            .replace(botMention, "")
            .replace(botMentionMobile, "")
            .trim();

        if (!userInput) return message.reply("Mau nyuruh apa lagi haaa??");

        // Handle "metrics" pseudo-command inline (no AI needed)
        if (/^stats$|^metrics$/i.test(userInput)) {
            metrics.recordRequest({ userId: message.author.id, guildId: message.guild.id });
            return message.reply(metrics.formatSummary());
        }

        // v1.4.0 — Token solicitation reply handler
        if (pendingTokenSolicitations.has(message.author.id)) {
            const pending = pendingTokenSolicitations.get(message.author.id);
            const parsed = parseTokenReply(message.content);
            if (!parsed) {
                return message.reply("❌ Format nggak cocok. Contoh: `kasih token GIPHY_API_KEY=abc123`");
            }
            const known = pending.envVars.find((t) => t.envVar === parsed.envVar);
            if (!known) {
                return message.reply(`❌ Token \`${parsed.envVar}\` nggak ada di daftar yang gw butuhin. Yang gw butuhin: ${pending.envVars.map((t) => t.envVar).join(", ")}`);
            }
            try {
                const r = await writeEnvVar(parsed.envVar, parsed.value);
                process.env[parsed.envVar] = parsed.value;
                pendingTokenSolicitations.delete(message.author.id);
                logger.info("token_solicitor.written", { envVar: parsed.envVar, action: r.action });
                const safe = maskSecret(parsed.value);
                await message.reply(
                    `✅ Token \`${parsed.envVar}\` (${safe}) udah gw tulis ke \`.env\` (${r.action}). ` +
                    `Lanjut generate kode buat **${pending.suggestedName}**...`
                );
                return handleDynamicConfirmation(message, {
                    suggestedName: pending.suggestedName,
                    intent: pending.intent,
                    originalQuery: pending.originalQuery,
                });
            } catch (err) {
                logger.error("token_solicitor.write_failed", { error: err?.message });
                return message.reply(`❌ Gagal tulis token ke \`.env\`: ${err.message}`);
            }
        }

        // v1.4.0 — System registry commands ("list systems", "turn on/off X", "status X")
        const sysCmd = parseSystemCommand(userInput);
        if (sysCmd.kind !== "unknown") {
            try {
                if (sysCmd.kind === "list") {
                    const list = systemRegistry.list();
                    return message.reply(formatSystemList(list));
                }
                if (sysCmd.kind === "toggle") {
                    let entry = systemRegistry.get(sysCmd.id);
                    if (!entry) {
                        // Create a new one with the requested status
                        await systemRegistry.set(sysCmd.id, { name: sysCmd.id, status: sysCmd.status });
                        return message.reply(`✅ System **${sysCmd.id}** didaftarkan dengan status **${sysCmd.status}**.`);
                    }
                    await systemRegistry.set(sysCmd.id, { status: sysCmd.status });
                    // Update scheduler registration for daily_reminder
                    if (sysCmd.id === "daily_reminder") {
                        if (sysCmd.status === "on") {
                            if (!scheduler.list().find((j) => j.id === "daily_reminder")) {
                                scheduler.register("daily_reminder", { dailyAt: "12:00", timeZone: "Asia/Jakarta" }, sendDailyReminder);
                            }
                        } else {
                            scheduler.unregister("daily_reminder");
                        }
                    }
                    return message.reply(`✅ System **${sysCmd.id}** sekarang **${sysCmd.status}**.`);
                }
                if (sysCmd.kind === "status") {
                    const entry = systemRegistry.get(sysCmd.id);
                    if (!entry) return message.reply(`❓ System **${sysCmd.id}** belum ada di registry.`);
                    return message.reply(
                        `🗂️ **${entry.name}** _(${entry.id})_\n` +
                        `Status: **${entry.status.toUpperCase()}**\n` +
                        (entry.description ? `📝 ${entry.description}\n` : "") +
                        (entry.schedule ? `⏰ Schedule: ${entry.schedule.dailyAt ?? entry.schedule.cron ?? "(none)"}\n` : "") +
                        `🕒 Updated: ${entry.updatedAt}`
                    );
                }
            } catch (err) {
                logger.error("system_registry.cmd_failed", { error: err?.message, cmd: sysCmd });
                return message.reply(`❌ Gagal proses system command: ${err?.message ?? "unknown"}`);
            }
        }

        // v1.4.0 — Auto-diagnostic command
        if (/^diagnostic$|^diagnosa$|^health$/i.test(userInput)) {
            try {
                const mongoState = {
                    connected: mongoose.connection?.readyState === 1,
                    host: mongoose.connection?.host ?? null,
                };
                const dynamicList = listDynamicCommands();
                const registryList = systemRegistry.list();
                const snap = metrics.snapshot();
                const health = await getSystemHealth({
                    metrics: snap.totals,
                    dynamic: { count: dynamicList.length, loaded: dynamicList.length },
                    registry: {
                        total: registryList.length,
                        active: registryList.filter((e) => e.status === "on").length,
                    },
                    mongo: mongoState,
                });
                const embed = formatDiagnosticEmbed(health);
                // discord.js EmbedBuilder is the safe way; lazy-import to keep tests pure
                const { EmbedBuilder } = await import("discord.js");
                const e = new EmbedBuilder()
                    .setTitle(embed.title)
                    .setDescription(embed.description)
                    .setColor(embed.color)
                    .setTimestamp(embed.timestamp);
                for (const f of embed.fields) e.addFields({ name: f.name, value: f.value, inline: f.inline });
                e.setFooter(embed.footer);
                return message.reply({ embeds: [e] });
            } catch (err) {
                logger.error("diagnostic.failed", { error: err?.message });
                return message.reply(`❌ Gagal kumpulin diagnostic: ${err?.message ?? "unknown"}`);
            }
        }

        if (/^reset\s+(stats|metrics)$/i.test(userInput)) {
            metrics.reset();
            return message.reply("✅ Metrics udah di-reset.");
        }

        if (/^list\s+dynamic$|^dynamic\s+list$|^lihat\s+(semua\s+)?(file|dynamic)/i.test(userInput)) {
            try {
                const details = await listDynamicCommandDetails();
                if (details.length === 0) {
                    return message.reply("📂 Belum ada dynamic command. Minta aja fitur baru, nanti gw bikinin!");
                }
                const lines = [
                    `🧩 **Dynamic Commands (${details.length}):**`,
                    ``,
                ];
                for (const d of details) {
                    const sizeKb = (d.sizeBytes / 1024).toFixed(2);
                    const created = new Date(d.createdAt).toLocaleString("id-ID");
                    const status = d.loaded ? "🟢 loaded" : "⚪ unloaded";
                    const fileName = path.basename(d.filePath);
                    lines.push(`**${d.name}** ${status}`);
                    lines.push(`  📄 \`${fileName}\` (${sizeKb} KB)`);
                    lines.push(`  📅 Dibuat: ${created}`);
                    lines.push(`  💡 ${d.summary}`);
                    lines.push(``);
                }
                const text = lines.join("\n");
                return message.reply(text.length > 1900 ? text.slice(0, 1900) + "…" : text);
            } catch (err) {
                logger.error("dynamic.list_failed", { error: err?.message });
                return message.reply("❌ Gagal baca info dynamic commands.");
            }
        }

        // Vision: try sending with image first. If the provider rejects because
        // the active model doesn't support images, transparently retry as
        // text-only and prepend a friendly notice to the AI explanation.
        // We deliberately do NOT pre-check model capabilities here — the
        // provider is the single source of truth. New models "just work".
        const imageUrls = await extractImageFromMessage(message);
        const currentModel = process.env.ACTIVE_MODEL || "openai/gpt-4o-mini";
        if (imageUrls.length > 0) {
            logger.info("vision.images_detected", { count: imageUrls.length, model: currentModel });
        }

        const cdTag = pickCooldownTag({ 0: { action: "PREVIEW" } });
        const cd = cooldown.check(message.author.id, null);
        if (!cd.allowed) {
            return message.reply(`⏳ Sabar bro, ${cd.reason}.`);
        }

        const guildLock = processingLock.get(message.guild.id);
        if (guildLock) {
            return message.reply(
                `Sabar WOI, satu-satu... Gue lagi kerjain perintahnya <@${guildLock}> nih! ✋`
            );
        }

        processingLock.set(message.guild.id, message.author.id);
        metrics.recordRequest({ userId: message.author.id, guildId: message.guild.id });

        try {
            await message.channel.sendTyping();
            progressMsg = await message.reply(
                "⏳ Sabar ya Bos, gue lagi mikir dan ngerjain request lu... Kalo banyak mintanya makin lama kelarnya. Pantengin terus!"
            );

            // Attempt 1: send with images
            let aiResult = await getAiInstruction(userInput, imageUrls);

            // If the provider told us the model doesn't support images,
            // silently retry as text-only and remember to notify the user.
            let visionNotice = null;
            if (aiResult.isError && isVisionUnsupportedError(aiResult.rawError)) {
                logger.warn("vision.model_unsupported_fallback", {
                    model: currentModel,
                    error: aiResult.rawError?.message ?? String(aiResult.rawError),
                });
                visionNotice = visionUnsupportedMessage(currentModel);
                if (progressMsg) {
                    await progressMsg
                        .edit("⚠️ Model nggak support image, fallback ke text-only...")
                        .catch(() => {});
                }
                aiResult = await getAiInstruction(userInput, []);
            }

            // If we fell back, prepend the vision notice to the AI's explanation
            // so the user understands why the picture wasn't described.
            if (visionNotice && !aiResult.isError) {
                const originalExplanation = aiResult.aiExplanation ?? "";
                aiResult = {
                    ...aiResult,
                    aiExplanation: `${visionNotice}\n\n${originalExplanation}`,
                };
            }

            instruction = aiResult;
        } catch (err) {
            processingLock.delete(message.guild.id);
            logger.error("ai.call.threw", { error: err?.message });
            if (progressMsg) return progressMsg.edit("❌ Gagal kontak otak AI. Coba lagi!");
            return message.reply("❌ Gagal kontak otak AI. Coba lagi!");
        }

        const actionTag = pickCooldownTag(instruction);
        if (actionTag) cooldown.consume(message.author.id, actionTag);
        else cooldown.consume(message.author.id, null);

        // Intercept DYNAMIC_REQUEST — show confirmation before generating code.
        const dynReq = pickDynamicRequest(instruction);
        if (dynReq) {
            processingLock.delete(message.guild.id);
            if (progressMsg) await progressMsg.edit("🔧 Lagi ngecek fitur baru...").catch(() => {});
            return askDynamicConfirmation(message, dynReq);
        }
    }

    try {
        if (instruction.isError) {
            if (progressMsg) return progressMsg.edit(`❌ ${instruction.message}`);
            return message.reply(`❌ ${instruction.message}`);
        }

        if (!progressMsg) {
            progressMsg = await message.reply("⏳ Melanjutkan proses eksekusi...");
        }

        await message.channel.sendTyping();
        const resultMessage = await executeAiAction(message, instruction);
        const finalMessage = resultMessage?.trim() || "✅ Beres bos!";

        try {
            let sentMsg;
            if (finalMessage.length > 1900) {
                const chunks = finalMessage.match(/.{1,1900}/gs) || [];
                for (let i = 0; i < chunks.length; i++) {
                    if (i === 0 && progressMsg) {
                        sentMsg = await progressMsg.edit(chunks[i]);
                    } else {
                        sentMsg = await message.channel.send(chunks[i]);
                    }
                }
            } else {
                if (progressMsg) {
                    sentMsg = await progressMsg
                        .edit(finalMessage)
                        .catch(() => message.reply(finalMessage));
                } else {
                    sentMsg = await message.reply(finalMessage).catch(() =>
                        message.channel.send(finalMessage)
                    );
                }
            }

            if (finalMessage.includes("?") || finalMessage.toLowerCase().includes("mana")) {
                if (sentMsg) saveContext(sentMsg.id, message.author.id, message.channel.id, instruction);
            }
        } catch (sendError) {
            logger.error("reply.send_failed", { error: sendError.message });
        }
    } catch (error) {
        logger.error("execution.failed", { error: error?.message, stack: error?.stack });
        try {
            message.reply("Waduh, ada error pas AI nyoba mikir. Cek konsol!").catch(() => {});
        } catch (e) {}
    } finally {
        processingLock.delete(message.guild.id);
    }
});

async function gracefulShutdown(signal) {
    logger.info("shutdown.signal_received", { signal });

    try {
        scheduler.stop();
    } catch (err) {
        logger.warn("shutdown.scheduler_error", { error: err?.message });
    }

    try {
        cooldown.destroy();
        clearAllContext();
    } catch (err) {
        logger.warn("shutdown.cleanup_error", { error: err?.message });
    }

    try {
        await client.destroy();
        logger.info("shutdown.client_destroyed");
    } catch (err) {
        logger.warn("shutdown.client_destroy_error", { error: err?.message });
    }

    logger.info("shutdown.complete");
    setTimeout(() => process.exit(0), 200).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
    logger.error("unhandled_rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
    });
});

process.on("uncaughtException", (err) => {
    logger.error("uncaught_exception", { error: err?.message, stack: err?.stack });
});

client.login(process.env.TOKEN_BOT).catch((err) => {
    logger.error("login.failed", { error: err?.message });
    console.error("❌ Gagal login ke Discord. Cek TOKEN_BOT di .env");
    process.exit(1);
});