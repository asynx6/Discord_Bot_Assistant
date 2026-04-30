export async function getMembersFromInstruction(message, instruction) {
    const { name, names } = instruction;
    const targetList = names || (name ? [name] : []);
    const members = new Map();

    if (targetList.length === 0) return [];

    for (const t of targetList) {
        const id = t.replace(/[<@!>]/g, "");
        let found = message.guild.members.cache.get(id);

        if (!found) {
            found = message.guild.members.cache.find(m =>
                m.user.username.toLowerCase() === t.toLowerCase() ||
                m.displayName.toLowerCase() === t.toLowerCase()
            );
        }

        if (!found) {
            try {
                const fetched = await message.guild.members.fetch({ query: t, limit: 1 });
                if (fetched.size > 0) found = fetched.first();
            } catch {}
        }

        if (!found) {
            try {
                found = await message.guild.members.fetch(id).catch(() => null);
            } catch {}
        }

        if (found) members.set(found.id, found);
    }
    return Array.from(members.values());
}
