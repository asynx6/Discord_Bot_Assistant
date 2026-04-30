import { PermissionFlagsBits } from "discord.js";

export async function editRoleHandler(message, instruction) {
    const { name, color, permissions, reason, displaySeparately, allowMention, moveTo, newName } = instruction;
    const botMember = message.guild.members.me;

    if (!name) return "Role mana yang mau diedit? Kasih tau namanya dulu!";

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "Gue gak punya izin **Manage Roles** buat ngedit role!";
    }

    const role = message.guild.roles.cache.find(r =>
        r.name.toLowerCase() === name.toLowerCase() || r.id === name.replace(/[<@&>]/g, "")
    );

    if (!role) return `Role **${name}** gak ketemu di server ini!`;

    if (!role.editable) return `Gue gak punya kuasa buat edit role **${role.name}**. Posisinya di atas gue!`;

    try {
        const updateData = { reason: reason || "Diedit oleh Asisten AI" };
        const changes = [];

        if (newName) {
            updateData.name = newName;
            changes.push("namanya");
        }

        if (moveTo && moveTo.target) {
            const targetRole = message.guild.roles.cache.find(r =>
                r.name.toLowerCase() === moveTo.target.toLowerCase() ||
                r.id === moveTo.target.replace(/[<@&>]/g, "")
            );

            if (targetRole) {
                if (targetRole.position >= botMember.roles.highest.position) {
                    return `Gue gak bisa mindahin role ke situ karena posisi role **${targetRole.name}** melampaui jabatan gue!`;
                }

                let newPosition;
                if (moveTo.direction === "above") {
                    newPosition = targetRole.position + 1;
                    changes.push(`posisi (ke atas **${targetRole.name}**)`);
                } else {
                    newPosition = Math.max(1, targetRole.position - 1);
                    changes.push(`posisi (ke bawah **${targetRole.name}**)`);
                }

                await role.setPosition(newPosition);
            }
        }

        if (color) {
            updateData.color = color;
            changes.push("warnanya");
        }

        if (displaySeparately !== undefined) {
            updateData.hoist = displaySeparately;
            changes.push(displaySeparately ? "display rolenya udah nyala" : "display rolenya udah mati");
        }

        if (allowMention !== undefined) {
            updateData.mentionable = allowMention;
            changes.push(allowMention ? "Mention Role udah nyala" : "Mention Role udah mati");
        }

        if (permissions && Array.isArray(permissions)) {
            const permData = permissions[0];
            if (permData) {
                const allowFlags = (permData.allow || []).map(p => PermissionFlagsBits[p]).filter(p => p != null);

                if (allowFlags.length > 0) {
                    updateData.permissions = allowFlags.reduce((all, p) => all | p, role.permissions.bitfield);
                    changes.push("permission-nya");
                }
            }
        }

        const updatedRole = await role.edit(updateData);

        let laporan = `Role <@&${updatedRole.id}> udah berhasil gue rombak`;

        if (changes.length > 0) {
            laporan += ` bagian **${changes.join(", ")}** yaa`;
        } else {
            laporan += ` tapi setelah gue cek gak ada perubahan apa-apa.`;
        }

        return laporan;

    } catch (error) {
        console.error("Gagal edit role:", error);
        return "Terjadi masalah pas mau edit role itu. Coba cek log terminal deh.";
    }
}