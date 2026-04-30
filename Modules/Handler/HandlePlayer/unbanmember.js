import { PermissionFlagsBits } from "discord.js";

export async function unbanMemberHandler(message, instruction) {
    const { name, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        return "Gue gak punya izin **Ban Members** (dibutuhin juga buat unban). Kasih dulu!";
    }

    try {
        const bannedList = await message.guild.bans.fetch();

        if (bannedList.size === 0) return `Gak ada yang kena ban di server ini.`;

        const target = bannedList.find(b =>
            b.user.id === name?.replace(/[<@!>]/g, "") ||
            b.user.username.toLowerCase().includes(name?.toLowerCase()) ||
            b.user.tag.toLowerCase().includes(name?.toLowerCase())
        );

        if (!target) return `Gak ada yang namanya "**${name}**" di list ban server ini.`;

        await message.guild.members.unban(target.user.id, reason || "Di-unban oleh Asisten AI");
        return `✅ **${target.user.tag}** udah gue unban! Sekarang dia bisa balik lagi ke server.`;
    } catch (error) {
        console.error("Gagal unban:", error);
        return "Gagal unban member itu. Cek terminal!";
    }
}
