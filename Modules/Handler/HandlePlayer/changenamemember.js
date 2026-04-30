import { PermissionFlagsBits } from "discord.js";

export async function changenamememberHandler(message, item) {
    const { memberName, newName, reason } = item;
    const botMember = message.guild.members.me;

    try {
        if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            return "Gue gak punya izin **Manage Nicknames**. Kasih dulu hak aksesnya biar gue bisa ganti nama member!";
        }

        const matches = message.guild.members.cache.filter(m => 
            m.id === memberName?.replace(/[<@!>]/g, "") ||
            m.user.username.toLowerCase().includes(memberName?.toLowerCase()) || 
            m.displayName.toLowerCase().includes(memberName?.toLowerCase())
        );

        if (matches.size > 1) {
            const listNama = matches.map(m => `- **${m.user.tag}** (ID: ${m.id})`).join('\n');
            return `Ada ${matches.size} orang yang namanya mirip "${memberName}". Yang mana yang mau diganti?\n\n${listNama}\n\nCoba pake @mention atau ID-nya aja biar langsung kena.`;
        }

        const target = message.mentions.members.first() || matches.first();

        if (!target) return `Orang dengan nama atau ID "${memberName}" gak ketemu di server ini.`;

        if (target.id === message.guild.ownerId) {
            return `Gue gak punya kuasa buat ganti nama Owner server. Itu mah di luar wewenang gue.`;
        }

        if (target.roles.highest.position >= botMember.roles.highest.position) {
            return `Pangkat si **${target.user.tag}** lebih tinggi atau sama dengan gue. Gue gak bisa ganti namanya sembarangan.`;
        }

        const oldName = target.displayName;
        await target.setNickname(newName || null, reason || "Diganti oleh Asisten AI");

        if (!newName) {
            return `Nickname **${target.user.tag}** udah gue hapus ya. Sekarang balik lagi pake nama aslinya.`;
        }

        return `Beres! Nama **${oldName}** udah resmi gue ganti jadi **${newName}** buat si **${target.user.tag}**.`;

    } catch (error) {
        console.error("Gagal ganti nickname:", error);
        
        if (error.code === 50013) return "Gue gak punya izin yang cukup buat ganti nama orang itu.";
        
        return "Terjadi masalah pas mau ganti nama member itu. Coba cek log terminal.";
    }
}