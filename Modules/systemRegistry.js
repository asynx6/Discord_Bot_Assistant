import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

/**
 * System Status Registry
 * ----------------------
 * A local JSON-backed registry of named "systems" / "features" the bot
 * manages. Each system has a stable id, a human-readable name, a status
 * (`on` / `off` / `error`), optional metadata, and lifecycle timestamps.
 *
 * The registry is the single source of truth for:
 *   - Listing what's running ("system apa yang lagi jalan?")
 *   - Toggling features on/off via chat
 *   - Persisting scheduler jobs across bot restarts
 *
 * Storage location: <project>/data/system_registry.json
 * Atomic writes (write to .tmp, then rename) prevent corruption on crash.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PATH = path.resolve(__dirname, "..", "data", "system_registry.json");

class SystemRegistry {
    /**
     * @param {object} [options]
     * @param {string} [options.filePath] - override the storage location
     * @param {boolean} [options.autoLoad] - load on construction
     */
    constructor(options = {}) {
        this.filePath = options.filePath ?? DEFAULT_PATH;
        this.autoLoad = options.autoLoad ?? true;
        /** @type {Map<string, SystemEntry>} */
        this.entries = new Map();
        this.loaded = false;
        if (this.autoLoad) {
            // Fire-and-forget load; if it fails, the next operation will retry
            this.load().catch((err) => {
                logger.warn("system_registry.load_failed", { error: err?.message });
            });
        }
    }

    // ---------- IO ----------

    async load() {
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed.systems && typeof parsed.systems === "object") {
                this.entries.clear();
                for (const [id, entry] of Object.entries(parsed.systems)) {
                    this.entries.set(id, this._normalizeEntry(id, entry));
                }
            }
            this.loaded = true;
            return { ok: true, count: this.entries.size };
        } catch (err) {
            if (err && err.code === "ENOENT") {
                // First run — file does not exist yet, that's fine
                this.loaded = true;
                return { ok: true, count: 0, created: false };
            }
            logger.warn("system_registry.load_error", { error: err?.message });
            return { ok: false, error: err?.message };
        }
    }

    async save() {
        const payload = {
            version: 1,
            updatedAt: new Date().toISOString(),
            systems: Object.fromEntries(this.entries),
        };
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
        const tmp = `${this.filePath}.tmp.${process.pid}`;
        await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
        await fs.rename(tmp, this.filePath);
        return { ok: true, path: this.filePath };
    }

    _normalizeEntry(id, raw) {
        const now = new Date().toISOString();
        return {
            id: String(id),
            name: String(raw?.name ?? id),
            status: ["on", "off", "error"].includes(raw?.status) ? raw.status : "off",
            description: typeof raw?.description === "string" ? raw.description : "",
            schedule: raw?.schedule && typeof raw.schedule === "object" ? raw.schedule : null,
            metadata: raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
            createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : now,
            updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : now,
        };
    }

    // ---------- CRUD ----------

    /**
     * Register or update a system entry. Idempotent: calling twice with the
     * same id overwrites the entry but preserves createdAt.
     *
     * @param {string} id
     * @param {object} spec
     * @param {string} [spec.name]
     * @param {'on'|'off'|'error'} [spec.status]
     * @param {string} [spec.description]
     * @param {object} [spec.schedule]
     * @param {object} [spec.metadata]
     * @returns {Promise<SystemEntry>}
     */
    async set(id, spec = {}) {
        if (!id) throw new Error("system id is required");
        const existing = this.entries.get(id);
        const now = new Date().toISOString();
        const merged = this._normalizeEntry(id, {
            ...(existing ?? {}),
            ...spec,
        });
        // Always refresh updatedAt; preserve createdAt from existing
        if (existing?.createdAt) {
            merged.createdAt = existing.createdAt;
        }
        merged.updatedAt = now;
        this.entries.set(id, merged);
        await this.save();
        logger.info("system_registry.set", { id, status: merged.status });
        return merged;
    }

    /**
     * Get a single system entry by id.
     * @param {string} id
     * @returns {SystemEntry|null}
     */
    get(id) {
        return this.entries.get(id) ?? null;
    }

    /**
     * List all entries, optionally filtered by status.
     * @param {{status?: 'on'|'off'|'error'}} [filter]
     * @returns {SystemEntry[]}
     */
    list(filter = {}) {
        const all = Array.from(this.entries.values());
        if (filter.status) {
            return all.filter((e) => e.status === filter.status);
        }
        return all;
    }

    /**
     * Toggle a system between on and off. Returns the new entry.
     * @param {string} id
     * @returns {Promise<{entry: SystemEntry, previousStatus: string}>}
     */
    async toggle(id) {
        const existing = this.entries.get(id);
        if (!existing) {
            throw new Error(`System "${id}" not found in registry`);
        }
        const newStatus = existing.status === "on" ? "off" : "on";
        const updated = await this.set(id, { status: newStatus });
        return { entry: updated, previousStatus: existing.status };
    }

    /**
     * Mark a system as errored.
     * @param {string} id
     * @param {string} [reason]
     */
    async markError(id, reason = null) {
        return this.set(id, { status: "error", metadata: { ...(this.get(id)?.metadata ?? {}), lastError: reason } });
    }

    /**
     * Remove a system entirely.
     * @param {string} id
     */
    async remove(id) {
        const had = this.entries.delete(id);
        if (had) await this.save();
        return had;
    }

    /**
     * Clear all entries.
     */
    async clear() {
        this.entries.clear();
        await this.save();
    }

    /**
     * Total entry count.
     */
    size() {
        return this.entries.size;
    }
}

