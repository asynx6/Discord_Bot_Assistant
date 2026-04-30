import { PermissionFlagsBits } from "discord.js";

export async function unmuteMemberHandler(message, instruction) {
    const { name, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return "Gue gak punya izin **Moderate Members**. Kasih dulu!";
    }

    const matches = message.guild.members.cache.filter(m =>
        m.id === name?.replace(/[<@!>]/g, "") ||
        m.user.username.toLowerCase().includes(name?.toLowerCase()) ||
        m.displayName.toLowerCase().includes(name?.toLowerCase())
    );

    if (matches.size > 1) {
        const listNama = matches.map(m => `- **${m.user.tag}** (ID: ${m.id})`).join('\n');
        return `Ada beberapa yang namanya **${name}**!\n\n${listNama}\n\nPake **@mention** atau **ID**.`;
    }

    const target = message.mentions.members.first() || matches.first();
    if (!target) return `Orang dengan nama "**${name}**" nggak ketemu.`;

    if (!target.isCommunicationDisabled()) {
        return `**${target.user.tag}** lagi gak kena timeout kok. Gak perlu di-unmute.`;
    }

    try {
        await target.timeout(null, reason || "Timeout dilepas oleh Asisten AI");
        return `✅ **${target.user.tag}** udah gue bebasin dari timeout! Sekarang dia bisa ngomong dan ngetik lagi.`;
    } catch (error) {
        console.error("Gagal unmute:", error);
        return "Gagal lepas timeout member itu. Cek terminal!";
    }
}
