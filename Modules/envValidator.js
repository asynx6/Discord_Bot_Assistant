import dotenv from "dotenv";

dotenv.config();

/**
 * Validate required environment variables at startup.
 * Fails fast with a clear, actionable error message if anything is missing.
 *
 * Required: TOKEN_BOT, DISCORD_OWNER_ID
 * Optional but recommended: OPENROUTER_API_KEY (falls back gracefully)
 * Optional: MONGODB_URI (snapshot/undo disabled if absent)
 */

const PLACEHOLDER_VALUES = new Set([
    "",
    "your_discord_bot_token",
    "your_openrouter_api_key",
    "your_discord_id",
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

export function validateEnv({ strict = false } = {}) {
    const missing = [];

    if (isMissing("TOKEN_BOT")) missing.push("TOKEN_BOT");
    if (isMissing("DISCORD_OWNER_ID")) missing.push("DISCORD_OWNER_ID");
    else if (!isSnowflake(process.env.DISCORD_OWNER_ID)) {
        missing.push("DISCORD_OWNER_ID (must be a valid snowflake ID, e.g. 123456789012345678)");
    }

    const hasOpenRouter = !isMissing("OPENROUTER_API_KEY");
    const hasMongo = !isMissing("MONGODB_URI");

    if (strict && !hasOpenRouter) {
        missing.push("OPENROUTER_API_KEY");
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
            "Recommended:",
            "  - OPENROUTER_API_KEY (LLM provider key)",
            "  - MONGODB_URI        (for snapshot/undo)",
            "",
        ];
        throw new EnvValidationError(missing, lines.join("\n"));
    }

    return {
        token: process.env.TOKEN_BOT,
        ownerId: process.env.DISCORD_OWNER_ID,
        hasOpenRouter,
        hasMongo,
    };
}

export { EnvValidationError };
