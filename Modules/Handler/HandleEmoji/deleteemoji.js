import { PermissionFlagsBits } from "discord.js";

export async function deleteEmojiHandler(message, instruction) {
    const { name, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
        return "Gue gak punya izin **Manage Expressions** (emoji). Kasih dulu!";
    }

    if (!name) return "Nama emoji yang mau dihapus apa?";

    const cleanName = name.replace(/:/g, "");

    const emoji = message.guild.emojis.cache.find(e =>
        e.name.toLowerCase() === cleanName.toLowerCase() ||
        e.id === cleanName
    );

    if (!emoji) return `Emoji dengan nama **:${cleanName}:** gak ketemu di server ini.`;

    try {
        const emojiName = emoji.name;
        await emoji.delete(reason || "Dihapus oleh Asisten AI");
        return `🗑️ Emoji **:${emojiName}:** berhasil gue hapus dari server!`;
    } catch (error) {
        console.error("Gagal delete emoji:", error);
        return "Gagal hapus emoji. Cek terminal!";
    }
}