// Module-level singleton
const defaultRegistry = new SystemRegistry();

export function getDefaultRegistry() {
    return defaultRegistry;
}

export function resetDefaultRegistry() {
    defaultRegistry.entries.clear();
    defaultRegistry.loaded = false;
}

/**
 * Format a human-readable list of systems for chat output.
 * @param {SystemEntry[]} entries
 * @returns {string}
 */
export function formatSystemList(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return "📭 Belum ada sistem yang terdaftar di registry lokal.";
    }
    const lines = [`🗂️ **System Registry (${entries.length}):**`, ""];
    for (const e of entries) {
        const icon = e.status === "on" ? "🟢" : e.status === "off" ? "⚪" : "🔴";
        lines.push(`${icon} **${e.name}** _(${e.id})_ — ${e.status.toUpperCase()}`);
        if (e.description) lines.push(`   📝 ${e.description}`);
        if (e.schedule) {
            const sched = e.schedule.cron ?? e.schedule.dailyAt ?? e.schedule.human ?? "(no schedule)";
            lines.push(`   ⏰ ${sched}`);
        }
        if (e.metadata?.lastError) {
            lines.push(`   ⚠️ Last error: ${e.metadata.lastError}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}

/**
 * Try to interpret a user message as a system command. Returns one of:
 *   { kind: "list" }
 *   { kind: "toggle", id }
 *   { kind: "status", id }
 *   { kind: "unknown" }
 *
 * This is intentionally conservative — it only matches clear, explicit
 * phrasings. Anything ambiguous falls through to `unknown` so the AI
 * handler can still try to interpret it.
 */
export function parseSystemCommand(message) {
    if (!message || typeof message !== "string") return { kind: "unknown" };
    const m = message.trim().toLowerCase();

    if (/^(list|show|lihat|tunjukin|sebutin)\b.*\b(system|sistem|fitur|systems|semuanya|yang\s+(lagi|jalan|aktif|aktif\s+aja)?)\b/.test(m)) {
        return { kind: "list" };
    }
    // "apa yang lagi jalan / off" / "apa aja yang kamu buat" style
    if (/^apa\s+(yang|aja|saja)\s+(yang\s+)?(lagi|udah|sudah|jalan|aktif|off|offline|buat|dibuat)/.test(m)) {
        return { kind: "list" };
    }

    let mt = m.match(/^(turn|set|nyalakan|matikan|aktifkan|nonaktifkan|enable|disable)\s+(on|off|ya|tidak|true|false)?\s*(?:fitur|system|sistem|reminder|cron|jadwal)?\s*([a-z0-9_]+)?/);
    if (mt) {
        const verb = mt[1];
        const stateRaw = mt[2] || "";
        const target = mt[3] || "daily_reminder";
        let status = null;
        if (["nyalakan", "aktifkan", "enable", "on", "ya", "true"].includes(verb) || ["on", "ya", "true"].includes(stateRaw)) {
            status = "on";
        } else if (["matikan", "nonaktifkan", "disable", "off", "tidak", "false"].includes(verb) || ["off", "tidak", "false"].includes(stateRaw)) {
            status = "off";
        }
        if (status) {
            return { kind: "toggle", id: target, status };
        }
    }

    mt = m.match(/^(status|cek|check)\s+([a-z0-9_]+)/);
    if (mt) {
        return { kind: "status", id: mt[2] };
    }

    return { kind: "unknown" };
}

export { SystemRegistry };
export const _internal = { DEFAULT_PATH };
