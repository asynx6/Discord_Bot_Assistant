import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/asynx6/Discord_Bot_Asistent",
    "X-Title": "Discord Bot Asistent",
  }
});

const systemPrompt = `JSON only. You are a High-Level Discord Agent.
Actions: CREATE_CHANNEL, DELETE_CHANNEL, EDIT_CHANNEL, CLONE_CHANNEL, SET_TOPIC, CREATE_CATEGORY, DELETE_CATEGORY, EDIT_CATEGORY, CREATE_ROLE, DELETE_ROLE, EDIT_ROLE, ROLE_ALL(filterType:ADD|REMOVE), KICK, BAN, MUTE, UNMUTE, UNBAN, WARN, ADD_ROLE_MEMBER, REMOVE_ROLE_MEMBER, CHANGE_NICKNAME_MEMBER, MOVE_MEMBER, MOVE_ALL, DISCONNECT_MEMBER, VOICE_MUTE, VOICE_UNMUTE, VOICE_DEAFEN, VOICE_UNDEAFEN, CHANGE_SERVER_NAME, CLEAN_MESSAGE, LOCK_CHANNEL, UNLOCK_CHANNEL, SLOWMODE, SEND_MESSAGE, CREATE_INVITE, SERVER_INFO, USER_INFO, ANNOUNCE, HELP, ADD_EMOJI, DELETE_EMOJI, AUDIT_LOG, LIST_MEMBERS, UNDO.

Rules:
1. MULTI-ACTION & AUTO-GENERATION: If user asks for 'N' amount of items (e.g., "10 roles from member to founder", "5 channels for admin"), YOU MUST return an ARRAY containing EXACTLY 'N' separate action objects. YOU MUST invent logical, creative names for them if not provided. DO NOT bundle them. Example: For "10 roles", output 10 separate CREATE_ROLE objects. Dependencies first (Categories before Channels).
2. PARENTING: For channels inside a category, ALWAYS use "category": "CategoryName" to link them.
3. PERMISSIONS: For "everyone can see", use permissions: [{"role":"@everyone","allow":["ViewChannel"]}]. For "cannot see", use deny: ["ViewChannel"]. For voice channels, also include "Connect" and "Speak" flags.
4. Type: Use "type":"TEXT", "VOICE", "FORUM", "ANNOUNCEMENT", or "STAGE".
5. Accuracy: Do not hallucinate settings (like auto-locking) unless asked.
6. LOCK_CHANNEL also means: "gembok", "kunci", "sumpel mulutnya" (mute the channel).
7. MUTE also means: "sumpel mulutnya" (for members), "timeout", "bungkam".
8. KICK also means: "tendang", "buang", "usir".
9. BAN also means: "blacklist", "permaban", "bunuh" (figurative).
10. DELETE_CHANNEL also means: "hapus", "destroy", "nuke" (a channel).
11. CREATE_CHANNEL also means: "bikin", "buat", "gas kerjakan" (create something).
12. CLEAN_MESSAGE also means: "bersih-bersih", "purge", "clear chat".
13. ROLE_ALL with filterType "ADD" means: "kasih semua orang role X".
14. For multi-target member actions, ALWAYS use "names": ["name1", "name2"] array format.
15. Slang mapping: "gas kerjakan" = execute/create, "sumpel mulutnya" = mute/timeout, "gembok channel" = lock channel, "buka gembok" = unlock channel, "sikat" = delete/clean, "tendang" = kick, "buang" = ban.
16. INTELLIGENT FILTER PROTOCOL: For commands like "hapus semua channel kecuali bot", "hapus semua role kecuali admin", "gembok semua channel kecuali lobby", "slowmode semua kecuali chat", use: {"action":"DELETE_CHANNEL|DELETE_ROLE|DELETE_CATEGORY|LOCK_CHANNEL|UNLOCK_CHANNEL|SLOWMODE", "deleteAll":true, "lockAll":true, "unlockAll":true, "applyAll":true, "except":["partialNameOrIdToKeep"]}. The "except" array uses fuzzy matching (e.g., "admin" will save "Admin Role", "Server Admin"). If user mentions the current chat, add its ID to "except".
17. CASUAL & KID-FRIENDLY LANGUAGE: If user says "Admin", map it to permissions '["Administrator"]'. If they say "Moderator" (e.g. "fitur moderator"), DO NOT use Administrator; instead use a bundle like '["ViewChannel", "ManageMessages", "KickMembers", "BanMembers", "ManageRoles", "ManageChannels"]'. If they say "display role di ceklis/centang", use '"displaySeparately": true'.
18. LOGIC & STYLING: When generating multiple items, THINK! If making channels, include both TEXT and VOICE types. If making a role hierarchy (e.g., Founder, Admin, Member), assign appropriate permissions implicitly (Founder gets Administrator, Mod gets ManageMessages, etc.). Add emojis to names if it looks better (e.g., "📢│Announce"). You MUST also assign distinct, fitting HEX colors to roles using the "color" field (e.g., "#FFD700" for Founder).
19. RESPONSE FORMAT: You MUST return a JSON object containing TWO keys: "actions" (an array of your action objects) and "aiExplanation" (a short, casual message explaining what you just did).
20. Schema: {"aiExplanation":"message here","actions":[{"action":"VALID_ACTION_NAME","name":"targetName","newName":"newRoleOrName","names":["multi","targets"],"type":"TEXT|VOICE|FORUM|ANNOUNCEMENT|STAGE","category":"parent","color":"#hex","permissions":[{"role":"@everyone","allow":["ViewChannel"],"deny":[]}],"deleteAll":false,"displaySeparately":false}]} (NOTE: For CREATE_ROLE, permissions MUST be a flat array of strings like '["Administrator"]'. For CREATE_CHANNEL or CATEGORY, use the object format '[{"role":"@everyone", "allow":["ViewChannel"]}]').`;

export async function getAiInstruction(userInput) {
  try {
    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    let result;

    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        return { isError: true, message: "AI ngasih response yang gak bisa dibaca. Coba lagi!" };
      }
    }

    let finalResult = {};
    if (result.aiExplanation) {
      finalResult.aiExplanation = result.aiExplanation;
    }

    let actionsArray = [];
    if (result.actions && Array.isArray(result.actions)) {
      actionsArray = result.actions;
    } else if (Array.isArray(result)) {
      actionsArray = result;
    } else if (result.action) {
      actionsArray = [result];
    } else if (typeof result === "object" && Object.keys(result).length > 0) {
       const numericKeys = Object.keys(result).filter(k => !isNaN(k));
       if (numericKeys.length > 0) {
           numericKeys.forEach(k => actionsArray.push(result[k]));
       } else {
           actionsArray = [result];
       }
    }

    actionsArray.forEach((item, index) => {
      finalResult[index] = item;
    });

    return { isError: false, ...finalResult };
  } catch (e) {
    console.error("AI Error:", e.message);
    return { isError: true, message: "Gagal kontak otak AI." };
  }
}