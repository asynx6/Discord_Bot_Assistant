import { createChannelHandler } from "./Handler/HandleChannel/createchannel.js";
import { deletechannelHandler as deleteChannelHandler } from "./Handler/HandleChannel/deletechannel.js";
import { editchannelHandler } from "./Handler/HandleChannel/editchannel.js";
import { banMemberHandler } from "./Handler/HandlePlayer/banmember.js";
import { KickMemberHandler } from "./Handler/HandlePlayer/kickmember.js";
import { muteMemberHandler } from "./Handler/HandlePlayer/mutemember.js";
import { addrolememberHandler } from "./Handler/HandlePlayer/addrolemember.js";
import { removerolememberHandler } from "./Handler/HandlePlayer/removerolemember.js";
import { changenamememberHandler } from "./Handler/HandlePlayer/changenamemember.js";
import { unbanMemberHandler } from "./Handler/HandlePlayer/unbanmember.js";
import { unmuteMemberHandler } from "./Handler/HandlePlayer/unmutemember.js";
import { warnMemberHandler } from "./Handler/HandlePlayer/warnmember.js";
import { createroleHandler } from "./Handler/HandleRoles/createrole.js";
import { editRoleHandler } from "./Handler/HandleRoles/editrole.js";
import { deleterolehandler } from "./Handler/HandleRoles/deleterole.js";
import { createkategoriHandler } from "./Handler/HandleKategori/createkategori.js";
import { deletekategoriHandler } from "./Handler/HandleKategori/deletekategori.js";
import { editkategoriHandler } from "./Handler/HandleKategori/editkategori.js";
import { ChangeNameServerHandler } from "./Handler/HandleServer/changenameserver.js";
import { cleanmessagehandler } from "./Handler/HandleServer/cleanmessage.js";
import { lockChannelHandler } from "./Handler/HandleServer/lockchannel.js";
import { unlockChannelHandler } from "./Handler/HandleServer/unlockchannel.js";
import { slowmodeHandler } from "./Handler/HandleServer/slowmode.js";
import { sendMessageHandler } from "./Handler/HandleServer/sendmessage.js";
import { createInviteHandler } from "./Handler/HandleServer/createinvite.js";
import { serverInfoHandler } from "./Handler/HandleServer/serverinfo.js";
import { userInfoHandler } from "./Handler/HandleServer/userinfo.js";
import { announceMessageHandler } from "./Handler/HandleServer/announcemessage.js";
import { helpHandler } from "./Handler/HandleServer/help.js";
import { auditLogHandler } from "./Handler/HandleServer/auditlog.js";
import { listMembersHandler } from "./Handler/HandleServer/listmembers.js";
import { moveMemberHandler } from "./Handler/HandleVoice/movemember.js";
import { moveAllHandler } from "./Handler/HandleVoice/moveall.js";
import { disconnectMemberHandler } from "./Handler/HandleVoice/disconnectmember.js";
import { voiceMuteHandler } from "./Handler/HandleVoice/voicemute.js";
import { voiceUnmuteHandler } from "./Handler/HandleVoice/voiceunmute.js";
import { voiceDeafenHandler } from "./Handler/HandleVoice/voicedeafen.js";
import { voiceUndeafenHandler } from "./Handler/HandleVoice/voiceundeafen.js";
import { addEmojiHandler } from "./Handler/HandleEmoji/addemoji.js";
import { deleteEmojiHandler } from "./Handler/HandleEmoji/deleteemoji.js";
import { cloneChannelHandler } from "./Handler/HandleChannel/clonechannel.js";
import { setTopicHandler } from "./Handler/HandleChannel/settopic.js";
import { roleAllHandler } from "./Handler/HandleRoles/roleall.js";
import { takeSnapshot, undoLastAction } from "./snapshotManager.js";
import { metrics } from "./metrics.js";
import { logger } from "./logger.js";
import {
    hasDynamicCommand,
    executeDynamicCommand,
    getDynamicCommand,
    listDynamicCommands,
} from "./dynamicExecutor.js";

