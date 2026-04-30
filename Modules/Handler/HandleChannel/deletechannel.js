import { PermissionFlagsBits, ChannelType } from "discord.js";

const RATE_LIMIT_DELAY = 600;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function deletechannelHandler(message, instruction) {
    const { name, names, deleteAllChannels, deleteAll, except, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Izin **Manage Channels** gue belum nyala nih. Kasih dulu dong biar gue bisa bersih-bersih!";
    }

    try {
        const deleteLogs = [];

        if (deleteAll === true) {
            const exceptIds = new Set();
            if (except && Array.isArray(except)) {
                for (const ex of except) {
                    const cleanId = ex.replace(/[<#@&>]/g, "");
                    const found = message.guild.channels.cache.find(c =>
                        c.id === cleanId || c.name.toLowerCase().includes(ex.toLowerCase())
                    );
                    if (found) exceptIds.add(found.id);
                    else exceptIds.add(cleanId);
                }
            }

            exceptIds.add(message.channel.id);

            await message.guild.channels.fetch();

            const allChannels = [...message.guild.channels.cache.values()]
                .filter(c => !exceptIds.has(c.id) && c.type !== ChannelType.GuildCategory)
                .sort((a, b) => b.position - a.position);

            const allCategories = [...message.guild.channels.cache.values()]
                .filter(c => !exceptIds.has(c.id) && c.type === ChannelType.GuildCategory);

            if (allChannels.length === 0 && allCategories.length === 0) {
                return "Semua channel yang ada masuk daftar pengecualian (termasuk channel tempat kita chat ini). Jadi gak ada yang gue sikat, Bos.";
            }

            let deletedCount = 0;
            let skippedCount = 0;

            for (const channel of allChannels) {
                try {
                    await channel.delete(reason || "Mass delete oleh Asisten AI");
                    deletedCount++;
                    await sleep(RATE_LIMIT_DELAY);
                } catch (err) {
                    if (err.code === 10003 || err.message?.includes("Unknown Channel")) {
                        deletedCount++;
                    } else if (err.code === 50074 || err.message?.includes("community")) {
                        skippedCount++;
                        deleteLogs.push(`🛡️ **${channel.name}** dilindungi (community server requirement)`);
                    } else {
                        deleteLogs.push(`❌ **${channel.name}**: ${err.message}`);
                    }
                }
            }

            for (const category of allCategories) {
                try {
                    await category.delete(reason || "Mass delete oleh Asisten AI");
                    deletedCount++;
                    await sleep(RATE_LIMIT_DELAY);
                } catch (err) {
                    if (err.code === 10003 || err.message?.includes("Unknown Channel")) {
                        deletedCount++;
                    } else {
                        deleteLogs.push(`❌ Kategori **${category.name}**: ${err.message}`);
                    }
                }
            }

            let laporan = `🔥 **NUKE SELESAI!** Total **${deletedCount}** channel & kategori udah gue sikat habis!`;
            if (exceptIds.size > 0) {
                const savedChannels = [...exceptIds]
                    .filter(id => message.guild.channels.cache.has(id))
                    .map(id => `<#${id}>`);
                if (savedChannels.length > 0) {
                    laporan += `\n🛡️ Channel yang diselamatin: ${savedChannels.join(", ")}`;
                }
            }
            if (deleteLogs.length > 0) {
                laporan += `\n\n⚠️ Catatan:\n${deleteLogs.join("\n")}`;
            }

            return laporan;
        }

        const targets = [];
        if (name) targets.push(name);
        if (names && Array.isArray(names)) targets.push(...names);

        if (targets.length === 0) return "Mana yang mau dihapus? Kasih tau nama atau ID channel-nya ya.";

        for (const targetName of targets) {
            const channel = message.guild.channels.cache.find(c =>
                c.id === targetName.replace(/[<#@&>]/g, "") ||
                c.name.toLowerCase() === targetName.toLowerCase()
            );

            if (!channel) {
                deleteLogs.push(`**${targetName}** (Gak ketemu)`);
                continue;
            }

            try {
                if (channel.type === ChannelType.GuildCategory && deleteAllChannels === true) {
                    const children = message.guild.channels.cache.filter(c => c.parentId === channel.id);
                    for (const [, child] of children) {
                        try {
                            await child.delete(reason || "Satu paket hapus kategori");
                            await sleep(RATE_LIMIT_DELAY);
                        } catch (childErr) {
                            if (childErr.code !== 10003) {
                                console.error(`Failed to delete child ${child.name}:`, childErr.message);
                            }
                        }
                    }
                    await channel.delete(reason || "Dihapus asisten AI");
                    deleteLogs.push(`Kategori **${channel.name}** + semua isi channel-nya`);
                } else {
                    const channelName = channel.name;
                    const isCategory = channel.type === ChannelType.GuildCategory;
                    await channel.delete(reason || "Dihapus asisten AI");
                    deleteLogs.push(`${isCategory ? 'Kategori' : 'Channel'} **${channelName}**`);
                }
            } catch (deleteErr) {
                if (deleteErr.code !== 10003) {
                    deleteLogs.push(`❌ Gagal hapus **${channel.name}**: ${deleteErr.message}`);
                }
            }
        }

        if (deleteLogs.length === 0) return "Gak ada yang bisa gue hapus nih.";

        let laporan = "Beres! Tadi gue udah beresin ini:\n\n" + deleteLogs.join("\n");
        laporan += "\n\nServer jadi lebih rapi sekarang.";

        return laporan;

    } catch (error) {
        console.error("Gagal hapus:", error);
        return "Aduh, pas lagi mau hapus malah ada kendala. Coba cek terminal deh.";
    }
}