import { PermissionFlagsBits } from "discord.js";

export async function setTopicHandler(message, instruction) {
    const { name, content, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Izin **Manage Channels** gue gak ada, bos!";
    }

    const channel = message.guild.channels.cache.find(c =>
        c.id === name?.replace(/[<#>]/g, "") ||
        c.name.toLowerCase() === name?.toLowerCase()
    ) || message.channel;

    if (!channel.isTextBased()) return "Channel itu gak punya fitur topik (bukan text channel).";

    try {
        await channel.setTopic(content || "", reason || "Topik diganti oleh AI");
        return `✅ Topik channel <#${channel.id}> udah gue ganti jadi: **${content || "Kosong"}**`;
    } catch (error) {
        console.error("Gagal set topic:", error);
        return "Gagal ganti topik channel. Cek terminal!";
    }
}
