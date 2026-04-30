import { getMembersFromInstruction } from "../utils.js";

export async function warnMemberHandler(message, instruction) {
    const { reason } = instruction;
    const members = await getMembersFromInstruction(message, instruction);

    if (members.length === 0) return "Gak ada member yang ketemu buat di-warn.";

    const results = [];
    for (const member of members) {
        try {
            await member.send(`⚠️ **WARNING dari Server ${message.guild.name}**\nAlasan: ${reason || "Tidak ada alasan spesifik."}`);
            results.push(`✅ **${member.user.tag}** udah diperingatin lewat DM.`);
        } catch (e) {
            results.push(`❌ Gagal ngirim DM ke **${member.user.tag}** (mungkin DM-nya ditutup).`);
        }
    }

    return results.join("\n");
}