const ACTION_PRIORITY = {
    CREATE_CATEGORY: 1,
    EDIT_CATEGORY: 1,
    DELETE_CATEGORY: 1,
    CREATE_ROLE: 2,
    EDIT_ROLE: 2,
    DELETE_ROLE: 2,
    CREATE_CHANNEL: 3,
    DELETE_CHANNEL: 3,
    EDIT_CHANNEL: 3,
    CLONE_CHANNEL: 3,
    SET_TOPIC: 3,
    LOCK_CHANNEL: 4,
    UNLOCK_CHANNEL: 4,
    SLOWMODE: 4,
    ADD_ROLE_MEMBER: 5,
    REMOVE_ROLE_MEMBER: 5,
    ROLE_ALL: 5,
    CHANGE_NICKNAME_MEMBER: 5,
    KICK: 6,
    BAN: 6,
    MUTE: 6,
    UNMUTE: 6,
    UNBAN: 6,
    WARN: 6,
    MOVE_MEMBER: 7,
    MOVE_ALL: 7,
    DISCONNECT_MEMBER: 7,
    VOICE_MUTE: 7,
    VOICE_UNMUTE: 7,
    VOICE_DEAFEN: 7,
    VOICE_UNDEAFEN: 7,
    SEND_MESSAGE: 8,
    ANNOUNCE: 8,
    CLEAN_MESSAGE: 8,
    ADD_EMOJI: 9,
    DELETE_EMOJI: 9,
    CHANGE_SERVER_NAME: 9,
    CREATE_INVITE: 9,
    SERVER_INFO: 10,
    USER_INFO: 10,
    AUDIT_LOG: 10,
    LIST_MEMBERS: 10,
    HELP: 10,
    DYNAMIC_REQUEST: 1,
    DYNAMIC_EXECUTE: 3,
    UNDO: 0,
};

const RATE_LIMIT_DELAY = 350;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sortByDependency(actionList) {
    return [...actionList].sort((a, b) => {
        const priorityA = ACTION_PRIORITY[a.action?.toUpperCase()] ?? 50;
        const priorityB = ACTION_PRIORITY[b.action?.toUpperCase()] ?? 50;
        return priorityA - priorityB;
    });
}

