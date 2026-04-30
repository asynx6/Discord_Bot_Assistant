import { PermissionFlagsBits, AuditLogEvent } from "discord.js";

const ACTION_NAME_MAP = {
    [AuditLogEvent.MemberKick]: "Kick",
    [AuditLogEvent.MemberBanAdd]: "Ban",
    [AuditLogEvent.MemberBanRemove]: "Unban",
    [AuditLogEvent.MemberUpdate]: "Update Member",
    [AuditLogEvent.MemberRoleUpdate]: "Update Role Member",
    [AuditLogEvent.ChannelCreate]: "Buat Channel",
    [AuditLogEvent.ChannelDelete]: "Hapus Channel",
    [AuditLogEvent.ChannelUpdate]: "Edit Channel",
    [AuditLogEvent.RoleCreate]: "Buat Role",
    [AuditLogEvent.RoleDelete]: "Hapus Role",
    [AuditLogEvent.RoleUpdate]: "Edit Role",
    [AuditLogEvent.MessageDelete]: "Hapus Pesan",
    [AuditLogEvent.MessageBulkDelete]: "Hapus Pesan Massal",
    [AuditLogEvent.GuildUpdate]: "Update Server",
    [AuditLogEvent.EmojiCreate]: "Tambah Emoji",
    [AuditLogEvent.EmojiDelete]: "Hapus Emoji",
    [AuditLogEvent.InviteCreate]: "Buat Invite",
};

export async function auditLogHandler(message, instruction) {
    const { name, content, amount } = instruction;
    const botMember = message.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        return "Gue gak punya izin **View Audit Log**, bos! Bukain dulu aksesnya.";
    }

    try {
        const limit = Math.min(amount || 15, 50);
        const auditLogs = await message.guild.fetchAuditLogs({ limit });
        let logs = auditLogs.entries;

        if (name || content) {
            const query = (name || content).toLowerCase();
            logs = logs.filter(entry =>
                entry.target?.id?.includes(query) ||
                entry.target?.username?.toLowerCase().includes(query) ||
                entry.executor?.username?.toLowerCase().includes(query) ||
                (ACTION_NAME_MAP[entry.action] || "").toLowerCase().includes(query)
            );
        }

        if (logs.size === 0) return "Gak ada data audit log yang cocok nih.";

        const result = logs.map(entry => {
            const time = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
            const actionName = ACTION_NAME_MAP[entry.action] || `Aksi #${entry.action}`;
            const executor = entry.executor?.tag || "Unknown";
            const target = entry.target?.tag || entry.target?.name || "Sesuatu";

            return `- **${executor}** melakukan **${actionName}** ke **${target}** (${time})`;
        }).join("\n");

        return `🔍 **Hasil Investigasi Audit Log:**\n\n${result}`;
    } catch (e) {
        console.error("Audit log error:", e);
        return "Gagal narik data Audit Log.";
    }
}
