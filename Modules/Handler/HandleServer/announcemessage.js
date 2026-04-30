import { ChannelType, EmbedBuilder } from "discord.js";

export async function announceMessageHandler(message, instruction) {
    const { name, title, content, color } = instruction;

    if (!content && !title) return "Judul dan isi announcement-nya kosong nih!";

    const channel = message.guild.channels.cache.find(c =>
        (c.id === name?.replace(/[<#>]/g, "") ||
        c.name.toLowerCase() === name?.toLowerCase()) &&
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    ) || message.channel;

    let embedColor = 0x5865F2;
    if (color) {
        const hex = color.replace("#", "");
        const parsed = parseInt(hex, 16);
        if (!isNaN(parsed)) embedColor = parsed;
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(title || "📢 Pengumuman")
        .setDescription(content)
        .setFooter({ text: `Server: ${message.guild.name}` })
        .setTimestamp();

    try {
        await channel.send({ embeds: [embed] });
        return `📢 Announcement udah gue kirim ke <#${channel.id}>!`;
    } catch (error) {
        console.error("Gagal announce:", error);
        return "Gagal kirim announcement. Cek terminal!";
    }
}
