import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DYNAMIC_DIR = path.resolve(__dirname, "..", "commands", "dynamic");

/**
 * Dynamic Command Automator
 * --------------------------
 * Generates, validates, persists, hot-reloads, and executes user-defined
 * command handlers on-the-fly without restarting the bot.
 *
 * Storage layout:
 *   commands/dynamic/handle_<name>.js
 *
 * Each file MUST export either:
 *   - default: async (message, params) => string
 *   - named "handle": async (message, params) => string
 *
 * Safety guarantees:
 *   1. Syntax check via vm.Script() before save.
 *   2. Regex-based forbidden-pattern scan (eval, Function, child_process, etc.)
 *   3. File size cap.
 *   4. Import-time try/catch — bad code never crashes the bot.
 *   5. In-memory registry isolates broken handlers from the rest of the bot.
 */

const registry = new Map();

const FORBIDDEN_PATTERNS = [
    { pattern: /\beval\s*\(/, reason: "eval() is forbidden" },
    { pattern: /\bnew\s+Function\s*\(/, reason: "new Function() is forbidden" },
    { pattern: /from\s+["']node:child_process["']/, reason: "child_process import forbidden" },
    { pattern: /require\s*\(\s*["']child_process["']\s*\)/, reason: "child_process require forbidden" },
    { pattern: /\bprocess\.exit\s*\(/, reason: "process.exit() forbidden" },
    { pattern: /\bfs\.rm(?:Sync)?\s*\(/, reason: "fs.rm forbidden" },
    { pattern: /\bspawn\s*\(/, reason: "spawn() forbidden" },
    { pattern: /\bexec(?:Sync)?\s*\(/, reason: "exec() forbidden" },
];

const MAX_FILE_BYTES = 50_000;
const MAX_NAME_LENGTH = 32;

export function sanitizeName(input) {
    if (!input) return null;
    const cleaned = String(input)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, MAX_NAME_LENGTH);
    return cleaned || null;
}

function stripCodeFences(raw) {
    let s = String(raw).trim();
    const fenceMatch = s.match(/^```(?:javascript|js)?\s*\n([\s\S]*?)\n```\s*$/);
    if (fenceMatch) s = fenceMatch[1].trim();
    return s;
}

export function validateDynamicCode(rawCode) {
    const code = stripCodeFences(rawCode);

    if (!code || code.trim().length === 0) {
        return { valid: false, errors: ["Code is empty"] };
    }
    if (code.length > MAX_FILE_BYTES) {
        return { valid: false, errors: [`Code exceeds ${MAX_FILE_BYTES} bytes`] };
    }

 // Syntax check via `node --check --input-type=module` over stdin.
// We avoid writing a temp file because .mjs detection depends on parent
// package.json "type" field, and os.tmpdir() may not have one.
    try {
        execFileSync(process.execPath, ["--check", "--input-type=module", "-"], {
            input: code,
            stdio: ["pipe", "ignore", "pipe"],
        });
    } catch (e) {
        const stderr = (e.stderr ? e.stderr.toString() : e.message).trim();
        // Extract just the SyntaxError: ... line — skip the caret marker and stack frames.
        const errLine = stderr
            .split("\n")
            .find((l) => /^SyntaxError:|^ReferenceError:|^TypeError:|^Error:/.test(l.trim()))
            || stderr.split("\n").find((l) => l.trim().length > 0)
            || e.message;
        return { valid: false, errors: [`Syntax error: ${errLine.trim()}`] };
    }

    // Forbidden-pattern scan.
    const errors = [];
    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        if (pattern.test(code)) errors.push(reason);
    }

    // Must export a usable handler.
    const hasDefaultFn =
        /export\s+default\s+async\s+function/.test(code) ||
        /export\s+default\s+function/.test(code) ||
        /export\s+default\s+async\s*\(/.test(code) ||
        /export\s+default\s+\(/.test(code) ||
        /export\s+default\s+\w+\s*=/.test(code);
    const hasNamedHandle = /export\s+(?:async\s+)?function\s+handle\b/.test(code);

    if (!hasDefaultFn && !hasNamedHandle) {
        errors.push('Must export a default async function or a named "handle" async function');
    }

    return { valid: errors.length === 0, errors, cleaned: code };
}

export async function saveDynamicCommand(name, rawCode) {
    const safeName = sanitizeName(name);
    if (!safeName) {
        return { ok: false, error: `Invalid name: "${name}"` };
    }

    const validation = validateDynamicCode(rawCode);
    if (!validation.valid) {
        return { ok: false, error: `Validation failed: ${validation.errors.join("; ")}`, errors: validation.errors };
    }

    await fs.mkdir(DYNAMIC_DIR, { recursive: true });
    const fileName = `handle_${safeName}.js`;
    const filePath = path.join(DYNAMIC_DIR, fileName);
    await fs.writeFile(filePath, validation.cleaned, "utf8");

    logger.info("dynamic.saved", { name: safeName, filePath, bytes: validation.cleaned.length });
    return { ok: true, filePath, name: safeName, bytes: validation.cleaned.length };
}

export async function registerDynamicCommand(name) {
    const safeName = sanitizeName(name);
    if (!safeName) return { ok: false, error: `Invalid name: "${name}"` };

    const fileName = `handle_${safeName}.js`;
    const filePath = path.join(DYNAMIC_DIR, fileName);

    try {
        await fs.access(filePath);
    } catch {
        return { ok: false, error: `File not found: ${fileName}` };
    }

    let mod;
    try {
        // Cache-bust via query string so re-registration after edit works.
        const fileUrl = pathToFileURL(filePath).href + `?t=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        mod = await import(fileUrl);
    } catch (e) {
        logger.error("dynamic.import_failed", { name: safeName, error: e.message });
        return { ok: false, error: `Import failed: ${e.message}` };
    }

    const handler = mod.default || mod.handle;
    if (typeof handler !== "function") {
        return { ok: false, error: "Module did not export a function (need default or named 'handle')" };
    }

    registry.set(safeName, {
        handler,
        filePath,
        loadedAt: Date.now(),
    });

    logger.info("dynamic.registered", { name: safeName });
    return { ok: true, name: safeName };
}

export async function loadAllDynamicCommands() {
    try {
        await fs.mkdir(DYNAMIC_DIR, { recursive: true });
        const files = await fs.readdir(DYNAMIC_DIR);
        const jsFiles = files.filter((f) => f.startsWith("handle_") && f.endsWith(".js"));

        const results = [];
        for (const file of jsFiles) {
            const name = file.replace(/^handle_/, "").replace(/\.js$/, "");
            const result = await registerDynamicCommand(name);
            results.push({ name, ok: result.ok, error: result.error });
        }

        const loaded = results.filter((r) => r.ok).length;
        logger.info("dynamic.loaded_all", { found: jsFiles.length, loaded });
        return { total: jsFiles.length, loaded, results };
    } catch (e) {
        logger.error("dynamic.load_all_failed", { error: e.message });
        return { total: 0, loaded: 0, results: [] };
    }
}

export function hasDynamicCommand(name) {
    const safe = sanitizeName(name);
    return safe !== null && registry.has(safe);
}

export function getDynamicCommand(name) {
    const safe = sanitizeName(name);
    if (!safe) return null;
    const entry = registry.get(safe);
    if (!entry) return null;
    return {
        name: safe,
        filePath: entry.filePath,
        loadedAt: new Date(entry.loadedAt).toISOString(),
    };
}

export async function executeDynamicCommand(name, message, params) {
    const safe = sanitizeName(name);
    const entry = registry.get(safe);

    if (!entry) {
        return {
            ok: false,
            error: `Dynamic command "${safe}" not loaded. Call registerDynamicCommand() first.`,
        };
    }

    try {
        const result = await entry.handler(message, params);
        return { ok: true, result: typeof result === "string" ? result : JSON.stringify(result) };
    } catch (e) {
        logger.error("dynamic.execute_failed", { name: safe, error: e.message });
        return { ok: false, error: e.message };
    }
}

export function listDynamicCommands() {
    return Array.from(registry.entries()).map(([name, info]) => ({
        name,
        filePath: info.filePath,
        loadedAt: new Date(info.loadedAt).toISOString(),
    }));
}

/**
 * Get file metadata + extracted summary for a dynamic command.
 * @param {string} name
 * @returns {Promise<null | { name, filePath, sizeBytes, createdAt, modifiedAt, summary, exists, loaded }>}
 */
export async function getCommandFileInfo(name) {
    const safeName = sanitizeName(name);
    if (!safeName) return null;

    const fileName = `handle_${safeName}.js`;
    const filePath = path.join(DYNAMIC_DIR, fileName);

    try {
        const [stat, summary] = await Promise.all([
            fs.stat(filePath),
            extractFeatureSummary(filePath),
        ]);
        return {
            name: safeName,
            filePath,
            sizeBytes: stat.size,
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
            summary,
            exists: true,
            loaded: registry.has(safeName),
        };
    } catch {
        return { name: safeName, filePath, exists: false, loaded: registry.has(safeName) };
    }
}

/**
 * Extract a short human-readable summary from a generated handler file.
 * Strategy (in order):
 *   1. First /** ... *\/ JSDoc block (single or multi-line)
 *   2. First // comment line
 *   3. First non-empty, non-import, non-export code line (truncated)
 *
 * @param {string} filePath
 * @returns {Promise<string>} Summary, or "(no summary)" if nothing found.
 */
export async function extractFeatureSummary(filePath) {
    try {
        const content = await fs.readFile(filePath, "utf8");
        const lines = content.split(/\r?\n/);

        // 1. JSDoc block (/** ... */)
        const jsdocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
        if (jsdocMatch) {
            const cleaned = jsdocMatch[1]
                .split(/\r?\n/)
                .map((l) => l.replace(/^\s*\*\s?/, "").trim())
                .filter((l) => l && !l.startsWith("@"))
                .join(" ")
                .trim();
            if (cleaned) return cleaned.slice(0, 200);
        }

        // 2. First // comment line
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("//") && trimmed.length > 2) {
                return trimmed.replace(/^\/\/\s*/, "").slice(0, 200);
            }
        }

        // 3. First meaningful code line
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("import") || trimmed.startsWith("export")) continue;
            return (trimmed.length > 100 ? trimmed.slice(0, 100) + "…" : trimmed);
        }

        return "(no summary)";
    } catch {
        return "(unable to read file)";
    }
}

/**
 * List all dynamic command file metadata in one shot.
 * @returns {Promise<Array<{ name, filePath, sizeBytes, createdAt, modifiedAt, summary, exists, loaded }>>}
 */
export async function listDynamicCommandDetails() {
    const names = Array.from(registry.keys());
    const also = await fs.readdir(DYNAMIC_DIR).catch(() => []);
    const fileNames = also
        .filter((f) => f.startsWith("handle_") && f.endsWith(".js"))
        .map((f) => f.replace(/^handle_/, "").replace(/\.js$/, ""));

    const all = new Set([...names, ...fileNames]);
    const results = await Promise.all(
        Array.from(all).map((n) => getCommandFileInfo(n))
    );
    return results.filter((r) => r !== null).sort((a, b) => a.name.localeCompare(b.name));
}

export function clearDynamicRegistry() {
    registry.clear();
    logger.info("dynamic.registry_cleared");
}

export function getDynamicDir() {
    return DYNAMIC_DIR;
}

export const _internal = {
    registry,
    FORBIDDEN_PATTERNS,
    MAX_FILE_BYTES,
    MAX_NAME_LENGTH,
    stripCodeFences,
};
