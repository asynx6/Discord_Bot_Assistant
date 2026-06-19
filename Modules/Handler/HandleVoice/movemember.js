import { PermissionFlagsBits, ChannelType } from "discord.js";

export async function moveMemberHandler(message, instruction) {
    const { name, targetChannel, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return "Gue gak punya izin **Move Members**. Kasih dulu izinnya biar gue bisa mindahin orang!";
    }

    const matches = message.guild.members.cache.filter(m =>
        m.id === name?.replace(/[<@!>]/g, "") ||
        m.user.username.toLowerCase().includes(name?.toLowerCase()) ||
        m.displayName.toLowerCase().includes(name?.toLowerCase())
    );

    if (matches.size > 1) {
        const listNama = matches.map(m => `- **${m.user.tag}** (ID: ${m.id})`).join('\n');
        return `Bingung njir, yang namanya **${name}** ada ${matches.size} orang!\n\n${listNama}\n\nCoba pake **@mention** atau **ID**-nya aja.`;
    }

    const target = message.mentions.members.first() || matches.first();
    if (!target) return `Orang dengan nama "**${name}**" nggak ketemu di server ini.`;

    if (!target.voice.channel) {
        return `**${target.user.tag}** lagi gak ada di voice channel manapun nih.`;
    }

    const destChannel = message.guild.channels.cache.find(c =>
        (c.id === targetChannel?.replace(/[<#>]/g, "") ||
        c.name.toLowerCase().includes(targetChannel?.toLowerCase())) &&
        (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
    );

    if (!destChannel) return `Voice channel **"${targetChannel}"** gak ketemu nih.`;

    try {
        const fromVC = target.voice.channel.name;
        await target.voice.setChannel(destChannel, reason || "Dipindah oleh Asisten AI");
        return `✅ **${target.user.tag}** berhasil gue pindahin dari **${fromVC}** ke **${destChannel.name}**!`;
    } catch (error) {
        console.error("Gagal move member:", error);
        return "Gagal mindahin member ke VC itu. Cek terminal!";
    }
}
