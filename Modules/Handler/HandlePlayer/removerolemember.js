import { PermissionFlagsBits } from "discord.js";
import { getMembersFromInstruction } from "../utils.js";

export async function removerolememberHandler(message, instruction) {
    const { newName, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "Izin **Manage Roles** gue gak ada!";
    }

    const role = message.guild.roles.cache.find(r => 
        r.id === newName?.replace(/[<@&>]/g, "") || 
        r.name.toLowerCase() === newName?.toLowerCase()
    );

    if (!role) return `Role **${newName}** gak ketemu.`;

    const members = await getMembersFromInstruction(message, instruction);
    const results = [];

    for (const member of members) {
        try {
            await member.roles.remove(role, reason || "Role removed by AI");
            results.push(`🗑️ Role **${role.name}** udah gue cabut dari **${member.user.tag}**.`);
        } catch (e) {
            results.push(`❌ Gagal nyabut role dari **${member.user.tag}**.`);
        }
    }
    return results.join("\n");
}