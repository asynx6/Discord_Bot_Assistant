import OpenAI from "openai";
import dotenv from "dotenv";
import { logger } from "./logger.js";
import { metrics } from "./metrics.js";

dotenv.config();

let openaiClient = null;

/**
 * Resolve AI configuration from environment.
 * - AI_APIKEY is the single canonical credential (any OpenAI-compatible provider).
 * - AI_BASE_URL defaults to OpenRouter.
 * - AI_MODEL defaults to gpt-4o-mini.
 */
function resolveAiConfig() {
    const token =
        process.env.AI_APIKEY &&
        process.env.AI_APIKEY.trim() &&
        process.env.AI_APIKEY !== "your_ai_apikey"
            ? process.env.AI_APIKEY
            : null;

    const baseUrl = process.env.AI_BASE_URL || "https://openrouter.ai/api/v1";
    const model = process.env.AI_MODEL || "openai/gpt-4o-mini";
    const fallbackModel = process.env.AI_FALLBACK_MODEL || "openai/gpt-3.5-turbo";

    return { token, baseUrl, model, fallbackModel };
}

function getClient() {
    if (openaiClient) return openaiClient;

    const { token, baseUrl } = resolveAiConfig();
    if (!token) {
        return null;
    }

    // Build default headers — some providers (e.g. OpenRouter) require attribution
    const defaultHeaders = {
        "HTTP-Referer": "https://github.com/asynx6/Discord_Bot_Asistent",
        "X-Title": "Discord Bot Asistent",
    };

    openaiClient = new OpenAI({
        baseURL: baseUrl,
        apiKey: token,
        defaultHeaders,
    });
    return openaiClient;
}

const PRIMARY_MODEL = process.env.AI_MODEL || "openai/gpt-4o-mini";
const FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || "openai/gpt-3.5-turbo";

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 800;

const systemPrompt = `JSON only. You are a High-Level Discord Agent.
Actions: CREATE_CHANNEL, DELETE_CHANNEL, EDIT_CHANNEL, CLONE_CHANNEL, SET_TOPIC, CREATE_CATEGORY, DELETE_CATEGORY, EDIT_CATEGORY, CREATE_ROLE, DELETE_ROLE, EDIT_ROLE, ROLE_ALL(filterType:ADD|REMOVE), KICK, BAN, MUTE, UNMUTE, UNBAN, WARN, ADD_ROLE_MEMBER, REMOVE_ROLE_MEMBER, CHANGE_NICKNAME_MEMBER, MOVE_MEMBER, MOVE_ALL, DISCONNECT_MEMBER, VOICE_MUTE, VOICE_UNMUTE, VOICE_DEAFEN, VOICE_UNDEAFEN, CHANGE_SERVER_NAME, CLEAN_MESSAGE, LOCK_CHANNEL, UNLOCK_CHANNEL, SLOWMODE, SEND_MESSAGE, CREATE_INVITE, SERVER_INFO, USER_INFO, ANNOUNCE, HELP, ADD_EMOJI, DELETE_EMOJI, AUDIT_LOG, LIST_MEMBERS, UNDO, DYNAMIC_REQUEST.

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
18. LOGIC & STYLING: When generating multiple items, THINK! If making channels, include both TEXT and VOICE types. If making a role hierarchy (e.g., Founder, Admin, Member), assign appropriate permissions implicitly (Founder gets Administrator, Mod gets ManageMessages, etc.). Add emojis to names if it looks better (e.g., "📢│Announce"). YOU MUST ALWAYS assign distinct, fitting, and beautiful HEX colors to roles using the "color" field, EVEN IF THE USER DOES NOT ASK FOR IT (e.g., "#FFD700" for Founder, "#E91E63" for Member). NEVER leave the color empty or "null".
19. RESPONSE FORMAT: You MUST return a JSON object containing TWO keys: "actions" (an array of your action objects) and "aiExplanation" (a short, casual message explaining what you just did).
20. Schema: {"aiExplanation":"message here","actions":[{"action":"VALID_ACTION_NAME","name":"targetName","newName":"newRoleOrName","names":["multi","targets"],"targetUser":"userIdOrMention","amount":100,"type":"TEXT|VOICE|FORUM|ANNOUNCEMENT|STAGE","category":"parent","color":"#hex","permissions":[{"role":"@everyone","allow":["ViewChannel"],"deny":[]}],"deleteAll":false,"displaySeparately":false}]} (NOTE: For CREATE_ROLE, permissions MUST be a flat array of strings like '["Administrator"]'. For CREATE_CHANNEL or CATEGORY, use the object format '[{"role":"@everyone", "allow":["ViewChannel"]}]').
21. DYNAMIC_REQUEST (USE ONLY WHEN NO OTHER ACTION FITS): If the user asks for a command, feature, or behavior that NONE of the above built-in actions can fulfill (e.g. "bikin command gacor", "kalo gw ketik hello jawab halo", "command buat hitung kata"), output: {"action":"DYNAMIC_REQUEST","suggestedName":"short_snake_case_name","intent":"one-line description of what the new command should do","originalQuery":"verbatim user request"}. DO NOT use DYNAMIC_REQUEST for things the built-in actions can already handle. suggestedName must be lowercase, alphanumeric + underscore, max 32 chars.`;

