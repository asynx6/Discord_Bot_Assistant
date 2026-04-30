import { PermissionFlagsBits } from "discord.js";

export async function voiceDeafenHandler(message, instruction) {
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
    if (!target.voice.channel) return `**${target.user.tag}** lagi gak ada di voice channel, gak bisa di-deafen.`;
    if (target.voice.serverDeaf) return `**${target.user.tag}** udah di-server-deafen kok.`;

    try {
        await target.voice.setDeaf(true, reason || "Di-server-deafen oleh Asisten AI");
        return `🙉 **${target.user.tag}** udah gue server-deafen! Dia gak bisa denger VC manapun sekarang.`;
    } catch (error) {
        console.error("Gagal voice deafen:", error);
        return "Gagal server-deafen member itu. Cek terminal!";
    }
}
