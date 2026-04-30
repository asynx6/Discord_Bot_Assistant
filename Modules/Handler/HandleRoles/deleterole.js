import { PermissionFlagsBits } from "discord.js";

const RATE_LIMIT_DELAY = 600;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function deleterolehandler(message, instruction) {
    const target = instruction.name || instruction.roleName;
    const { deleteAll, except, reason, names } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "Gue gak punya izin **Manage Roles**. Kasih dulu lah biar bisa bersih-bersih!";
    }

    if (deleteAll === true) {
        const exceptNames = new Set();
        if (except && Array.isArray(except)) {
            for (const ex of except) {
                exceptNames.add(ex.toLowerCase().replace(/[<@&>]/g, ""));
            }
        }

        await message.guild.roles.fetch();

        const exceptArray = [...exceptNames];

        const deletableRoles = [...message.guild.roles.cache.values()]
            .filter(r => {
                if (r.id === message.guild.id) return false;
                if (r.managed) return false;
                if (!r.editable) return false;
                
                for (const ex of exceptArray) {
                    if (r.id === ex || r.name.toLowerCase().includes(ex)) return false;
                }
                return true;
            })
            .sort((a, b) => a.position - b.position);

        if (deletableRoles.length === 0) {
            return "Semua role yang ada adalah role penting (Bot/System), posisinya di atas gue, atau masuk daftar pengecualian. Jadi gak ada yang bisa gue sikat, Bos.";
        }

        let deletedCount = 0;
        const failLogs = [];

        for (const role of deletableRoles) {
            try {
                await role.delete(reason || "Mass delete role oleh Asisten AI");
                deletedCount++;
                await sleep(RATE_LIMIT_DELAY);
            } catch (err) {
                if (err.code === 10011 || err.message?.includes("Unknown Role")) {
                    deletedCount++;
                } else {
                    failLogs.push(`❌ **${role.name}**: ${err.message}`);
                }
            }
        }

        let laporan = `🔥 **${deletedCount}** role udah gue sikat habis dari server!`;
        if (exceptNames.size > 0) {
            laporan += `\n🛡️ Role yang diselamatin: ${[...exceptNames].join(", ")}`;
        }
        if (failLogs.length > 0) {
            laporan += `\n\n⚠️ Catatan:\n${failLogs.join("\n")}`;
        }

        return laporan;
    }

    const targets = [];
    if (target) targets.push(target);
    if (names && Array.isArray(names)) targets.push(...names);

    if (targets.length === 0) return "Role mana yang mau dihapus, Oii? Kasih nama atau tag-nya dong.";

    const results = [];

    for (const t of targets) {
        const role = message.guild.roles.cache.find(r =>
            r.id === t.replace(/[<@&>]/g, "") ||
            r.name.toLowerCase() === t.toLowerCase()
        );

        if (!role) {
            results.push(`⚠️ Role **${t}** gak ketemu.`);
            continue;
        }

        if (!role.editable) {
            results.push(`⚠️ Gue gak bisa hapus role **${role.name}**. Posisinya lebih tinggi dari gue!`);
            continue;
        }

        try {
            const deletedName = role.name;
            await role.delete(reason || "Dihapus oleh Asisten AI");
            results.push(`🗑️ Role **${deletedName}** udah gue hapus!`);
        } catch (error) {
            if (error.code !== 10011) {
                results.push(`❌ Gagal hapus role **${role.name}**.`);
            }
        }
    }

    return results.join("\n");
}