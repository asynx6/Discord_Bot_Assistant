import { PermissionFlagsBits, ChannelType } from "discord.js";

export async function createkategoriHandler(message, instruction) {
    const { permissions, reason } = instruction;
    const name = instruction.name || instruction.categoryName;
    const botMember = message.guild.members.me;

    if (!name) return "Kategori mana yang mau dibuat, Oii? Kasih nama dong.";

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Gue gak punya izin **Manage Channels**. Kasih dulu biar gue bisa bikin kategori!";
    }

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
        if (permissionOverwrites.length > 0) logs.push("settingan gembok khusus");
    }

    try {
        const category = await message.guild.channels.create({
            name: name,
            type: ChannelType.GuildCategory,
            permissionOverwrites,
            reason: reason || "Dibuat oleh Asisten AI"
        });
        let laporan = `Kategori **${category.name}** udah berhasil gue buat`;
        
        if (logs.length > 0) {
            laporan += ` lengkap dengan ${logs.join(" dan ")}!`;
        } else {
            laporan += `!`;
        }

        return laporan;

    } catch (error) {
        console.error("Gagal create kategori:", error);
        return "Gagal pas nyoba bikin kategori baru, cek terminal deh.";
    }
}