const codeGenSystemPrompt = `You are a Node.js code generator for a Discord bot's dynamic command system.
Output ONLY valid JavaScript code (no markdown fences, no commentary).

Constraints:
- The code will be saved to commands/dynamic/handle_<name>.js and dynamically imported.
- You MUST export a default async function with signature: async (message, params) => string
  OR export an async named function called 'handle' with the same signature.
- message is a discord.js Message object.
- params is an object containing user-provided arguments (params.raw, params.args, params.*).
- Return a string (the reply message) OR call message.reply(...) and return a status string.
- Use 'import' statements at the top (this is an ES module file).
- You may import from "discord.js" freely.
- You may import from "../../Modules/logger.js" if logging is needed.
- NEVER use eval(), new Function(), child_process, process.exit(), fs.rm, spawn, or exec.
- NEVER write to disk outside commands/dynamic/.
- Keep the code small (under 50KB) and self-contained.
- If you cannot fulfill the request safely, throw an Error with a clear message.

Example shape:
import { EmbedBuilder } from "discord.js";

export default async function handle(message, params) {
    const embed = new EmbedBuilder()
        .setTitle("Hello")
        .setDescription(String(params.raw ?? "world"));
    await message.reply({ embeds: [embed] });
    return "Sent embed.";
}`;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
    if (!err) return false;
    const status = err?.status ?? err?.response?.status;
    if (status && [408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;

    const code = err?.code ?? err?.cause?.code;
    if (code && ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ECONNREFUSED"].includes(code)) return true;

    const msg = String(err?.message ?? "").toLowerCase();
    if (msg.includes("timeout") || msg.includes("rate limit") || msg.includes("temporarily")) return true;
    if (msg.includes("empty content")) return true;

    return false;
}

/**
 * Translate raw AI errors into Indonesian, actionable messages.
 * 401/403 (auth) — never retry; tell user the key is bad.
 * 402 (payment) — never retry; tell user to top up credits.
 * 429 (rate limit) — retry handled by isRetryable, but message clarifies.
 * Other — generic "gagal kontak" message.
 */
function classifyAiError(err, attempts) {
    const status = err?.status ?? err?.response?.status;
    const rawMsg = err?.response?.data?.error?.message ?? err?.error?.message ?? err?.message ?? "";
    if (status === 401 || status === 403) {
        return `🔑 API key ditolak oleh provider (${status}). Kemungkinan AI_APIKEY di .env udah expired/revoked. Cek & ganti di https://openrouter.ai/keys — pesan dari provider: "${rawMsg}"`;
    }
    if (status === 402) {
        return `💰 Credit di provider udah abis (402). Top up dulu di ${process.env.AI_BASE_URL || "https://openrouter.ai"} sebelum lanjut. Pesan provider: "${rawMsg}"`;
    }
    return `Gagal kontak otak AI setelah ${attempts} percobaan: ${rawMsg || "unknown error"}`;
}

/**
 * Lightweight startup probe — verifies the API key actually works before
 * the bot accepts traffic. Cheap call (1 token). Returns
 * `{ ok: true, model }` on success or `{ ok: false, status, message }` on failure.
 */
export async function checkAiHealth() {
    const client = getClient();
    if (!client) {
        return { ok: false, status: null, message: "AI_APIKEY belum diisi di .env." };
    }
    try {
        const completion = await client.chat.completions.create({
            model: PRIMARY_MODEL,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
            temperature: 0,
        });
        return { ok: true, model: completion?.model ?? PRIMARY_MODEL };
    } catch (err) {
        const status = err?.status ?? err?.response?.status ?? null;
        return {
            ok: false,
            status,
            message: err?.response?.data?.error?.message ?? err?.error?.message ?? err?.message ?? String(err),
        };
    }
}

// Internal — exported for unit tests
export const _internal = { extractActions, isRetryable, buildUserContent, resolveAiConfig, classifyAiError, checkAiHealth };

/**
 * Extract action array from whatever shape the LLM returns.
 * Tolerant to: { actions: [...] }, bare array, { action: {...} }, { "0": {...}, "1": {...} }
 */
function extractActions(result) {
    if (Array.isArray(result)) return result;

    if (result && Array.isArray(result.actions)) return result.actions;

    if (result && typeof result === "object" && result.action) return [result];

    if (result && typeof result === "object") {
        const numericKeys = Object.keys(result).filter((k) => /^\d+$/.test(k));
        if (numericKeys.length > 0) {
            return numericKeys
                .sort((a, b) => Number(a) - Number(b))
                .map((k) => result[k])
                .filter((v) => v && typeof v === "object");
        }
    }

    return [];
}

/**
 * Build the user-message content for an LLM call. Text-only requests stay as
 * a plain string; vision requests become an array of content blocks following
 * the OpenAI multimodal format (`text` + `image_url`).
 *
 * Kept as a pure function so it can be unit-tested without mocking the client.
 *
 * @param {string} userInput
 * @param {string[]} [imageUrls]
 * @returns {string | Array<{type: string, text?: string, image_url?: {url: string}}>}
 */
export function buildUserContent(userInput, imageUrls = []) {
    const text = String(userInput ?? "").trim();
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return text;
    }
    const blocks = [];
    if (text) blocks.push({ type: "text", text });
    for (const url of imageUrls) {
        if (typeof url === "string" && url) {
            blocks.push({ type: "image_url", image_url: { url } });
        }
    }
    return blocks;
}

async function callLlmOnce(client, model, userInput, imageUrls = []) {
    const content = buildUserContent(userInput, imageUrls);
    return client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content },
        ],
        response_format: { type: "json_object" },
    });
}

