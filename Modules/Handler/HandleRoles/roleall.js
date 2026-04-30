import { PermissionFlagsBits } from "discord.js";

const RATE_LIMIT_DELAY = 250;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function roleAllHandler(message, instruction) {
    const { name, filterType, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "Gue butuh izin **Manage Roles** buat aksi massal ini!";
    }

    const role = message.guild.roles.cache.find(r =>
        r.id === name?.replace(/[<@&>]/g, "") ||
        r.name.toLowerCase() === name?.toLowerCase()
    );

    if (!role) return `Role **"${name}"** gak ketemu di server.`;
    if (role.position >= botMember.roles.highest.position) return `Role **${role.name}** lebih tinggi atau setara sama role gue, gak berani sentuh!`;

    try {
        await message.guild.members.fetch();
        const members = message.guild.members.cache;

        let count = 0;
        let failCount = 0;
        const isAdd = filterType?.toUpperCase() !== "REMOVE";

        for (const [id, member] of members) {
            if (member.user.bot) continue;

            try {
                if (isAdd && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role, reason || "Mass Role by AI");
                    count++;
                } else if (!isAdd && member.roles.cache.has(role.id)) {
                    await member.roles.remove(role, reason || "Mass Role by AI");
                    count++;
                }
            } catch (memberErr) {
                failCount++;
            }

            if (count % 5 === 0 && count > 0) {
                await sleep(RATE_LIMIT_DELAY);
            }
        }

        let result = `⚡ SAKTI! Gue udah ${isAdd ? 'nambahin' : 'nyabut'} role **${role.name}** ke **${count} member** sekaligus!`;
        if (failCount > 0) result += `\n⚠️ ${failCount} member gagal diproses.`;

        return result;
    } catch (error) {
        console.error("Gagal role all:", error);
        return "Ada kendala pas lagi bagi-bagi role massal. Cek terminal!";
    }
}
