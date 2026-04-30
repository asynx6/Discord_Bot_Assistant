import { PermissionFlagsBits } from "discord.js";
import { getMembersFromInstruction } from "../utils.js";

export async function muteMemberHandler(message, instruction) {
    const { reason, duration } = instruction; // duration in minutes
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return "Gue butuh izin **Moderate Members** (Timeout) buat nyumpel orang!";
    }

    const members = await getMembersFromInstruction(message, instruction);
    if (members.length === 0) return "Gak nemu orang yang mau dibungkam.";

    const time = (duration || 10) * 60 * 1000;
    const results = [];

    for (const member of members) {
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            results.push(`❌ Gak berani gue mute **${member.user.tag}**, rolenya tinggi.`);
            continue;
        }

        try {
            await member.timeout(time, reason || "Timeout by AI Assistant");
            results.push(`🔇 **${member.user.tag}** berhasil gue bungkam selama ${duration || 10} menit.`);
        } catch (error) {
            results.push(`❌ Gagal nyumpel **${member.user.tag}**.`);
        }
    }
    return results.join("\n");
}