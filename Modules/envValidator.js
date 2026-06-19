import dotenv from "dotenv";

dotenv.config();

/**
 * Validate required environment variables at startup.
 * Fails fast with a clear, actionable error message if anything is missing.
 *
 * Required: TOKEN_BOT, DISCORD_OWNER_ID
 * Optional but recommended: AI_TOKEN (or legacy OPENROUTER_API_KEY)
 * Optional: MONGODB_URI (snapshot/undo disabled if absent)
 *
 * v1.4.0 — Unified AI configuration:
 *   AI_TOKEN    — preferred API key (any OpenAI-compatible provider)
 *   AI_BASE_URL — provider base URL (default: https://openrouter.ai/api/v1)
 *   AI_MODEL    — model identifier (default: openai/gpt-4o-mini)
 *   Backward compatibility: if AI_TOKEN is missing but OPENROUTER_API_KEY
 *   is set, the legacy key is used and a soft warning is logged.
 */

const PLACEHOLDER_VALUES = new Set([
    "",
    "your_discord_bot_token",
    "your_openrouter_api_key",
    "your_ai_token",
    "your_discord_id",
    "your_model_name",
    "your_base_url",
    "masukkan",
]);

function isMissing(key) {
    const v = process.env[key];
    if (v === undefined || v === null) return true;
    if (PLACEHOLDER_VALUES.has(String(v).trim().toLowerCase())) return true;
    return false;
}

function isSnowflake(id) {
    return typeof id === "string" && /^\d{17,20}$/.test(id);
}

class EnvValidationError extends Error {
    constructor(missing) {
        super(`Environment validation failed: missing ${missing.join(", ")}`);
        this.name = "EnvValidationError";
        this.missing = missing;
    }
}

/**
 * Validate all environment variables. Returns a normalized config object
 * the rest of the bot can use without further env reads.
 *
 * @param {{ strict?: boolean, requireAi?: boolean }} [options]
 * @returns {{
 *   token: string,
 *   ownerId: string,
 *   hasAi: boolean,
 *   aiToken: string|null,
 *   aiBaseUrl: string,
 *   aiModel: string,
 *   aiSource: 'env'|'legacy'|'missing',
 *   hasMongo: boolean,
 *   mongoUri: string|null
 * }}
 */
export function validateEnv({ strict = false, requireAi = false } = {}) {
    const missing = [];

    if (isMissing("TOKEN_BOT")) missing.push("TOKEN_BOT");
    if (isMissing("DISCORD_OWNER_ID")) missing.push("DISCORD_OWNER_ID");
    else if (!isSnowflake(process.env.DISCORD_OWNER_ID)) {
        missing.push("DISCORD_OWNER_ID (must be a valid snowflake ID, e.g. 123456789012345678)");
    }

    // AI configuration — prefer new AI_TOKEN, fall back to legacy OPENROUTER_API_KEY
    const aiToken = !isMissing("AI_TOKEN") ? process.env.AI_TOKEN : null;
    const legacyAiKey = !isMissing("OPENROUTER_API_KEY") ? process.env.OPENROUTER_API_KEY : null;
    const resolvedAiToken = aiToken || legacyAiKey;

    let aiSource = "missing";
    if (aiToken) aiSource = "env";
    else if (legacyAiKey) aiSource = "legacy";

    const aiBaseUrl = process.env.AI_BASE_URL || "https://openrouter.ai/api/v1";
    const aiModel = process.env.AI_MODEL || "openai/gpt-4o-mini";

    if (requireAi && !resolvedAiToken) {
        missing.push("AI_TOKEN (or legacy OPENROUTER_API_KEY)");
    }

    const hasMongo = !isMissing("MONGODB_URI");
    const mongoUri = hasMongo ? process.env.MONGODB_URI : null;

    if (strict && !resolvedAiToken) {
        missing.push("AI_TOKEN (or legacy OPENROUTER_API_KEY)");
    }

    if (missing.length > 0) {
        const lines = [
            "╔════════════════════════════════════════════════════════╗",
            "║           ❌  ENVIRONMENT VALIDATION FAILED            ║",
            "╚════════════════════════════════════════════════════════╝",
            "",
            "Missing or invalid environment variables:",
            ...missing.map((m) => `  • ${m}`),
            "",
            "How to fix:",
            "  1. Copy .env.example to .env",
            "  2. Fill in the values",
            "  3. Restart the bot",
            "",
            "Required:",
            "  - TOKEN_BOT        (Discord bot token)",
            "  - DISCORD_OWNER_ID (your Discord user ID, snowflake format)",
            "",
            "Recommended (AI):",
            "  - AI_TOKEN    (any OpenAI-compatible API key)",
            "  - AI_BASE_URL (default: https://openrouter.ai/api/v1)",
            "  - AI_MODEL    (default: openai/gpt-4o-mini)",
            "",
            "Optional:",
            "  - MONGODB_URI (snapshot/undo + persistent context)",
            "",
        ];
        throw new EnvValidationError(missing, lines.join("\n"));
    }

    return {
        token: process.env.TOKEN_BOT,
        ownerId: process.env.DISCORD_OWNER_ID,
        hasAi: !!resolvedAiToken,
        aiToken: resolvedAiToken,
        aiBaseUrl,
        aiModel,
        aiSource,
        hasMongo,
        mongoUri,
    };
}

export { EnvValidationError };