const ACTION_HANDLER_MAP = {
    DELETE_CHANNEL: (msg, item) => deleteChannelHandler(msg, item),
    CREATE_CHANNEL: (msg, item) => createChannelHandler(msg, item),
    EDIT_CHANNEL: (msg, item) => editchannelHandler(msg, item),
    CLONE_CHANNEL: (msg, item) => cloneChannelHandler(msg, item),
    SET_TOPIC: (msg, item) => setTopicHandler(msg, item),
    CREATE_ROLE: (msg, item) => createroleHandler(msg, item),
    EDIT_ROLE: (msg, item) => editRoleHandler(msg, item),
    DELETE_ROLE: (msg, item) => deleterolehandler(msg, item),
    ROLE_ALL: (msg, item) => roleAllHandler(msg, item),
    CREATE_CATEGORY: (msg, item) => createkategoriHandler(msg, item),
    DELETE_CATEGORY: (msg, item) => deletekategoriHandler(msg, item),
    EDIT_CATEGORY: (msg, item) => editkategoriHandler(msg, item),
    BAN: (msg, item) => banMemberHandler(msg, item),
    KICK: (msg, item) => KickMemberHandler(msg, item),
    MUTE: (msg, item) => muteMemberHandler(msg, item),
    UNMUTE: (msg, item) => unmuteMemberHandler(msg, item),
    UNBAN: (msg, item) => unbanMemberHandler(msg, item),
    UNBAN_MEMBER: (msg, item) => unbanMemberHandler(msg, item),
    WARN: (msg, item) => warnMemberHandler(msg, item),
    WARN_MEMBER: (msg, item) => warnMemberHandler(msg, item),
    ADD_ROLE_MEMBER: (msg, item) => addrolememberHandler(msg, item),
    REMOVE_ROLE_MEMBER: (msg, item) => removerolememberHandler(msg, item),
    CHANGE_NICKNAME_MEMBER: (msg, item) => changenamememberHandler(msg, item),
    CHANGE_SERVER_NAME: (msg, item) => ChangeNameServerHandler(msg, item),
    CLEAN_MESSAGE: (msg, item) => cleanmessagehandler(msg, item),
    LOCK_CHANNEL: (msg, item) => lockChannelHandler(msg, item),
    UNLOCK_CHANNEL: (msg, item) => unlockChannelHandler(msg, item),
    SLOWMODE: (msg, item) => slowmodeHandler(msg, item),
    SEND_MESSAGE: (msg, item) => sendMessageHandler(msg, item),
    CREATE_INVITE: (msg, item) => createInviteHandler(msg, item),
    SERVER_INFO: (msg) => serverInfoHandler(msg),
    USER_INFO: (msg, item) => userInfoHandler(msg, item),
    ANNOUNCE: (msg, item) => announceMessageHandler(msg, item),
    HELP: (msg) => helpHandler(msg),
    MOVE_MEMBER: (msg, item) => moveMemberHandler(msg, item),
    MOVE_ALL: (msg, item) => moveAllHandler(msg, item),
    DISCONNECT_MEMBER: (msg, item) => disconnectMemberHandler(msg, item),
    VOICE_MUTE: (msg, item) => voiceMuteHandler(msg, item),
    VOICE_UNMUTE: (msg, item) => voiceUnmuteHandler(msg, item),
    VOICE_DEAFEN: (msg, item) => voiceDeafenHandler(msg, item),
    VOICE_UNDEAFEN: (msg, item) => voiceUndeafenHandler(msg, item),
    ADD_EMOJI: (msg, item) => addEmojiHandler(msg, item),
    DELETE_EMOJI: (msg, item) => deleteEmojiHandler(msg, item),
    AUDIT_LOG: (msg, item) => auditLogHandler(msg, item),
    LIST_MEMBERS: (msg, item) => listMembersHandler(msg, item),
    UNDO: (msg) => undoLastAction(msg.guild),
    DYNAMIC_REQUEST: async (msg, item) => {
        // This is intercepted by index.js before execution; if we got here
        // it means the confirmation flow wasn't used (legacy path).
        return `🔧 Fitur **${item.suggestedName || "?"}** butuh persetujuan. Coba ulangi request biar bot bisa nanya konfirmasi dulu.`;
    },
    DYNAMIC_EXECUTE: async (msg, item) => {
        const name = item.suggestedName || item.name;
        if (!name) return "❌ Dynamic command tanpa nama.";
        if (!hasDynamicCommand(name)) {
            return `❌ Dynamic command **${name}** belum ke-load. Coba restart bot atau bikin ulang.`;
        }
        const params = {
            raw: item.raw ?? msg.content,
            args: Array.isArray(item.args) ? item.args : [],
            ...item,
        };
        const exec = await executeDynamicCommand(name, msg, params);
        if (!exec.ok) return `❌ Error di **${name}**: ${exec.error}`;
        return exec.result || "✅ Dynamic command selesai.";
    },
};

