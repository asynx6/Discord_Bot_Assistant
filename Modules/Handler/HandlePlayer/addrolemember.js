import { PermissionFlagsBits } from "discord.js";
import { getMembersFromInstruction } from "../utils.js";

export async function addrolememberHandler(message, instruction) {
    const { newName, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "Gue butuh izin **Manage Roles**!";
    }

    const role = message.guild.roles.cache.find(r => 
        r.id === newName?.replace(/[<@&>]/g, "") || 
        r.name.toLowerCase() === newName?.toLowerCase()
    );

    if (!role) return `Role **${newName}** gak ketemu bos.`;
    if (role.position >= botMember.roles.highest.position) return `Role itu lebih tinggi dari gue, gak bisa gue bagi-bagi!`;

    const members = await getMembersFromInstruction(message, instruction);
    if (members.length === 0) return "Gak ada member yang ketemu buat dikasih role.";

    const results = [];
    for (const member of members) {
        try {
            await member.roles.add(role, reason || "Role added by AI");
            results.push(`Role **${role.name}** udah nempel di **${member.user.tag}**.`);
        } catch (e) {
            results.push(`Gagal ngasih role ke **${member.user.tag}**.`);
        }
    }
    return results.join("\n");
}