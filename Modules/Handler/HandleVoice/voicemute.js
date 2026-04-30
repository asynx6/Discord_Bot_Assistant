import { PermissionFlagsBits } from "discord.js";

export async function voiceMuteHandler(message, instruction) {
    const { name, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.MuteMembers)) {
        return "Gue gak punya izin **Mute Members**. Kasih dulu izinnya!";
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
    if (!target.voice.channel) return `**${target.user.tag}** lagi gak ada di voice channel, gak bisa di-mute.`;
    if (target.voice.serverMute) return `**${target.user.tag}** udah di-server-mute kok.`;

    try {
        await target.voice.setMute(true, reason || "Di-server-mute oleh Asisten AI");
        return `🔇 **${target.user.tag}** udah gue server-mute! Dia gak bisa ngomong di VC manapun sekarang.`;
    } catch (error) {
        console.error("Gagal voice mute:", error);
        return "Gagal server-mute member itu. Cek terminal!";
    }
}
