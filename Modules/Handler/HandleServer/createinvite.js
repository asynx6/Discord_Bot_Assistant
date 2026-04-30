import { PermissionFlagsBits } from "discord.js";

export async function createInviteHandler(message, instruction) {
    const { name, maxUses, duration, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
        return "Gue gak punya izin **Create Invite**. Kasih dulu!";
    }

    const channel = message.guild.channels.cache.find(c =>
        c.id === name?.replace(/[<#>]/g, "") ||
        c.name.toLowerCase() === name?.toLowerCase()
    ) || message.channel;

    const maxAge = duration ? parseInt(duration) * 3600 : 0;
    const uses = maxUses ? parseInt(maxUses) : 0;

    try {
        const invite = await channel.createInvite({
            maxAge,
            maxUses: uses,
            reason: reason || "Dibuat oleh Asisten AI"
        });

        let laporan = `🔗 **Invite link udah jadi!**\n`;
        laporan += `📎 **Link:** ${invite.url}\n`;
        laporan += `📢 **Channel:** <#${channel.id}>\n`;
        laporan += `🔢 **Max Uses:** ${uses === 0 ? "Unlimited" : `${uses}x`}\n`;
        laporan += `⏰ **Expire:** ${maxAge === 0 ? "Never (permanent)" : `${duration} jam lagi`}`;

        return laporan;
    } catch (error) {
        console.error("Gagal create invite:", error);
        return "Gagal bikin invite link. Cek terminal!";
    }
}
