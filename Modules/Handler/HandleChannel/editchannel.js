import { PermissionFlagsBits, ChannelType } from "discord.js";

export async function editchannelHandler(message, instruction) {
    const { name, newName, category, permissions, reason, moveTo, userLimit } = instruction;
    const botMember = message.guild.members.me;

    if (!name) return "Channel mana yang mau diedit? Kasih tau namanya dulu dong, biar gue gak bingung.";

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Izin **Manage Channels** gue belum nyala nih. Bukain dulu biar gue bisa otak-atik channel-nya!";
    }

    const channel = message.guild.channels.cache.find(c => 
        (c.id === name.replace(/[<#@&>]/g, "") || c.name.toLowerCase() === name.toLowerCase()) && 
        c.type !== ChannelType.GuildCategory
    );

    if (!channel) return `Waduh, channel **${name}** gak ketemu di server ini. Coba cek lagi deh tulisannya!`;

    try {
        const updateData = { reason: reason || "Diedit oleh Asisten AI" };
        const logs = [];

        if (newName) {
            updateData.name = newName;
            logs.push("namanya");
        }

        if (userLimit !== undefined && channel.type === ChannelType.GuildVoice) {
            const limit = Math.max(0, Math.min(99, parseInt(userLimit)));
            updateData.userLimit = limit;
            logs.push(`limit user jadi **${limit === 0 ? 'unlimited' : limit}**`);
        }

        if (category) {
            const parent = message.guild.channels.cache.find(c => 
                (c.name.toLowerCase() === category.toLowerCase() || c.id === category.replace(/[<#@&>]/g, "")) && 
                c.type === ChannelType.GuildCategory
            );
            if (parent) {
                updateData.parent = parent.id;
                logs.push(`pindah ke kategori **${parent.name}**`);
            }
        }

        if (moveTo && moveTo.target) {
            const targetChannel = message.guild.channels.cache.find(c => 
                c.id === moveTo.target.replace(/[<#@&>]/g, "") || 
                c.name.toLowerCase() === moveTo.target.toLowerCase()
            );

            if (targetChannel) {
                let newPosition = targetChannel.position;
                if (moveTo.direction === "above") {
                    newPosition = Math.max(0, targetChannel.position - 1);
                    logs.push(`geser ke atas **${targetChannel.name}**`);
                } else {
                    newPosition = targetChannel.position + 1;
                    logs.push(`geser ke bawah **${targetChannel.name}**`);
                }
                updateData.position = newPosition;
            }
        }

        if (permissions && Array.isArray(permissions)) {
            const permissionOverwrites = [];
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
                    permissionOverwrites.push({ id: roleTarget.id, allow, deny });
                }
            }
            if (permissionOverwrites.length > 0) {
                updateData.permissionOverwrites = permissionOverwrites;
                logs.push("settingan gembok");
            }
        }

        const updatedChannel = await channel.edit(updateData);
        let laporan = `Beres! Channel <#${updatedChannel.id}> udah gue update`;
        
        if (logs.length > 0) {
            laporan += ` bagian **${logs.join(", ")}** ya. Sekarang makin rapi deh!`;
        } else {
            laporan += ` tapi kayaknya gak ada yang berubah dari sebelumnya.`;
        }

        return laporan;

    } catch (error) {
        console.error("Gagal edit channel:", error);
        return "Aduh, pas lagi mau edit channel malah ada kendala. Coba cek terminal deh!";
    }
}