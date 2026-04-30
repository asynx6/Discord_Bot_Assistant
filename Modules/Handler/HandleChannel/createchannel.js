import { PermissionFlagsBits, ChannelType } from "discord.js";

const channelMap = {
    'TEXT': ChannelType.GuildText,
    'VOICE': ChannelType.GuildVoice,
    'CATEGORY': ChannelType.GuildCategory,
    'ANNOUNCEMENT': ChannelType.GuildAnnouncement,
    'STAGE': ChannelType.GuildStageVoice,
    'FORUM': ChannelType.GuildForum
};

export async function createChannelHandler(message, instruction) {
    const { name, type, category, newName, permissions, reason, userLimit } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Izin **Manage Channels** gue gak ada, bos!";
    }

    if (!name) return "Nama channel-nya apa nih?";

    const permissionOverwrites = [];
    const logs = [];

    if (permissions && Array.isArray(permissions)) {
        for (const perm of permissions) {
            if (typeof perm !== "object" || !perm.role) continue;
            
            const roleTarget = message.guild.roles.cache.find(r =>
                r.id === perm.role.replace(/[<@&>]/g, "") ||
                r.name.toLowerCase() === perm.role.toLowerCase() ||
                (perm.role.toLowerCase() === "@everyone" && r.id === message.guild.id)
            );

            if (roleTarget) {
                const allow = (perm.allow || []).map(p => PermissionFlagsBits[p]).filter(p => p != null);
                const deny = (perm.deny || []).map(p => PermissionFlagsBits[p]).filter(p => p != null);

                permissionOverwrites.push({
                    id: roleTarget.id,
                    allow: allow,
                    deny: deny,
                });
            }
        }
    }

    try {
        const parentTarget = category || newName;
        let parent = null;

        if (parentTarget) {
            parent = message.guild.channels.cache.find(c =>
                (c.name.toLowerCase() === parentTarget.toLowerCase() || c.id === parentTarget.replace(/[<#@&>]/g, "")) &&
                c.type === ChannelType.GuildCategory
            );

            if (!parent) {
                parent = message.guild.channels.cache.find(c =>
                    c.name.toLowerCase().includes(parentTarget.toLowerCase()) &&
                    c.type === ChannelType.GuildCategory
                );
            }
        }

        const channelType = channelMap[type?.toUpperCase()] || ChannelType.GuildText;

        const createData = {
            name,
            type: channelType,
            parent: parent ? parent.id : null,
            permissionOverwrites,
            reason: reason || "Dibuat oleh Asisten AI"
        };

        if (channelType === ChannelType.GuildVoice && userLimit !== undefined) {
            const limit = Math.max(0, Math.min(99, parseInt(userLimit)));
            createData.userLimit = limit;
            logs.push(`limit **${limit === 0 ? 'unlimited' : limit + ' user'}**`);
        }

        const channel = await message.guild.channels.create(createData);

        if (parent) logs.push(`kategori **${parent.name}**`);

        let laporan = `Channel <#${channel.id}> berhasil dibuat!`;
        if (logs.length > 0) laporan += ` (Setting: ${logs.join(", ")})`;

        return laporan;

    } catch (error) {
        console.error("Gagal create channel:", error);
        return "Gagal bikin channel. Cek terminal!";
    }
}