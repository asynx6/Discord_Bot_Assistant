import { PermissionFlagsBits, ChannelType } from "discord.js";

export async function cleanmessagehandler(message, instruction) {
    const { channelName, amount, filterType, targetUser, reason, name } = instruction;
    const botMember = message.guild.members.me;

    let targetChannels = [];
    let isGlobal = false;
    
    let finalTargetUser = targetUser;
    if (!finalTargetUser && name && /^[0-9]+$/.test(name.replace(/[<@!>]/g, ""))) {
        finalTargetUser = name;
    }

    if (channelName && channelName.toUpperCase() !== "ALL") {
        const found = message.guild.channels.cache.find(c =>
            c.id === channelName?.replace(/[<#@>]/g, "") ||
            c.name.toLowerCase() === channelName?.toLowerCase()
        );
        if (found) targetChannels.push(found);
    }

    if (targetChannels.length === 0) {
        isGlobal = true;
        targetChannels = message.guild.channels.cache.filter(c =>
            (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
            botMember.permissionsIn(c).has(PermissionFlagsBits.ManageMessages)
        ).map(c => c);
    }

    if (targetChannels.length === 0) {
        return "Gue gak nemu channel yang bisa gue akses buat bersih-bersih nih.";
    }

    const statusMsg = await message.reply(`🔍 **Sabar ya bos...** Gue lagi keliling **${targetChannels.length}** channel buat nyari pesan ${finalTargetUser ? `dari <@${finalTargetUser.replace(/[<@!>]/g, "")}>` : ""}...`).catch(() => null);

    let totalDeleted = 0;
    let totalScannedChannels = 0;
    const limitAmount = Math.min(amount || 100, 100);

    try {
        for (const channel of targetChannels) {
            if (!botMember.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) continue;

            let messages = await channel.messages.fetch({ limit: limitAmount }).catch(() => null);
            if (!messages || messages.size === 0) continue;

            messages = messages.filter(m => m.id !== message.id && m.id !== statusMsg?.id);

            if (finalTargetUser) {
                const userId = finalTargetUser.replace(/[<@!>]/g, "");
                messages = messages.filter(m => m.author.id === userId);
            }

            if (filterType === "URL") {
                const urlRegex = /(https?:\/\/[^\s]+)/;
                messages = messages.filter(m => urlRegex.test(m.content));
            }

            if (messages.size > 0) {
                const deleted = await channel.bulkDelete(messages, true).catch(() => new Map());
                totalDeleted += deleted.size;
            }
            totalScannedChannels++;

            if (isGlobal && totalScannedChannels % 5 === 0 && statusMsg) {
                await statusMsg.edit(`🔍 **Masih kerja...** Udah cek **${totalScannedChannels}** channel, dapet **${totalDeleted}** pesan...`).catch(() => null);
            }
        }

        let feedback = "";
        if (totalDeleted === 0) {
            feedback = `❌ Gak nemu pesan yang cocok di **${totalScannedChannels}** channel. Mungkin pesannya udah lebih dari 14 hari?`;
        } else {
            feedback = `🧹 **BERES BOS!** Gue udah sikat total **${totalDeleted}** pesan dari **${totalScannedChannels}** channel.\n\n*Catatan: Pesan > 14 hari gak bisa dihapus massal.*`;
        }

        if (statusMsg) {
            await statusMsg.edit(feedback).catch(() => null);
            return "";
        }

        return feedback;

    } catch (error) {
        console.error("Gagal global purge:", error);
        if (statusMsg) await statusMsg.edit("❌ Waduh, gagal pas lagi keliling channel. Cek terminal!").catch(() => null);
        return "";
    }
}