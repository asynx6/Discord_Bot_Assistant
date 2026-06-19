import { PermissionFlagsBits, ChannelType } from "discord.js";

const RATE_LIMIT_DELAY = 500;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function lockChannelHandler(message, instruction) {
    const { name, names, reason, lockAll, except } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Gue gak punya izin **Manage Channels**. Kasih dulu!";
    }

    const targets = [];

    if (lockAll === true) {
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

        const lockableChannels = message.guild.channels.cache.filter(c =>
            (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice ||
             c.type === ChannelType.GuildAnnouncement || c.type === ChannelType.GuildStageVoice ||
             c.type === ChannelType.GuildForum) &&
            !exceptIds.has(c.id) &&
            botMember.permissionsIn(c).has(PermissionFlagsBits.ManageChannels)
        );

        if (lockableChannels.size === 0) {
            return "Semua channel yang ada masuk daftar pengecualian atau gue gak punya akses ke sana. Jadi gak ada yang bisa gue gembok, Bos.";
        }

        let lockedCount = 0;

        for (const [, channel] of lockableChannels) {
            try {
                const denyPerms = { SendMessages: false, AddReactions: false };
                if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
                    denyPerms.Connect = false;
                    denyPerms.Speak = false;
                }
                await channel.permissionOverwrites.edit(
                    message.guild.roles.everyone,
                    denyPerms,
                    { reason: reason || "Mass lock oleh Asisten AI" }
                );
                lockedCount++;
                await sleep(RATE_LIMIT_DELAY);
            } catch {}
        }

        let laporan = `🔒 **LOCKDOWN!** Total **${lockedCount}** channel udah gue gembok semua!`;
        if (exceptIds.size > 0) {
            laporan += `\n🛡️ Channel yang gak digembok: ${[...exceptIds].map(id => `<#${id}>`).join(", ")}`;
        }
        return laporan;
    }

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
            const denyPerms = { SendMessages: false, AddReactions: false };

            if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
                denyPerms.Connect = false;
                denyPerms.Speak = false;
            }

            await channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                denyPerms,
                { reason: reason || "Channel dikunci oleh Asisten AI" }
            );
            results.push(`🔒 Channel <#${channel.id}> udah gue gembok!`);
        } catch (error) {
            console.error("Gagal lock channel:", error);
            results.push(`❌ Gagal kunci channel <#${channel.id}>.`);
        }
    }

    return results.join("\n");
}
