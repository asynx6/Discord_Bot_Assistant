import { PermissionFlagsBits } from "discord.js";
import { getMembersFromInstruction } from "../utils.js";

export async function KickMemberHandler(message, instruction) {
    const { reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
        return "Izin **Kick Members** gue gak ada, bos!";
    }

    const members = await getMembersFromInstruction(message, instruction);
    if (members.length === 0) return "Gak ada orang yang ketemu buat ditendang.";

    const results = [];
    for (const member of members) {
        if (member.id === message.guild.ownerId) {
            results.push(`❌ Mana bisa gue nendang owner server!`);
            continue;
        }
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            results.push(`❌ Role **${member.user.tag}** terlalu tinggi buat gue.`);
            continue;
        }

        try {
            await member.kick(reason || "Kicked by AI Assistant");
            results.push(`👟 **${member.user.tag}** udah gue tendang keluar!`);
        } catch (error) {
            results.push(`❌ Gagal nendang **${member.user.tag}**.`);
        }
    }
    return results.join("\n");
}