/**
 * Get the next AI instruction for a user request.
 *
 * If `imageUrls` is non-empty, the message is sent as multimodal content
 * (text + image_url blocks). The provider may reject the request if the
 * active model does not support images — in that case the raw error is
 * attached to the response under `rawError` so the caller can detect
 * vision-unsupported errors via `isVisionUnsupportedError` and fall back
 * to a text-only retry.
 *
 * @param {string} userInput
 * @param {string[]} [imageUrls]
 * @returns {Promise<{isError: boolean, rawError?: unknown, message?: string, [k: string]: any}>}
 */
export async function getAiInstruction(userInput, imageUrls = []) {
    const client = getClient();
    if (!client) {
        logger.error("ai.no_api_key");
        return { isError: true, message: "AI_APIKEY belum diisi di .env. Fitur AI nonaktif." };
    }

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const model = attempt === MAX_RETRIES ? FALLBACK_MODEL : PRIMARY_MODEL;

        try {
            logger.debug("ai.call.attempt", { attempt, model, hasImages: imageUrls.length > 0 });
            const completion = await callLlmOnce(client, model, userInput, imageUrls);

            let content = completion.choices?.[0]?.message?.content;
            const reasoningContent = completion.choices?.[0]?.message?.reasoning_content;

            // Log raw response for debugging empty content issues
            if (!content) {
                logger.debug("ai.empty_content.raw_response", {
                    model,
                    finishReason: completion.choices?.[0]?.finish_reason,
                    hasReasoningContent: Boolean(reasoningContent),
                    reasoningLength: reasoningContent?.length ?? 0,
                    usage: completion.usage,
                });
            }

            // Fallback to reasoning_content for reasoning models (e.g., Nemotron)
            if (!content && reasoningContent) {
                logger.info("ai.reasoning_fallback.used", { model, reasoningLength: reasoningContent.length });
                content = reasoningContent;
            }

            if (!content) {
                throw new Error("AI returned empty content");
            }

            const usage = completion.usage;
            if (usage) {
                metrics.recordAiCall({
                    inputTokens: usage.prompt_tokens ?? 0,
                    outputTokens: usage.completion_tokens ?? 0,
                });
            }

            let parsed;
            try {
                parsed = JSON.parse(content);
            } catch (parseErr) {
                const match = content.match(/\{[\s\S]*\}/);
                if (match) {
                    parsed = JSON.parse(match[0]);
                } else {
                    throw new Error("AI response is not valid JSON");
                }
            }

            const actions = extractActions(parsed);
            if (actions.length === 0 && !parsed.aiExplanation) {
                throw new Error("AI response contained no actions");
            }

            const finalResult = {};
            if (parsed.aiExplanation) finalResult.aiExplanation = parsed.aiExplanation;

            actions.forEach((item, idx) => {
                finalResult[idx] = item;
            });

            logger.info("ai.call.success", { attempt, model, actionCount: actions.length, hasImages: imageUrls.length > 0 });
            return { isError: false, ...finalResult };
        } catch (err) {
            lastError = err;
            logger.warn("ai.call.failed", {
                attempt,
                model,
                hasImages: imageUrls.length > 0,
                error: err?.message ?? String(err),
            });

            if (!isRetryable(err) || attempt === MAX_RETRIES) break;

            const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await sleep(delayMs);
        }
    }

    logger.error("ai.call.exhausted", { error: lastError?.message, hasImages: imageUrls.length > 0 });
    return {
        isError: true,
        rawError: lastError,
        message: classifyAiError(lastError, MAX_RETRIES),
    };
}

