import { PermissionFlagsBits } from "discord.js";
import { getMembersFromInstruction } from "../utils.js";

export async function banMemberHandler(message, instruction) {
    const { reason, duration } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        return "Gue gak punya izin buat nge-ban orang, bos!";
    }

    const members = await getMembersFromInstruction(message, instruction);
    if (members.length === 0) return "Gak ada orang yang ketemu buat dibuang.";

    const results = [];
    for (const member of members) {
        if (member.id === message.guild.ownerId) {
            results.push(`Gila lo ya? Gue gak bisa nge-ban Owner server!`);
            continue;
        }
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            results.push(`Role **${member.user.tag}** lebih tinggi/setara sama gue, gak berani sentuh!`);
            continue;
        }

        try {
            await member.ban({ reason: reason || "Banned by AI Assistant" });
            results.push(`**${member.user.tag}** berhasil gue tendang keluar server!`);
        } catch (error) {
            results.push(`Gagal nge-ban **${member.user.tag}**.`);
        }
    }

    return results.join("\n");
}