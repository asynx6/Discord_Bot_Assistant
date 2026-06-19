import fs from "node:fs";
import path from "node:path";

/**
 * Production-grade structured logger.
 * - Supports levels: DEBUG, INFO, WARN, ERROR
 * - JSON output (parseable by log aggregators)
 * - Console fallback + optional file sink
 * - Non-blocking (synchronous writes are OK for log lines)
 * - Never throws — degrades gracefully on write failure
 */

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

const ENV_LEVEL = (process.env.LOG_LEVEL || "INFO").toUpperCase();
const ACTIVE_LEVEL = LEVELS[ENV_LEVEL] ?? LEVELS.INFO;

const LOG_FILE = process.env.LOG_FILE_PATH
    ? path.resolve(process.env.LOG_FILE_PATH)
    : null;

const SENSITIVE_KEYS = new Set([
    "token",
    "apiKey",
    "apikey",
    "authorization",
    "password",
    "secret",
    "mongodb_uri",
    "ai_apikey",
    "token_bot",
    "discord_owner_id",
]);

function redact(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(redact);

    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
            out[key] = "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
            out[key] = redact(value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

function format(level, message, context) {
    const entry = {
        ts: new Date().toISOString(),
        level,
        pid: process.pid,
        msg: typeof message === "string" ? message : String(message),
        ...(context && typeof context === "object" ? redact(context) : {}),
    };
    return JSON.stringify(entry);
}

function write(level, message, context) {
    if (LEVELS[level] < ACTIVE_LEVEL) return;

    const line = format(level, message, context);

    try {
        process.stdout.write(line + "\n");
    } catch {
        // Last-resort: ignore stdout failure (e.g. broken pipe)
    }

    if (LOG_FILE) {
        try {
            fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
            fs.appendFileSync(LOG_FILE, line + "\n");
        } catch {
            // Disk full / permission denied — never crash the bot
        }
    }
}

export const logger = {
    debug: (msg, ctx) => write("DEBUG", msg, ctx),
    info: (msg, ctx) => write("INFO", msg, ctx),
    warn: (msg, ctx) => write("WARN", msg, ctx),
    error: (msg, ctx) => write("ERROR", msg, ctx),

    child(extraContext) {
        const base = extraContext && typeof extraContext === "object" ? { ...extraContext } : {};
        return {
            debug: (msg, ctx) => write("DEBUG", msg, { ...base, ...ctx }),
            info: (msg, ctx) => write("INFO", msg, { ...base, ...ctx }),
            warn: (msg, ctx) => write("WARN", msg, { ...base, ...ctx }),
            error: (msg, ctx) => write("ERROR", msg, { ...base, ...ctx }),
        };
    },
};