/**
 * Generate raw JavaScript code for a new dynamic command.
 * Used by the confirmation flow when user approves building a new command.
 *
 * @param {string} suggestedName - snake_case identifier for the new command
 * @param {string} intent - one-line description of what it should do
 * @param {string} originalQuery - the user's original request verbatim
 * @returns {Promise<{ isError: boolean, code?: string, message?: string }>}
 */
export async function generateDynamicCode(suggestedName, intent, originalQuery) {
    const client = getClient();
    if (!client) {
        return { isError: true, message: "AI_APIKEY belum diisi di .env." };
    }

    const userPrompt = [
        `Command name: ${suggestedName}`,
        `Intent: ${intent}`,
        `Original user request: ${originalQuery}`,
        ``,
        `Return ONLY the JavaScript source code (no markdown, no commentary).`,
    ].join("\n");

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const model = attempt === MAX_RETRIES ? FALLBACK_MODEL : PRIMARY_MODEL;
        try {
            logger.debug("ai.codegen.attempt", { attempt, model, suggestedName });

            const completion = await client.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: codeGenSystemPrompt },
                    { role: "user", content: userPrompt },
                ],
            });

            const raw = completion.choices?.[0]?.message?.content ?? "";
            const usage = completion.usage;
            if (usage) {
                metrics.recordAiCall({
                    inputTokens: usage.prompt_tokens ?? 0,
                    outputTokens: usage.completion_tokens ?? 0,
                });
            }

            // Strip markdown code fences if the model added them.
            let code = String(raw).trim();
            const fenceMatch = code.match(/^```(?:javascript|js)?\s*\n?([\s\S]*?)\n?```\s*$/);
            if (fenceMatch) code = fenceMatch[1].trim();

            if (!code) throw new Error("AI returned empty code");

            logger.info("ai.codegen.success", { attempt, model, suggestedName, bytes: code.length });
            return { isError: false, code };
        } catch (err) {
            lastError = err;
            logger.warn("ai.codegen.failed", {
                attempt,
                model,
                suggestedName,
                error: err?.message ?? String(err),
            });
            if (!isRetryable(err) || attempt === MAX_RETRIES) break;
            const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await sleep(delayMs);
        }
    }

    logger.error("ai.codegen.exhausted", { suggestedName, error: lastError?.message });
    return {
        isError: true,
        message: `Gagal generate kode setelah ${MAX_RETRIES} percobaan: ${lastError?.message ?? "unknown error"}`,
    };
}

