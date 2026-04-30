import { PermissionFlagsBits } from "discord.js";

export async function voiceUnmuteHandler(message, instruction) {
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
    if (!target.voice.channel) return `**${target.user.tag}** lagi gak ada di voice channel.`;
    if (!target.voice.serverMute) return `**${target.user.tag}** gak lagi di-server-mute kok.`;

    try {
        await target.voice.setMute(false, reason || "Di-unmute oleh Asisten AI");
        return `🔊 **${target.user.tag}** udah gue lepas server-mutenya! Sekarang dia bisa ngomong lagi.`;
    } catch (error) {
        console.error("Gagal voice unmute:", error);
        return "Gagal server-unmute member itu. Cek terminal!";
    }
}
