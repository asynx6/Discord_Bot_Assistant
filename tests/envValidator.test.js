import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnv, EnvValidationError } from "../Modules/envValidator.js";

function setEnv(vars) {
    const saved = {};
    for (const key of Object.keys(vars)) {
        saved[key] = process.env[key];
        if (vars[key] === undefined) delete process.env[key];
        else process.env[key] = vars[key];
    }
    return () => {
        for (const key of Object.keys(vars)) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    };
}

test("rejects when TOKEN_BOT is missing", () => {
    const restore = setEnv({
        TOKEN_BOT: undefined,
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        MONGODB_URI: undefined,
    });
    try {
        assert.throws(() => validateEnv(), EnvValidationError);
    } finally {
        restore();
    }
});

test("rejects when DISCORD_OWNER_ID is missing", () => {
    const restore = setEnv({
        TOKEN_BOT: "tok",
        DISCORD_OWNER_ID: undefined,
        AI_APIKEY: "k",
        MONGODB_URI: undefined,
    });
    try {
        assert.throws(() => validateEnv(), EnvValidationError);
    } finally {
        restore();
    }
});

test("rejects when DISCORD_OWNER_ID is not a valid snowflake", () => {
    const restore = setEnv({
        TOKEN_BOT: "tok",
        DISCORD_OWNER_ID: "not-a-snowflake",
        AI_APIKEY: "k",
        MONGODB_URI: undefined,
    });
    try {
        assert.throws(() => validateEnv(), EnvValidationError);
    } finally {
        restore();
    }
});

test("rejects placeholder values", () => {
    const restore = setEnv({
        TOKEN_BOT: "your_discord_bot_token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        MONGODB_URI: undefined,
    });
    try {
        assert.throws(() => validateEnv(), EnvValidationError);
    } finally {
        restore();
    }
});

test("passes with minimum required vars", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: undefined,
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.token, "real-token");
        assert.equal(result.ownerId, "123456789012345678");
        assert.equal(result.hasAi, false);
        assert.equal(result.hasMongo, false);
    } finally {
        restore();
    }
});

test("reports hasAi=true when AI_APIKEY present", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "sk-xyz",
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.hasAi, true);
        assert.equal(result.aiToken, "sk-xyz");
    } finally {
        restore();
    }
});

test("does NOT honor legacy OPENROUTER_API_KEY", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: undefined,
        MONGODB_URI: undefined,
    });
    // Simulate a stale .env that still carries the old variable
    process.env.OPENROUTER_API_KEY = "sk-or-stale";
    try {
        const result = validateEnv();
        assert.equal(result.hasAi, false);
        assert.equal(result.aiToken, null);
    } finally {
        delete process.env.OPENROUTER_API_KEY;
        restore();
    }
});

test("defaults AI_BASE_URL to OpenRouter when not set", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        AI_BASE_URL: undefined,
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.aiBaseUrl, "https://openrouter.ai/api/v1");
    } finally {
        restore();
    }
});

test("respects custom AI_BASE_URL", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        AI_BASE_URL: "https://api.deepseek.com/v1",
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.aiBaseUrl, "https://api.deepseek.com/v1");
    } finally {
        restore();
    }
});

test("defaults AI_MODEL to gpt-4o-mini when not set", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        AI_MODEL: undefined,
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.aiModel, "openai/gpt-4o-mini");
    } finally {
        restore();
    }
});

test("respects custom AI_MODEL", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        AI_MODEL: "google/gemini-2.0-flash-exp",
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.aiModel, "google/gemini-2.0-flash-exp");
    } finally {
        restore();
    }
});

test("defaults AI_FALLBACK_MODEL to gpt-3.5-turbo when not set", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        AI_FALLBACK_MODEL: undefined,
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.aiFallbackModel, "openai/gpt-3.5-turbo");
    } finally {
        restore();
    }
});

test("treats AI_APIKEY placeholder as missing", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "your_ai_apikey",
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.hasAi, false);
    } finally {
        restore();
    }
});

test("strict mode requires AI_APIKEY", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: undefined,
        MONGODB_URI: undefined,
    });
    try {
        assert.throws(() => validateEnv({ strict: true }), EnvValidationError);
    } finally {
        restore();
    }
});

test("requireAi option requires AI_APIKEY", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: undefined,
        MONGODB_URI: undefined,
    });
    try {
        assert.throws(() => validateEnv({ requireAi: true }), EnvValidationError);
    } finally {
        restore();
    }
});

test("requireAi passes when AI_APIKEY present", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        MONGODB_URI: undefined,
    });
    try {
        const r = validateEnv({ requireAi: true });
        assert.equal(r.hasAi, true);
    } finally {
        restore();
    }
});

test("reports hasMongo=true when URI present", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        AI_APIKEY: "k",
        MONGODB_URI: "mongodb+srv://u:p@host/db",
    });
    try {
        const result = validateEnv();
        assert.equal(result.hasMongo, true);
        assert.equal(result.mongoUri, "mongodb+srv://u:p@host/db");
    } finally {
        restore();
    }
});

test("error carries the missing keys list", () => {
    const restore = setEnv({
        TOKEN_BOT: undefined,
        DISCORD_OWNER_ID: undefined,
        AI_APIKEY: undefined,
        MONGODB_URI: undefined,
    });
    try {
        try {
            validateEnv();
            assert.fail("should have thrown");
        } catch (err) {
            assert.ok(err instanceof EnvValidationError);
            assert.ok(Array.isArray(err.missing));
            assert.ok(err.missing.includes("TOKEN_BOT"));
            assert.ok(err.missing.includes("DISCORD_OWNER_ID"));
        }
    } finally {
        restore();
    }
});

test("snowflake format is enforced (length range 17-20)", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "12345",
        AI_APIKEY: "k",
        MONGODB_URI: undefined,
    });
    try {
        assert.throws(() => validateEnv(), EnvValidationError);
    } finally {
        restore();
    }
});
