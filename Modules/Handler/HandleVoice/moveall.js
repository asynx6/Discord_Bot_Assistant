import { PermissionFlagsBits, ChannelType } from "discord.js";

export async function moveAllHandler(message, instruction) {
    const { name, targetChannel, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return "Gue gak punya izin **Move Members**. Kasih dulu izinnya!";
    }

    const sourceVC = message.guild.channels.cache.find(c =>
        (c.id === name?.replace(/[<#>]/g, "") ||
        c.name.toLowerCase().includes(name?.toLowerCase())) &&
        c.type === ChannelType.GuildVoice
    );

    if (!sourceVC) return `Voice channel sumber **"${name}"** gak ketemu.`;

    const destVC = message.guild.channels.cache.find(c =>
        (c.id === targetChannel?.replace(/[<#>]/g, "") ||
        c.name.toLowerCase().includes(targetChannel?.toLowerCase())) &&
        c.type === ChannelType.GuildVoice
    );

    if (!destVC) return `Voice channel tujuan **"${targetChannel}"** gak ketemu.`;
    if (sourceVC.id === destVC.id) return `VC asal dan tujuannya sama dong, mau pindahin ke mana?`;

    const membersInSource = sourceVC.members;
    if (membersInSource.size === 0) return `Gak ada yang lagi di **${sourceVC.name}** buat dipindahin.`;

    try {
        let movedCount = 0;
        for (const [, member] of membersInSource) {
            await member.voice.setChannel(destVC, reason || "Dipindah massal oleh Asisten AI");
            movedCount++;
        }
        return `✅ Selesai! **${movedCount} orang** udah gue pindahin dari **${sourceVC.name}** ke **${destVC.name}**!`;
    } catch (error) {
        console.error("Gagal move all:", error);
        return "Ada yang gagal pas mindahin orang-orang. Cek terminal!";
    }
}