export async function executeAiAction(message, instructions) {
    if (!instructions) return "AI gak ngasih instruksi apa-apa nih.";

    const actionList = Object.keys(instructions)
        .filter((key) => !isNaN(key))
        .map((key) => instructions[key]);

    // Handle DYNAMIC_REQUEST specially — caller (index.js) is expected to
    // intercept it for the confirmation flow, but if we get here, skip it.
    const realActions = actionList.filter(
        (item) => (item.action || "").toUpperCase() !== "DYNAMIC_REQUEST"
    );
    const dynamicRequests = actionList.filter(
        (item) => (item.action || "").toUpperCase() === "DYNAMIC_REQUEST"
    );

    if (realActions.length === 0 && dynamicRequests.length === 0) {
        return "Hah? jujur aja, gue gak ngerti apa yang lu mau.";
    }

    // If only DYNAMIC_REQUEST, return its data so index.js can drive confirmation.
    if (realActions.length === 0) {
        const req = dynamicRequests[0];
        return { __dynamicRequest: true, suggestedName: req.suggestedName, intent: req.intent, originalQuery: req.originalQuery };
    }

    // Expand DYNAMIC_EXECUTE references — if any item references a dynamic
    // command that's already loaded, mark it executed via the dedicated handler.
    for (const item of realActions) {
        const name = item.suggestedName || item.name;
        if (name && hasDynamicCommand(name) && (item.action || "").toUpperCase() === "EXECUTE_DYNAMIC") {
            item.action = "DYNAMIC_EXECUTE";
        }
    }

    const infoActions = ["HELP", "SERVER_INFO", "USER_INFO", "AUDIT_LOG", "LIST_MEMBERS", "UNDO"];
    const hasModifyingAction = actionList.some(item => !infoActions.includes(item.action?.toUpperCase()));

    if (hasModifyingAction) {
        try {
            await takeSnapshot(message.guild);
        } catch (snapErr) {
            console.error("Snapshot failed (non-blocking):", snapErr.message);
        }
    }

    const sortedActions = sortByDependency(actionList);

    const results = [];
    const executionLog = [];
    let failedCount = 0;

    for (const item of sortedActions) {
        const actionName = item.action?.toUpperCase();
        if (!actionName) {
            results.push("⚠️ Aksi tanpa nama, skip.");
            continue;
        }

        const handler = ACTION_HANDLER_MAP[actionName];
        if (!handler) {
            results.push(`⚠️ Aksi **${actionName}** belum gue pelajarin.`);
            executionLog.push({ action: actionName, status: "UNKNOWN" });
            continue;
        }

        try {
            const res = await handler(message, item);
            if (infoActions.includes(actionName)) {
                results.push(`\n${res}`);
            } else {
                results.push(res);
            }
            executionLog.push({ action: actionName, status: "OK", name: item.name });
            metrics.recordAction(actionName, true);
        } catch (handlerError) {
            failedCount++;
            const errorMsg = `❌ **${actionName}** gagal: ${handlerError.message || "Unknown error"}`;
            results.push(errorMsg);
            executionLog.push({ action: actionName, status: "FAILED", error: handlerError.message });
            metrics.recordAction(actionName, false);
            logger.error("handler.failed", { action: actionName, error: handlerError?.message });
        }

        if (sortedActions.indexOf(item) < sortedActions.length - 1) {
            await sleep(RATE_LIMIT_DELAY);
        }
    }

    if (instructions.aiExplanation) {
        let finalLog = `${instructions.aiExplanation}\n`;
        const infoData = results.filter(r => !r.includes("❌") && !r.includes("⚠️") && r.includes("\n"));
        if (infoData.length > 0) {
            finalLog += `\n${infoData.join("\n\n")}`;
        }
        
        const errors = results.filter(r => r && (r.includes("❌") || r.includes("⚠️")));
        if (errors.length > 0) {
            finalLog += `\n**Catatan Error:**\n${errors.join("\n")}`;
        }
        
        if (sortedActions.length > 1 && failedCount > 0) {
            finalLog += `\n📊 **Summary:** ${sortedActions.length - failedCount}/${sortedActions.length} aksi sukses.`;
        }
        
        return finalLog.trim();
    }

    if (sortedActions.length > 1 && failedCount > 0) {
        results.push(`\n📊 **Laporan Eksekusi:** ${sortedActions.length - failedCount}/${sortedActions.length} berhasil, ${failedCount} gagal.`);
    }

    return results.filter(r => r && r.trim()).join("\n");
}