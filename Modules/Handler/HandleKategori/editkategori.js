import { PermissionFlagsBits, ChannelType } from "discord.js";

export async function editkategoriHandler(message, instruction) {
    const { name, newName, permissions, reason, moveTo } = instruction;
    const targetName = name || instruction.categoryName;
    const botMember = message.guild.members.me;

    if (!targetName) return "Kategori mana yang mau diedit? Kasih namanya dong.";

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Gue gak punya izin **Manage Channels** buat ngedit kategori!";
    }

    const category = message.guild.channels.cache.find(c => 
        (c.id === targetName.replace(/[<#@&>]/g, "") || c.name.toLowerCase() === targetName.toLowerCase()) && 
        c.type === ChannelType.GuildCategory
    );

    if (!category) return `Kategori **${targetName}** gak ketemu!`;

    try {
        const updateData = { reason: reason || "Diedit oleh Asisten AI" };
        const logs = [];

        if (newName) {
            updateData.name = newName;
            logs.push("namanya");
        }

        if (moveTo && moveTo.target) {
            const targetCategory = message.guild.channels.cache.find(c => 
                (c.id === moveTo.target.replace(/[<#@&>]/g, "") || c.name.toLowerCase() === moveTo.target.toLowerCase()) &&
                c.type === ChannelType.GuildCategory
            );

            if (targetCategory) {
                let newPosition = targetCategory.position;
                if (moveTo.direction === "above") {
                    newPosition = Math.max(0, targetCategory.position - 1);
                    logs.push(`posisi (ke atas **${targetCategory.name}**)`);
                } else {
                    newPosition = targetCategory.position + 1;
                    logs.push(`posisi (ke bawah **${targetCategory.name}**)`);
                }
                updateData.position = newPosition;
            }
        }

        if (permissions && Array.isArray(permissions)) {
            const permissionOverwrites = [];
            for (const perm of permissions) {
                const roleTarget = message.guild.roles.cache.find(r => 
                    r.id === perm.role.replace(/[<@&>]/g, "") ||
                    r.name.toLowerCase() === perm.role.toLowerCase() || 
                    (perm.role.toLowerCase() === "@everyone" && r.id === message.guild.id)
                );

                if (roleTarget) {
                    const allow = (perm.allow || []).map(p => PermissionFlagsBits[p]).filter(p => p != null);
                    const deny = (perm.deny || []).map(p => PermissionFlagsBits[p]).filter(p => p != null);
                    permissionOverwrites.push({ id: roleTarget.id, allow, deny });
                }
            }
            if (permissionOverwrites.length > 0) {
                updateData.permissionOverwrites = permissionOverwrites;
                logs.push("settingan gemboknya");
            }
        }

        const updatedCategory = await category.edit(updateData);

        let laporan = `Kategori **${updatedCategory.name}** udah gue update`;
        
        if (logs.length > 0) {
            laporan += ` bagian **${logs.join(", ")}** ya!`;
        } else {
            laporan += ` tapi gak ada yang berubah sih.`;
        }

        return laporan;

    } catch (error) {
        console.error("Gagal edit kategori:", error);
        return "Terjadi masalah pas nyoba edit kategori itu. Cek terminal ya.";
    }
}