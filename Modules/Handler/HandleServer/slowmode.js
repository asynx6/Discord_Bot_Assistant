import { PermissionFlagsBits, ChannelType } from "discord.js";

const RATE_LIMIT_DELAY = 500;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function slowmodeHandler(message, instruction) {
    const { name, names, duration, reason, applyAll, except } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Gue gak punya izin **Manage Channels**. Kasih dulu!";
    }

    const seconds = Math.max(0, Math.min(21600, parseInt(duration) || 0));

    if (applyAll === true) {
        const exceptIds = new Set();
        if (except && Array.isArray(except)) {
            for (const ex of except) {
                const cleanId = ex.replace(/[<#@&>]/g, "");
                const found = message.guild.channels.cache.find(c =>
                    c.id === cleanId || c.name.toLowerCase().includes(ex.toLowerCase())
                );
                if (found) exceptIds.add(found.id);
                else exceptIds.add(cleanId);
            }
        }

        const textChannels = message.guild.channels.cache.filter(c =>
            (c.type === ChannelType.GuildText || c.type === ChannelType.GuildForum) &&
            !exceptIds.has(c.id) &&
            botMember.permissionsIn(c).has(PermissionFlagsBits.ManageChannels)
        );

        if (textChannels.size === 0) {
            return "Semua text channel yang ada masuk daftar pengecualian atau gue gak punya akses ke sana. Jadi gak ada yang bisa gue atur slowmode-nya, Bos.";
        }

        let count = 0;
        for (const [, channel] of textChannels) {
            try {
                await channel.setRateLimitPerUser(seconds, reason || "Mass slowmode oleh Asisten AI");
                count++;
                await sleep(RATE_LIMIT_DELAY);
            } catch {}
        }

        const display = seconds === 0 ? "OFF"
            : seconds >= 3600 ? `${Math.floor(seconds / 3600)} jam`
            : seconds >= 60 ? `${Math.floor(seconds / 60)} menit`
            : `${seconds} detik`;

        return seconds === 0
            ? `⚡ Slowmode udah gue matiin di **${count}** channel! Free flow lagi deh.`
            : `🐢 Slowmode **${display}** udah gue pasang di **${count}** channel sekaligus!`;
    }

    const targets = [];
    if (names && Array.isArray(names)) targets.push(...names);
    else if (name) targets.push(name);

    if (targets.length === 0) targets.push(null);

    const results = [];

    for (const target of targets) {
        const channel = target
            ? message.guild.channels.cache.find(c =>
                c.id === target.replace(/[<#>]/g, "") ||
                c.name.toLowerCase() === target.toLowerCase()
            )
            : message.channel;

        if (!channel) {
            results.push(`⚠️ Channel **${target}** gak ketemu.`);
            continue;
        }

        try {
            await channel.setRateLimitPerUser(seconds, reason || "Slowmode oleh Asisten AI");

            if (seconds === 0) {
                results.push(`⚡ Slowmode di <#${channel.id}> udah gue matiin!`);
            } else {
                const display = seconds >= 3600 ? `${Math.floor(seconds / 3600)} jam`
                    : seconds >= 60 ? `${Math.floor(seconds / 60)} menit`
                    : `${seconds} detik`;
                results.push(`🐢 Slowmode <#${channel.id}> udah gue set ke **${display}**.`);
            }
        } catch (error) {
            console.error("Gagal set slowmode:", error);
            results.push(`❌ Gagal set slowmode di <#${channel.id}>.`);
        }
    }

    return results.join("\n");
}
