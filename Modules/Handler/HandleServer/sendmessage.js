import { ChannelType } from "discord.js";

export async function sendMessageHandler(message, instruction) {
    const { name, content } = instruction;

    if (!content) return "Isinya apa yang mau gue kirim? Content-nya kosong nih!";

    const channel = message.guild.channels.cache.find(c =>
        (c.id === name?.replace(/[<#>]/g, "") ||
        c.name.toLowerCase() === name?.toLowerCase()) &&
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    ) || message.channel;

    try {
        await channel.send(content);
        return `✅ Pesan udah gue kirim ke <#${channel.id}>!`;
    } catch (error) {
        console.error("Gagal send message:", error);
        return "Gagal kirim pesan ke channel itu. Cek terminal!";
    }
}
