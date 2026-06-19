import dotenv from "dotenv";

dotenv.config();

/**
 * Validate required environment variables at startup.
 * Fails fast with a clear, actionable error message if anything is missing.
 *
 * Required: TOKEN_BOT, DISCORD_OWNER_ID
 * Optional but recommended: AI_APIKEY (single canonical AI credential)
 * Optional: MONGODB_URI (snapshot/undo disabled if absent)
 *
 * v1.4.0 — Unified AI configuration:
 *   AI_APIKEY    — any OpenAI-compatible API key (OpenRouter, DeepSeek, OpenAI, etc.)
 *   AI_BASE_URL  — provider base URL (default: https://openrouter.ai/api/v1)
 *   AI_MODEL     — primary model identifier (default: openai/gpt-4o-mini)
 *   AI_FALLBACK_MODEL — fallback after retries (default: openai/gpt-3.5-turbo)
 *
 * Note: The legacy `OPENROUTER_API_KEY` variable is intentionally NOT honored.
 * Migrate by renaming it to `AI_APIKEY` in your `.env` file.
 */

const PLACEHOLDER_VALUES = new Set([
    "",
    "your_discord_bot_token",
    "your_ai_apikey",
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
 *   aiFallbackModel: string,
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

    // AI configuration — single canonical credential is AI_APIKEY
    const aiToken = !isMissing("AI_APIKEY") ? process.env.AI_APIKEY : null;

    const aiBaseUrl = process.env.AI_BASE_URL || "https://openrouter.ai/api/v1";
    const aiModel = process.env.AI_MODEL || "openai/gpt-4o-mini";
    const aiFallbackModel = process.env.AI_FALLBACK_MODEL || "openai/gpt-3.5-turbo";

    if (requireAi && !aiToken) {
        missing.push("AI_APIKEY");
    }

    const hasMongo = !isMissing("MONGODB_URI");
    const mongoUri = hasMongo ? process.env.MONGODB_URI : null;

    if (strict && !aiToken) {
        missing.push("AI_APIKEY");
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
            "  - AI_APIKEY        (any OpenAI-compatible API key)",
            "  - AI_BASE_URL      (default: https://openrouter.ai/api/v1)",
            "  - AI_MODEL         (default: openai/gpt-4o-mini)",
            "  - AI_FALLBACK_MODEL (default: openai/gpt-3.5-turbo)",
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
        hasAi: !!aiToken,
        aiToken,
        aiBaseUrl,
        aiModel,
        aiFallbackModel,
        hasMongo,
        mongoUri,
    };
}

export { EnvValidationError };
