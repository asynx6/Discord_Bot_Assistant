import { PermissionFlagsBits } from "discord.js";

export async function voiceUndeafenHandler(message, instruction) {
    const { name, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.DeafenMembers)) {
        return "Gue gak punya izin **Deafen Members**. Kasih dulu izinnya!";
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
    if (!target.voice.channel) return `**${target.user.tag}** lagi gak ada di voice channel.`;
    if (!target.voice.serverDeaf) return `**${target.user.tag}** gak lagi di-server-deafen kok.`;

    try {
        await target.voice.setDeaf(false, reason || "Di-undeafen oleh Asisten AI");
        return `👂 **${target.user.tag}** udah gue lepas server-deafennya! Sekarang dia bisa denger lagi.`;
    } catch (error) {
        console.error("Gagal voice undeafen:", error);
        return "Gagal server-undeafen member itu. Cek terminal!";
    }
}
