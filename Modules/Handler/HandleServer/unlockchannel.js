import { PermissionFlagsBits, ChannelType } from "discord.js";

const RATE_LIMIT_DELAY = 500;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function unlockChannelHandler(message, instruction) {
    const { name, names, reason, unlockAll, except } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Gue gak punya izin **Manage Channels**. Kasih dulu!";
    }

    if (unlockAll === true) {
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

        const unlockableChannels = message.guild.channels.cache.filter(c =>
            (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice ||
             c.type === ChannelType.GuildAnnouncement || c.type === ChannelType.GuildStageVoice) &&
            !exceptIds.has(c.id) &&
            botMember.permissionsIn(c).has(PermissionFlagsBits.ManageChannels)
        );

        if (unlockableChannels.size === 0) {
            return "Semua channel yang ada masuk daftar pengecualian atau gue gak punya akses ke sana. Jadi gak ada yang bisa gue unlock, Bos.";
        }

        let unlockedCount = 0;

        for (const [, channel] of unlockableChannels) {
            try {
                const resetPerms = { SendMessages: null, AddReactions: null };
                if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
                    resetPerms.Connect = null;
                    resetPerms.Speak = null;
                }
                await channel.permissionOverwrites.edit(
                    message.guild.roles.everyone,
                    resetPerms,
                    { reason: reason || "Mass unlock oleh Asisten AI" }
                );
                unlockedCount++;
                await sleep(RATE_LIMIT_DELAY);
            } catch {}
        }

        let laporan = `🔓 **LOCKDOWN SELESAI!** Total **${unlockedCount}** channel udah gue buka semua!`;
        if (exceptIds.size > 0) {
            laporan += `\n🛡️ Channel yang tetep digembok: ${[...exceptIds].map(id => `<#${id}>`).join(", ")}`;
        }
        return laporan;
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
            const resetPerms = { SendMessages: null, AddReactions: null };

            if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
                resetPerms.Connect = null;
                resetPerms.Speak = null;
            }

            await channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                resetPerms,
                { reason: reason || "Channel dibuka oleh Asisten AI" }
            );
            results.push(`🔓 Channel <#${channel.id}> udah gue buka kuncinya!`);
        } catch (error) {
            console.error("Gagal unlock channel:", error);
            results.push(`❌ Gagal buka kunci <#${channel.id}>.`);
        }
    }

    return results.join("\n");
}
