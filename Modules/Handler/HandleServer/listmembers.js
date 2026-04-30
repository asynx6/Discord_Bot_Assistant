export async function listMembersHandler(message, instruction) {
    const { newName, content } = instruction;
    const guild = message.guild;

    try {
        let members = await guild.members.fetch();
        let title = "Daftar Member";

        if (newName) {
            const role = guild.roles.cache.find(r => 
                r.id === newName.replace(/[<@&>]/g, "") || 
                r.name.toLowerCase() === newName.toLowerCase()
            );
            if (role) {
                members = members.filter(m => m.roles.cache.has(role.id));
                title = `Member dengan Role: **${role.name}**`;
            }
        }

        if (content?.toLowerCase().includes("hari ini") || content?.toLowerCase().includes("baru")) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            members = members.filter(m => m.joinedTimestamp > today.getTime());
            title = "Member yang Join Hari Ini";
        }

        if (members.size === 0) return `Gak nemu member buat kriteria: ${title}`;

        const list = members.map(m => `- **${m.user.tag}** (ID: \`${m.id}\`)`).slice(0, 20).join("\n");
        const total = members.size;

        return `📊 **${title}** (Total: ${total})\n\n${list}${total > 20 ? `\n*...dan ${total - 20} lainnya.*` : ""}`;
    } catch (e) {
        console.error(e);
        return "Gagal narik data member.";
    }
}
