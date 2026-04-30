import { PermissionFlagsBits } from "discord.js";

export async function addEmojiHandler(message, instruction) {
    const { name, url, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
        return "Gue gak punya izin **Manage Expressions** (emoji). Kasih dulu!";
    }

    if (!name) return "Nama emoji-nya apa nih? Kasih tau dulu!";
    if (!url) return "URL gambar emoji-nya mana? Wajib ada!";

    const cleanName = name.replace(/[^a-zA-Z0-9_]/g, "_");

    try {
        const emoji = await message.guild.emojis.create({
            attachment: url,
            name: cleanName,
            reason: reason || "Ditambah oleh Asisten AI"
        });
        return `✅ Emoji **:${emoji.name}:** (${emoji}) berhasil gue tambahin ke server!`;
    } catch (error) {
        console.error("Gagal add emoji:", error);
        if (error.code === 30008) return "Slot emoji server udah penuh! Hapus beberapa emoji dulu atau boost server-nya.";
        return "Gagal tambah emoji. Pastiin URL-nya valid dan berformat gambar (PNG/JPG/GIF). Cek terminal!";
    }
}
