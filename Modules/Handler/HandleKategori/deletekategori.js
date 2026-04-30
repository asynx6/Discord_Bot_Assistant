import { PermissionFlagsBits, ChannelType } from "discord.js";

const RATE_LIMIT_DELAY = 400;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function deletekategoriHandler(message, instruction) {
    const target = instruction.name || instruction.categoryName;
    const { deleteAllChannels, deleteAll, except, reason } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return "Izin **Manage Channels** gue belum nyala nih. Kasih dulu izinnya biar gue bisa bongkar-bongkar kategori!";
    }

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

        await message.guild.channels.fetch();

        const allCategories = [...message.guild.channels.cache.values()]
            .filter(c => c.type === ChannelType.GuildCategory && !exceptIds.has(c.id));

        if (allCategories.length === 0) return "Semua kategori yang ada udah masuk daftar pengecualian, jadi gak ada yang gue sikat, Bos.";

        const deleteLogs = [];
        let deletedCount = 0;
        let skippedCount = 0;

        for (const category of allCategories) {
            try {
                if (deleteAllChannels === true) {
                    const children = message.guild.channels.cache.filter(c => c.parentId === category.id);
                    for (const [, ch] of children) {
                        if (exceptIds.has(ch.id) || ch.id === message.channel.id) continue;
                        try {
                            await ch.delete(reason || "Satu paket penghapusan kategori massal");
                            await sleep(RATE_LIMIT_DELAY);
                        } catch (err) {
                            if (err.code !== 10003 && err.code !== 50074) {
                                console.error(`Failed to delete child ${ch.name}:`, err.message);
                            }
                        }
                    }
                }
                const catName = category.name;
                await category.delete(reason || "Hapus massal oleh Asisten AI");
                deletedCount++;
                await sleep(RATE_LIMIT_DELAY);
            } catch (err) {
                if (err.code === 10003 || err.message?.includes("Unknown Channel")) {
                    deletedCount++;
                } else if (err.code === 50074 || err.message?.includes("community")) {
                    skippedCount++;
                    deleteLogs.push(`🛡️ Kategori **${category.name}** dilindungi (community server requirement)`);
                } else {
                    deleteLogs.push(`❌ Gagal hapus **${category.name}**: ${err.message}`);
                }
            }
        }

        let laporan = `🔥 Beres! **${deletedCount}** kategori udah gue sikat habis!`;
        if (exceptIds.size > 0) {
            const savedCats = [...exceptIds]
                .filter(id => message.guild.channels.cache.has(id))
                .map(id => {
                    const c = message.guild.channels.cache.get(id);
                    return c.type === ChannelType.GuildCategory ? `**${c.name}**` : `<#${id}>`;
                });
            if (savedCats.length > 0) {
                laporan += `\n🛡️ Yang diselamatin: ${savedCats.join(", ")}`;
            }
        }
        if (deleteLogs.length > 0) {
            laporan += `\n\n⚠️ Catatan:\n${deleteLogs.join("\n")}`;
        }
        return laporan;
    }

    if (!target) return "Kategori mana yang mau dihapus? Kasih nama atau ID-nya dulu dong biar jelas."

    const category = message.guild.channels.cache.find(c =>
        (c.id === target.replace(/[<#@&>]/g, "") || c.name.toLowerCase().includes(target.toLowerCase())) &&
        c.type === ChannelType.GuildCategory
    );

    if (!category) return `Kategori **${target}** gak ketemu di server ini. Coba cek lagi deh tulisannya udah bener belum?`;

    try {
        const categoryName = category.name;
        const children = message.guild.channels.cache.filter(c => c.parentId === category.id);
        const childCount = children.size;

        let laporan = "";

        if (deleteAllChannels === true && childCount > 0) {
            for (const [, ch] of children) {
                try {
                    await ch.delete(reason || "Satu paket penghapusan kategori");
                    await sleep(RATE_LIMIT_DELAY);
                } catch (chErr) {
                    if (chErr.code !== 10003 && chErr.code !== 50074) {
                        console.error(`Failed to delete child channel ${ch.name}:`, chErr.message);
                    }
                }
            }
            await category.delete(reason || "Dihapus oleh Asisten AI");
            laporan = `Beres! Kategori **${categoryName}** udah gue sikat habis, termasuk **${childCount}** channel di dalemnya udah bersih semua.`;
        } else {
            await category.delete(reason || "Dihapus oleh Asisten AI");
            laporan = `Kategori **${categoryName}** udah resmi gue hapus ya.`;

            if (childCount > 0) {
                laporan += `\n**Catatan:** Tadi ada ${childCount} channel di dalemnya yang gak ikut kehapus, jadi sekarang mereka gak punya kategori (yatim) di daftar atas.`;
            }
        }

        return laporan;

    } catch (error) {
        if (error.code === 10003 || error.message?.includes("Unknown Channel")) {
             return `Beres! Kategori **${category?.name || target}** udah resmi gue hapus ya.`;
        }
        console.error("Gagal hapus kategori:", error);
        return "Terjadi masalah pas mau hapus kategori itu. Coba cek log di terminal ya!";
    }
}