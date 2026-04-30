import { ChannelType } from "discord.js";

export async function serverInfoHandler(message) {
    const guild = message.guild;

    try {
        await guild.members.fetch();
        const owner = await guild.fetchOwner();

        const totalMembers = guild.memberCount;
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const humans = totalMembers - bots;

        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
        const roles = guild.roles.cache.size - 1;
        const emojis = guild.emojis.cache.size;

        const boostTier = ["Tidak ada", "Level 1", "Level 2", "Level 3"];
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;

        const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

        const lines = [
            `📊 **Informasi Server: ${guild.name}**`,
            ``,
            `👑 **Owner:** ${owner.user.tag}`,
            `🆔 **Server ID:** \`${guild.id}\``,
            `📅 **Dibuat:** <t:${createdTimestamp}:D> (<t:${createdTimestamp}:R>)`,
            ``,
            `👥 **Total Member:** ${totalMembers} (${humans} manusia, ${bots} bot)`,
            `💬 **Text Channel:** ${textChannels}`,
            `🔊 **Voice Channel:** ${voiceChannels}`,
            `📁 **Kategori:** ${categories}`,
            `🏷️ **Roles:** ${roles}`,
            `😀 **Emoji:** ${emojis}`,
            ``,
            `✨ **Boost:** ${boostTier[boostLevel] || "Unknown"} (${boostCount} booster)`,
            `🔒 **Verifikasi:** ${guild.verificationLevel}`,
        ];

        if (guild.description) lines.push(`📝 **Deskripsi:** ${guild.description}`);

        return lines.join("\n");
    } catch (error) {
        console.error("Gagal server info:", error);
        return "Gagal ambil info server. Cek terminal!";
    }
}
