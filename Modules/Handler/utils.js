import { logger } from "../../logger.js";

/**
 * Resolve target members from an AI instruction payload.
 * Supports: name, names, raw IDs, <@id> mentions, usernames, display names.
 * Lookup order: cache → fuzzy cache match → guild.fetch(query) → guild.fetch(id).
 *
 * Parallelized: previous sequential `for await` became Promise.all for speed.
 * Deduped by member ID so the same target is not acted on twice.
 *
 * @param {import("discord.js").Message} message
 * @param {{ name?: string, names?: string[] }} instruction
 * @returns {Promise<import("discord.js").GuildMember[]>}
 */
export async function getMembersFromInstruction(message, instruction) {
    const { name, names } = instruction;
    const targetList = names || (name ? [name] : []);

    if (targetList.length === 0) return [];

    const results = await Promise.all(
        targetList.map((target) => resolveOne(message, target))
    );

    const dedup = new Map();
    for (const member of results) {
        if (member && !dedup.has(member.id)) dedup.set(member.id, member);
    }
    return Array.from(dedup.values());
}

async function resolveOne(message, target) {
    if (!target) return null;

    const cleanedId = String(target).replace(/[<@!>]/g, "");
    let found = message.guild.members.cache.get(cleanedId);

    if (!found) {
        found = message.guild.members.cache.find(
            (m) =>
                m.user.username.toLowerCase() === target.toLowerCase() ||
                m.displayName.toLowerCase() === target.toLowerCase()
        );
    }

    if (found) return found;

    try {
        const queryResult = await message.guild.members.fetch({ query: target, limit: 1 });
        if (queryResult.size > 0) return queryResult.first();
    } catch (err) {
        logger.debug("member.fetch_by_query_failed", { target, error: err?.message });
    }

    try {
        const fetched = await message.guild.members.fetch(cleanedId);
        return fetched ?? null;
    } catch (err) {
        logger.debug("member.fetch_by_id_failed", { target, error: err?.message });
        return null;
    }
}
