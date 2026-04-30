import mongoose from "mongoose";

const snapshotSchema = new mongoose.Schema({
    guildId: String,
    timestamp: { type: Date, default: Date.now },
    channels: Array,
    roles: Array
});

let Snapshot;
try {
    Snapshot = mongoose.model("Snapshot");
} catch {
    Snapshot = mongoose.model("Snapshot", snapshotSchema);
}

const RATE_LIMIT_DELAY = 300;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function takeSnapshot(guild) {
    if (mongoose.connection.readyState !== 1) return;

    try {
        const channels = guild.channels.cache.map(c => {
            const data = {
                id: c.id,
                name: c.name,
                type: c.type,
                parentId: c.parentId,
                position: c.position,
                topic: c.topic || null,
                nsfw: c.nsfw || false,
                rateLimitPerUser: c.rateLimitPerUser || 0,
                permissionOverwrites: []
            };

            if (c.permissionOverwrites?.cache) {
                data.permissionOverwrites = Array.from(c.permissionOverwrites.cache.values()).map(o => ({
                    id: o.id,
                    type: o.type,
                    allow: o.allow.bitfield.toString(),
                    deny: o.deny.bitfield.toString()
                }));
            }

            return data;
        });

        const roles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).map(r => ({
            id: r.id,
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            permissions: r.permissions.bitfield.toString(),
            mentionable: r.mentionable,
            position: r.position
        }));

        await Snapshot.create({ guildId: guild.id, channels, roles });
    } catch (err) {
        console.error("Snapshot creation error:", err.message);
    }
}

export async function undoLastAction(guild) {
    if (mongoose.connection.readyState !== 1) return "Gak ada koneksi ke database.";

    const lastSnapshot = await Snapshot.findOne({ guildId: guild.id }).sort({ timestamp: -1 });
    if (!lastSnapshot) return "Gak nemu data snapshot buat server ini.";

    try {
        const currentChannels = await guild.channels.fetch();
        for (const [id, channel] of currentChannels) {
            if (!channel) continue;
            const wasThere = lastSnapshot.channels.find(c => c.id === id || (c.name === channel.name && c.type === channel.type));
            if (!wasThere && !channel.managed) {
                try {
                    await channel.delete("Undo Action");
                    await sleep(RATE_LIMIT_DELAY);
                } catch {}
            }
        }

        const currentRoles = await guild.roles.fetch();
        for (const [id, role] of currentRoles) {
            if (!role) continue;
            const wasThere = lastSnapshot.roles.find(r => r.id === id || r.name === role.name);
            if (!wasThere && !role.managed && role.id !== guild.id) {
                try {
                    await role.delete("Undo Action");
                    await sleep(RATE_LIMIT_DELAY);
                } catch {}
            }
        }

        const sortedRoles = [...lastSnapshot.roles].sort((a, b) => a.position - b.position);
        for (const r of sortedRoles) {
            const exists = guild.roles.cache.find(role => role.name === r.name);
            if (!exists) {
                try {
                    await guild.roles.create({
                        name: r.name,
                        color: r.color,
                        hoist: r.hoist,
                        permissions: BigInt(r.permissions),
                        mentionable: r.mentionable,
                        reason: "Undo Action"
                    });
                    await sleep(RATE_LIMIT_DELAY);
                } catch (roleErr) {
                    console.error(`Undo role restore failed for ${r.name}:`, roleErr.message);
                }
            }
        }

        const categories = lastSnapshot.channels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
        const nonCategories = lastSnapshot.channels.filter(c => c.type !== 4).sort((a, b) => a.position - b.position);

        const categoryIdMap = new Map();

        for (const c of categories) {
            const exists = guild.channels.cache.find(channel => channel.name === c.name && channel.type === c.type);
            if (!exists) {
                try {
                    const restored = await guild.channels.create({
                        name: c.name,
                        type: c.type,
                        permissionOverwrites: c.permissionOverwrites.map(o => ({
                            id: o.id,
                            deny: BigInt(o.deny),
                            allow: BigInt(o.allow)
                        })),
                        reason: "Undo Action"
                    });
                    categoryIdMap.set(c.id, restored.id);
                    await sleep(RATE_LIMIT_DELAY);
                } catch (catErr) {
                    console.error(`Undo category restore failed for ${c.name}:`, catErr.message);
                }
            } else {
                categoryIdMap.set(c.id, exists.id);
            }
        }

        for (const c of nonCategories) {
            const exists = guild.channels.cache.find(channel => channel.name === c.name && channel.type === c.type);
            if (!exists) {
                try {
                    const parentId = c.parentId ? (categoryIdMap.get(c.parentId) || c.parentId) : null;
                    const resolvedParent = parentId ? guild.channels.cache.get(parentId) : null;

                    await guild.channels.create({
                        name: c.name,
                        type: c.type,
                        topic: c.topic,
                        nsfw: c.nsfw,
                        rateLimitPerUser: c.rateLimitPerUser,
                        parent: resolvedParent ? resolvedParent.id : null,
                        permissionOverwrites: c.permissionOverwrites.map(o => ({
                            id: o.id,
                            deny: BigInt(o.deny),
                            allow: BigInt(o.allow)
                        })),
                        reason: "Undo Action"
                    });
                    await sleep(RATE_LIMIT_DELAY);
                } catch (chErr) {
                    console.error(`Undo channel restore failed for ${c.name}:`, chErr.message);
                }
            }
        }

        await Snapshot.deleteOne({ _id: lastSnapshot._id });
        return "✅ **Undo Berhasil!** Gue udah balikin server ke kondisi semula (menghapus yang baru dibuat & memulihkan yang hilang).";
    } catch (e) {
        console.error("Undo error:", e);
        return "❌ Gagal pas nyoba Undo.";
    }
}
