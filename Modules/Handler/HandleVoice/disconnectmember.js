import { PermissionFlagsBits } from "discord.js";

export async function disconnectMemberHandler(message, instruction) {
    const { name, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return "Gue gak punya izin **Move Members** (dipake buat disconnect orang juga). Kasih dulu!";
    }

    const matches = message.guild.members.cache.filter(m =>
        m.id === name?.replace(/[<@!>]/g, "") ||
        m.user.username.toLowerCase().includes(name?.toLowerCase()) ||
        m.displayName.toLowerCase().includes(name?.toLowerCase())
    );

    if (matches.size > 1) {
        const listNama = matches.map(m => `- **${m.user.tag}** (ID: ${m.id})`).join('\n');
        return `Banyak yang namanya **${name}**!\n\n${listNama}\n\nPake **@mention** atau **ID**.`;
    }

    const target = message.mentions.members.first() || matches.first();
    if (!target) return `Orang dengan nama "**${name}**" nggak ketemu.`;
    if (!target.voice.channel) return `**${target.user.tag}** lagi gak ada di voice channel manapun.`;

    try {
        const vcName = target.voice.channel.name;
        await target.voice.disconnect(reason || "Didisconnect oleh Asisten AI");
        return `👢 **${target.user.tag}** udah gue tendang keluar dari **${vcName}**!`;
    } catch (error) {
        console.error("Gagal disconnect:", error);
        return "Gagal disconnect member dari VC. Cek terminal!";
    }
}
