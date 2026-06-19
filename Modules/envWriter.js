import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

/**
 * Local .env Writer
 * -----------------
 * Safely append or update environment variables in a local `.env` file.
 *
 * Design:
 *   - Atomic writes (write to .tmp.<pid>, then rename).
 *   - Preserves comments, ordering, and quoting of existing keys.
 *   - On update, replaces the value of the FIRST matching key; leaves
 *     duplicate keys after the first untouched (rare in practice).
 *   - Never writes secrets to logs (logger auto-redacts, but we also
 *     keep the value out of the return shape).
 *   - File locking is intentionally simple (mutex per filePath) — this
 *     is a single-process Discord bot, not a multi-tenant web service.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PATH = path.resolve(__dirname, "..", ".env");

const locks = new Map();

async function withLock(filePath, fn) {
    const prev = locks.get(filePath) ?? Promise.resolve();
    let release;
    const next = new Promise((res) => { release = res; });
    locks.set(filePath, prev.then(() => next));
    await prev;
    try {
        return await fn();
    } finally {
        release();
        // Best-effort cleanup
        if (locks.get(filePath) === next) locks.delete(filePath);
    }
}

/**
 * Quote a value safely for a .env file. Wraps in double quotes if it
 * contains spaces, '#', '=', or newlines. Escapes embedded double quotes.
 */
export function quoteEnvValue(value) {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (s === "") return "";
    if (/[\s#="]/.test(s)) {
        return `"${s.replace(/"/g, '\\"')}"`;
    }
    return s;
}

/**
 * Read the .env file and return its raw content. Returns "" if missing.
 */
export function readEnvSync(filePath = DEFAULT_PATH) {
    try {
        return fsSync.readFileSync(filePath, "utf8");
    } catch (err) {
        if (err?.code === "ENOENT") return "";
        throw err;
    }
}

/**
 * Check whether a key exists in the .env file.
 */
export function hasEnvKey(key, filePath = DEFAULT_PATH) {
    const content = readEnvSync(filePath);
    return new RegExp(`^${escapeRegExp(key)}\\s*=\\s*`, "m").test(content);
}

/**
 * Get the current value of a key from the .env file (without quotes).
 * Returns null if the key is not present.
 */
export function getEnvKeyValue(key, filePath = DEFAULT_PATH) {
    const content = readEnvSync(filePath);
    const re = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*(.*)$`, "m");
    const match = content.match(re);
    if (!match) return null;
    return unquoteEnvValue(match[1]);
}

function unquoteEnvValue(raw) {
    if (raw === undefined) return null;
    let s = raw.trim();
    // Strip inline comment
    const hashIdx = s.indexOf(" #");
    if (hashIdx >= 0) s = s.slice(0, hashIdx).trim();
    if (s.startsWith('"') && s.endsWith('"')) {
        return s.slice(1, -1).replace(/\\"/g, '"');
    }
    if (s.startsWith("'") && s.endsWith("'")) {
        return s.slice(1, -1).replace(/\\'/g, "'");
    }
    return s;
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Append a new key=value pair to the .env file. If the key already exists,
 * updates the first occurrence instead. Returns whether the file was modified.
 *
 * @param {string} key
 * @param {string} value
 * @param {object} [options]
 * @param {string} [options.filePath] - override the .env location
 * @param {boolean} [options.backup] - create .env.bak before write
 * @param {string} [options.comment] - optional comment line above the key
 * @returns {Promise<{ok: boolean, action: 'created'|'updated'|'unchanged', path: string}>}
 */
export async function writeEnvVar(key, value, options = {}) {
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`Invalid env key: ${key}`);
    }
    const filePath = options.filePath ?? DEFAULT_PATH;
    const backup = options.backup ?? true;

    return withLock(filePath, async () => {
        const current = readEnvSync(filePath);
        const re = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*$`, "m");
        const newLine = `${key}=${quoteEnvValue(value)}${options.comment ? "" : ""}`;

        let action = "created";
        let next = current;
        if (re.test(current)) {
            const existingValue = getEnvKeyValue(key, filePath);
            if (existingValue === value) {
                action = "unchanged";
            } else {
                next = current.replace(re, newLine);
                action = "updated";
            }
        } else {
            const sep = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
            const block = options.comment ? `# ${options.comment}\n${newLine}\n` : `${newLine}\n`;
            next = `${current}${sep}${block}`;
        }

        if (action === "unchanged") {
            return { ok: true, action, path: filePath };
        }

        if (backup && fsSync.existsSync(filePath)) {
            try {
                await fs.copyFile(filePath, `${filePath}.bak`);
            } catch (err) {
                logger.warn("env_writer.backup_failed", { error: err?.message });
            }
        }

        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        const tmp = `${filePath}.tmp.${process.pid}`;
        await fs.writeFile(tmp, next, "utf8");
        await fs.rename(tmp, filePath);

        logger.info("env_writer.written", { key, action, path: filePath });
        return { ok: true, action, path: filePath };
    });
}

/**
 * Remove a key from the .env file. Returns whether the key was found.
 */
export async function removeEnvVar(key, options = {}) {
    if (!key) throw new Error("env key required");
    const filePath = options.filePath ?? DEFAULT_PATH;
    return withLock(filePath, async () => {
        const current = readEnvSync(filePath);
        const re = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*\\n?`, "m");
        if (!re.test(current)) {
            return { ok: true, action: "absent", path: filePath };
        }
        const next = current.replace(re, "");
        const tmp = `${filePath}.tmp.${process.pid}`;
        await fs.writeFile(tmp, next, "utf8");
        await fs.rename(tmp, filePath);
        logger.info("env_writer.removed", { key, path: filePath });
        return { ok: true, action: "removed", path: filePath };
    });
}

/**
 * Read all .env entries as a plain object. Quoted values are unquoted.
 * Excludes blank lines and comments.
 */
export function parseEnvFile(filePath = DEFAULT_PATH) {
    const content = readEnvSync(filePath);
    const out = {};
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        out[m[1]] = unquoteEnvValue(m[2]);
    }
    return out;
}

/**
 * Mask a value for safe display in chat (e.g. "sk-or-v1-abc...xyz")
 * Keeps the first 6 and last 4 characters if long enough.
 */
export function maskSecret(value) {
    if (typeof value !== "string" || value.length < 12) return "***";
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export const _internal = { DEFAULT_PATH, withLock, unquoteEnvValue };
