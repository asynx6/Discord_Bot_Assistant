export async function userInfoHandler(message, instruction) {
    const { name } = instruction;

    const matches = message.guild.members.cache.filter(m =>
        m.id === name?.replace(/[<@!>]/g, "") ||
        m.user.username.toLowerCase().includes(name?.toLowerCase()) ||
        m.displayName.toLowerCase().includes(name?.toLowerCase())
    );

    if (matches.size > 1) {
        const listNama = matches.map(m => `- **${m.user.tag}** (ID: ${m.id})`).join('\n');
        return `Ada beberapa yang namanya **${name}**!\n\n${listNama}\n\nPake **@mention** atau **ID**.`;
    }
    const mentionTarget = message.mentions.members.filter(m => m.id !== message.client.user.id).first();

    const target = matches.first() || mentionTarget || message.member;
    if (!target) return `Orang dengan nama/ID "**${name}**" nggak ketemu.`;

    try {
        const member = await message.guild.members.fetch(target.id);
        const user = member.user;

        const joinedTimestamp = Math.floor(member.joinedTimestamp / 1000);
        const createdTimestamp = Math.floor(user.createdTimestamp / 1000);

        const roles = member.roles.cache
            .filter(r => r.id !== message.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => `<@&${r.id}>`)
            .slice(0, 10)
            .join(", ") || "Tidak ada";

        const isOwner = member.id === message.guild.ownerId;
        const badges = [];
        if (isOwner) badges.push("👑 Owner");
        if (user.bot) badges.push("🤖 Bot");
        if (member.premiumSince) badges.push("✨ Server Booster");

        const voiceChannel = member.voice.channel;

        const lines = [
            `👤 **Info Member: ${user.tag}**`,
            ``,
            `🆔 **ID:** \`${user.id}\``,
            `📅 **Akun dibuat:** <t:${createdTimestamp}:D> (<t:${createdTimestamp}:R>)`,
            `📥 **Join server:** <t:${joinedTimestamp}:D> (<t:${joinedTimestamp}:R>)`,
            ``,
            `🔇 **Timeout:** ${member.isCommunicationDisabled() ? `Iya, sampai <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>` : "Tidak"}`,
            `🔊 **Di VC:** ${voiceChannel ? `**${voiceChannel.name}**` : "Tidak"}`,
            ``,
            `🏷️ **Roles (${member.roles.cache.size - 1}):** ${roles}`,
        ];

        if (badges.length > 0) lines.splice(2, 0, `🎖️ **Status:** ${badges.join(" | ")}`);

        return lines.join("\n");
    } catch (error) {
        console.error("Gagal user info:", error);
        return "Gagal ambil info member. Cek terminal!";
    }
}
