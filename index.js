import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import path from "node:path";
import { getAiInstruction, generateDynamicCode, regenerateWithErrorContext } from "./Modules/aiHandler.js";
import {
    extractImageFromMessage,
    supportsVision,
    visionUnsupportedMessage,
    resolveVisionModel,
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

let envConfig;
try {
    envConfig = validateEnv({ strict: false });
    logger.info("env.validated", {
        hasOpenRouter: envConfig.hasOpenRouter,
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
          `Reply **Ya** untuk pakai yang ada, atau **Tidak** untuk batal.`
        : `🔧 Fitur **${safeName}** belum ada nih.\n\n` +
          `Intent: ${req.intent || "(tidak ada deskripsi)"}\n` +
          `Request asli: "${req.originalQuery || ""}"\n\n` +
          `Bot bakal:\n` +
          `  1. 🤖 Generate kode JavaScript via AI\n` +
          `  2. 🔍 Validasi syntax + safety\n` +
          `  3. 💾 Simpan ke \`commands/dynamic/handle_${safeName}.js\`\n` +
          `  4. ⚡ Hot-reload & langsung bisa dipake\n\n` +
          `Reply **Ya** untuk lanjut, atau **Tidak** untuk batal.`;

    try {
        const sent = await message.reply(prompt);
        saveContext(sent.id, message.author.id, message.channel.id, {
            __awaitingDynamicConfirm: true,
            suggestedName: safeName,
            intent: req.intent,
            originalQuery: req.originalQuery,
        });
    } catch (err) {
        logger.error("dynamic.confirm_send_failed", { error: err?.message });
    }
}

async function handleDynamicConfirmation(message, ctx) {
    const { suggestedName, intent, originalQuery } = ctx;
    const MAX_HEAL_ATTEMPTS = 3;
    let lastCode = null;
    let lastError = null;

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

client.once("clientReady", () => {
    logger.info("bot.ready", {
        tag: client.user.tag,
        guildCount: client.guilds.cache.size,
    });
    console.log(`✅ Bot online sebagai: ${client.user.tag}`);
    console.log(`📡 Tersambung ke ${client.guilds.cache.size} server`);

    client.user.setActivity("Discord Bot Asistant", { type: ActivityType.Listening });
});

client.on("error", (err) => {
    logger.error("client.error", { error: err?.message });
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

        // Vision detection — extract image URLs from attachments or reply references
        const imageUrls = await extractImageFromMessage(message);
        if (imageUrls.length > 0) {
            const currentModel = process.env.ACTIVE_MODEL || "openai/gpt-4o-mini";
            if (!supportsVision(currentModel)) {
                return message.reply(visionUnsupportedMessage(currentModel));
            }
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
            instruction = await getAiInstruction(userInput);
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