/**
 * Regenerate code with the runtime error from the previous attempt included
 * as context. Used by the self-healing flow when generated code crashes at runtime.
 *
 * @param {string} suggestedName
 * @param {string} intent
 * @param {string} originalQuery
 * @param {string} previousCode - the code that just crashed
 * @param {string} errorMessage - the runtime error captured
 * @param {number} attempt - which self-heal attempt this is (1-indexed)
 * @returns {Promise<{ isError: boolean, code?: string, message?: string }>}
 */
export async function regenerateWithErrorContext(suggestedName, intent, originalQuery, previousCode, errorMessage, attempt = 1) {
    const client = getClient();
    if (!client) {
        return { isError: true, message: "AI_APIKEY belum diisi di .env." };
    }

    const userPrompt = [
        `Command name: ${suggestedName}`,
        `Intent: ${intent}`,
        `Original user request: ${originalQuery}`,
        ``,
        `PREVIOUS ATTEMPT (attempt #${attempt}) PRODUCED THIS CODE:`,
        "```javascript",
        previousCode,
        "```",
        ``,
        `BUT IT CRASHED AT RUNTIME WITH THIS ERROR:`,
        "```",
        errorMessage,
        "```",
        ``,
        `Please regenerate a FIXED version. Common fixes:`,
        `- Make sure the function signature matches: async (message, params) => string`,
        `- Wrap risky API calls in try/catch`,
        `- Check that discord.js method names exist (e.g. message.reply, message.channel.send)`,
        `- Ensure all imported names are actually exported from the modules`,
        `- Throw a clear Error if a required param is missing`,
        ``,
        `Return ONLY the corrected JavaScript source code (no markdown commentary).`,
    ].join("\n");

    let lastError = null;

    for (let tryAttempt = 1; tryAttempt <= MAX_RETRIES; tryAttempt++) {
        const model = tryAttempt === MAX_RETRIES ? FALLBACK_MODEL : PRIMARY_MODEL;
        try {
            logger.debug("ai.codegen.heal.attempt", { attempt, tryAttempt, model, suggestedName });
            const completion = await client.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: codeGenSystemPrompt },
                    { role: "user", content: userPrompt },
                ],
            });

            const raw = completion.choices?.[0]?.message?.content ?? "";
            const usage = completion.usage;
            if (usage) {
                metrics.recordAiCall({
                    inputTokens: usage.prompt_tokens ?? 0,
                    outputTokens: usage.completion_tokens ?? 0,
                });
            }

            let code = String(raw).trim();
            const fenceMatch = code.match(/^```(?:javascript|js)?\s*\n?([\s\S]*?)\n?```\s*$/);
            if (fenceMatch) code = fenceMatch[1].trim();

            if (!code) throw new Error("AI returned empty code on heal attempt");
            logger.info("ai.codegen.heal.success", { attempt, tryAttempt, model, suggestedName, bytes: code.length });
            return { isError: false, code };
        } catch (err) {
            lastError = err;
            logger.warn("ai.codegen.heal.failed", {
                attempt,
                tryAttempt,
                model,
                suggestedName,
                error: err?.message ?? String(err),
            });
            if (!isRetryable(err) || tryAttempt === MAX_RETRIES) break;
            const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, tryAttempt - 1);
            await sleep(delayMs);
        }
    }

    logger.error("ai.codegen.heal.exhausted", { suggestedName, error: lastError?.message });
    return {
        isError: true,
        message: `Gagal regenerate kode setelah ${MAX_RETRIES} percobaan: ${lastError?.message ?? "unknown error"}`,
    };
}