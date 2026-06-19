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
        OPENROUTER_API_KEY: "k",
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
        OPENROUTER_API_KEY: "k",
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
        OPENROUTER_API_KEY: "k",
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
        OPENROUTER_API_KEY: "k",
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
        OPENROUTER_API_KEY: undefined,
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.token, "real-token");
        assert.equal(result.ownerId, "123456789012345678");
        assert.equal(result.hasOpenRouter, false);
        assert.equal(result.hasMongo, false);
    } finally {
        restore();
    }
});

test("reports hasOpenRouter=true when key present", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        OPENROUTER_API_KEY: "sk-or-xyz",
        MONGODB_URI: undefined,
    });
    try {
        const result = validateEnv();
        assert.equal(result.hasOpenRouter, true);
    } finally {
        restore();
    }
});

test("strict mode requires OPENROUTER_API_KEY", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        OPENROUTER_API_KEY: undefined,
        MONGODB_URI: undefined,
    });
    try {
        assert.throws(() => validateEnv({ strict: true }), EnvValidationError);
    } finally {
        restore();
    }
});

test("reports hasMongo=true when URI present", () => {
    const restore = setEnv({
        TOKEN_BOT: "real-token",
        DISCORD_OWNER_ID: "123456789012345678",
        OPENROUTER_API_KEY: "k",
        MONGODB_URI: "mongodb+srv://u:p@host/db",
    });
    try {
        const result = validateEnv();
        assert.equal(result.hasMongo, true);
    } finally {
        restore();
    }
});

test("error carries the missing keys list", () => {
    const restore = setEnv({
        TOKEN_BOT: undefined,
        DISCORD_OWNER_ID: undefined,
        OPENROUTER_API_KEY: undefined,
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
