import { PermissionFlagsBits } from "discord.js";

export async function createroleHandler(message, instruction) {
    const { name, color, permissions, reason, displaySeparately, allowMention } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "Minimal kasih izin **Manage Roles** lah! Gue gak bisa bikin apa-apa kalau gak ada izin itu.";
    }

    try {
        const finalColor = (!color || color === "null") ? 0 : color;
        const createData = {
            name: name || "Role Baru",
            color: finalColor,
            reason: reason || "Perintah Asisten AI",
            hoist: displaySeparately === true, 
            mentionable: allowMention === true
        };

        const logs = [];
        if (color) logs.push(`warna **${color}**`);
        
        if (displaySeparately === true) logs.push("tampilan terpisah aktif");
        if (allowMention === true) logs.push("izin mention aktif");

        if (permissions && Array.isArray(permissions)) {
            let allowFlags = [];
            
            if (typeof permissions[0] === "string") {
                allowFlags = permissions.map(p => PermissionFlagsBits[p]).filter(p => p != null);
            } else if (permissions[0] && typeof permissions[0] === "object") {
                const permData = permissions[0];
                allowFlags = (permData.allow || []).map(p => PermissionFlagsBits[p]).filter(p => p != null);
            }
            
            if (allowFlags.length > 0) {
                createData.permissions = allowFlags.reduce((all, p) => all | p, 0n); 
                logs.push("settingan permission khusus");
            }
        }

        const newRole = await message.guild.roles.create(createData);

        let laporan = `Role <@&${newRole.id}> udah gue buat sesuai pesanan lo.`;
        
        if (logs.length > 0) {
            laporan += ` Gue udah pasang ${logs.join(", ")} juga ya.`;
        }

        return laporan;

    } catch (error) {
        console.error("Gagal create role:", error);
        return "Gagal pas mau bikin role baru. Cek terminal atau pastiin format warnanya bener!";
    }
}