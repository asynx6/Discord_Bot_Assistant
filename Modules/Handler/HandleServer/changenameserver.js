import { PermissionFlagsBits } from "discord.js";

export async function ChangeNameServerHandler(message, item) {
    const { newName, reason } = item;
    const botMember = message.guild.members.me;

    try {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return "Waduh, izin **Manage Server** lo gak ada nih. Gak boleh sembarang ganti nama!";
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return "Gue gak punya izin **Manage Server**. Kasih dulu baru gue gantiin namanya!";
        }

        if (!newName) return "Nama baru servernya apa, OI? Kasih tau dong Minimal.";

        const oldName = message.guild.name;

        await message.guild.setName(newName, reason || "Diganti oleh Asisten AI");

        return `Nama server berhasil gue ubah!\nDari: **${oldName}**\nJadi: **${newName}**`;

    } catch (error) {
        console.error("Gagal ganti nama server:", error);
        
        if (error.code === 50035) return "Gagal! Nama server kepanjangan atau ada karakter terlarang.";
        
        return "Waduh, gagal pas nyoba ganti nama server itu. Cek terminal, Ben..!";
    }
}