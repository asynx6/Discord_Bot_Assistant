import { PermissionFlagsBits } from "discord.js";

export async function cloneChannelHandler(message, instruction) {
    const { name, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Gue butuh izin **Manage Channels** buat nge-clone!";
    }

    const channel = message.guild.channels.cache.find(c =>
        c.id === name?.replace(/[<#>]/g, "") ||
        c.name.toLowerCase() === name?.toLowerCase()
    ) || message.channel;

    try {
        const cloned = await channel.clone({
            reason: reason || `Clone dari channel ${channel.name} oleh AI`
        });
        return `👯 Berhasil nge-clone channel <#${channel.id}>! Nih yang baru: <#${cloned.id}>.`;
    } catch (error) {
        console.error("Gagal clone channel:", error);
        return "Waduh, gagal nge-clone channel. Cek terminal!";
    }
}
