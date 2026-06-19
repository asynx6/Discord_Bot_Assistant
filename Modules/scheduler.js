import { logger } from "./logger.js";

/**
 * Dynamic Cron-Like Scheduler
 * ---------------------------
 * Lightweight in-process scheduler. Avoids node-cron dependency to keep
 * the project zero-dep beyond discord.js / openai / mongoose / dotenv.
 *
 * Supports:
 *   - daily 12pm (Asia/Jakarta) — built-in shortcut for the daily reminder
 *   - one-shot at a specific Date
 *   - recurring with cron-like spec: { minute, hour, dayOfWeek, dayOfMonth }
 *
 * The scheduler is intentionally simple:
 *   - Tick loop every 30 seconds
 *   - On each tick, evaluate which jobs are due
 *   - Fire callbacks in the next microtask (so errors are catchable)
 *
 * Times are evaluated in the local timezone by default. For multi-region
 * deployments, pass `timeZone` per job (IANA name, e.g. "Asia/Jakarta").
 */

const TICK_INTERVAL_MS = 30_000;
const DEFAULT_TZ = process.env.SCHEDULER_TIMEZONE || "Asia/Jakarta";

/**
 * Format a Date in a specific timezone, returning components.
 * Uses Intl.DateTimeFormat with timeZone option.
 */
function getTimezoneParts(date, timeZone = DEFAULT_TZ) {
    try {
        const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            weekday: "short",
        });
        const parts = fmt.formatToParts(date);
        const out = {};
        for (const p of parts) {
            if (p.type === "year") out.year = Number(p.value);
            else if (p.type === "month") out.month = Number(p.value);
            else if (p.type === "day") out.day = Number(p.value);
            else if (p.type === "hour") out.hour = Number(p.value) % 24;
            else if (p.type === "minute") out.minute = Number(p.value);
            else if (p.type === "second") out.second = Number(p.value);
            else if (p.type === "weekday") out.weekday = p.value;
        }
        return out;
    } catch {
        // Fall back to local time
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
            hour: date.getHours(),
            minute: date.getMinutes(),
            second: date.getSeconds(),
            weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()],
        };
    }
}

const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Check whether a job should fire at the given moment.
 * @param {ScheduleSpec} spec
 * @param {Date} now
 * @returns {boolean}
 */
export function shouldFireNow(spec, now = new Date()) {
    if (!spec) return false;

    // One-shot
    if (spec.at) {
        const target = new Date(spec.at);
        if (Number.isNaN(target.getTime())) return false;
        // Fire only once: return true if we're within the same minute
        const parts = getTimezoneParts(now, spec.timeZone);
        const targetParts = getTimezoneParts(target, spec.timeZone);
        return (
            parts.year === targetParts.year &&
            parts.month === targetParts.month &&
            parts.day === targetParts.day &&
            parts.hour === targetParts.hour &&
            parts.minute === targetParts.minute
        );
    }

    const parts = getTimezoneParts(now, spec.timeZone);
    const tzNow = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;

    if (spec.dailyAt) {
        // dailyAt format: "12:00" (24h)
        const [hh, mm] = String(spec.dailyAt).split(":").map((n) => Number(n));
        if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
        return parts.hour === hh && parts.minute === mm;
    }

    if (spec.cron || spec.minute !== undefined || spec.hour !== undefined) {
        const weekday = WEEKDAY_MAP[parts.weekday] ?? -1;
        if (spec.cron) {
            // simple "M H DoM Mo DoW" parser
            const tokens = String(spec.cron).trim().split(/\s+/);
            if (tokens.length < 5) return false;
            const [m, h, dom, , dow] = tokens;
            const matches = (val, field) => field === "*" || Number(field) === val;
            return (
                matches(parts.minute, m) &&
                matches(parts.hour, h) &&
                (dom === "*" || Number(dom) === parts.day) &&
                (dow === "*" || Number(dow) === weekday)
            );
        }
        if (spec.minute !== undefined && parts.minute !== spec.minute) return false;
        if (spec.hour !== undefined && parts.hour !== spec.hour) return false;
        if (spec.dayOfMonth !== undefined && parts.day !== spec.dayOfMonth) return false;
        if (spec.dayOfWeek !== undefined && weekday !== spec.dayOfWeek) return false;
        return true;
    }

    return false;
}

class Scheduler {
    /**
     * @param {object} [options]
     * @param {number} [options.tickIntervalMs]
     * @param {string} [options.timeZone]
     */
    constructor(options = {}) {
        this.tickIntervalMs = options.tickIntervalMs ?? TICK_INTERVAL_MS;
        this.timeZone = options.timeZone ?? DEFAULT_TZ;
        /** @type {Map<string, ScheduledJob>} */
        this.jobs = new Map();
        this.tickHandle = null;
        this.lastTickKey = null;
    }

    start() {
        if (this.tickHandle) return;
        this.tickHandle = setInterval(() => this._tick(), this.tickIntervalMs);
        if (this.tickHandle.unref) this.tickHandle.unref();
        logger.info("scheduler.started", { tickIntervalMs: this.tickIntervalMs, timeZone: this.timeZone });
    }

    stop() {
        if (this.tickHandle) {
            clearInterval(this.tickHandle);
            this.tickHandle = null;
        }
        logger.info("scheduler.stopped");
    }

    /**
     * Register a new job.
     * @param {string} id
     * @param {object} spec
     * @param {Function} callback
     * @returns {ScheduledJob}
     */
    register(id, spec, callback) {
        if (!id) throw new Error("job id required");
        if (typeof callback !== "function") throw new Error("callback must be a function");
        const job = {
            id,
            spec,
            callback,
            registeredAt: new Date().toISOString(),
            fireCount: 0,
            lastFiredAt: null,
            lastError: null,
        };
        this.jobs.set(id, job);
        logger.info("scheduler.job_registered", { id, spec });
        return job;
    }

    unregister(id) {
        const had = this.jobs.delete(id);
        if (had) logger.info("scheduler.job_unregistered", { id });
        return had;
    }

    /**
     * Manually fire a job once. Useful for tests.
     * @param {string} id
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async fireNow(id) {
        const job = this.jobs.get(id);
        if (!job) return { ok: false, error: `Job ${id} not found` };
        try {
            await job.callback();
            job.fireCount++;
            job.lastFiredAt = new Date().toISOString();
            return { ok: true };
        } catch (err) {
            job.lastError = err?.message ?? String(err);
            return { ok: false, error: job.lastError };
        }
    }

    _tick() {
        const now = new Date();
        const parts = getTimezoneParts(now, this.timeZone);
        const tickKey = `${parts.year}-${parts.month}-${parts.day}-${parts.hour}-${parts.minute}`;
        if (tickKey === this.lastTickKey) return; // already processed this minute
        this.lastTickKey = tickKey;

        for (const [id, job] of this.jobs.entries()) {
            if (!shouldFireNow(job.spec, now)) continue;
            // Fire in next microtask so we never block the tick
            Promise.resolve()
                .then(() => job.callback())
                .then(() => {
                    job.fireCount++;
                    job.lastFiredAt = new Date().toISOString();
                })
                .catch((err) => {
                    job.lastError = err?.message ?? String(err);
                    logger.error("scheduler.job_failed", { id, error: job.lastError });
                });
        }
    }

    list() {
        return Array.from(this.jobs.values()).map((j) => ({
            id: j.id,
            spec: j.spec,
            fireCount: j.fireCount,
            lastFiredAt: j.lastFiredAt,
            lastError: j.lastError,
        }));
    }

    size() {
        return this.jobs.size;
    }

    clear() {
        this.jobs.clear();
    }
}

const defaultScheduler = new Scheduler();

export function getDefaultScheduler() {
    return defaultScheduler;
}

export { Scheduler };
export const _internal = { TICK_INTERVAL_MS, DEFAULT_TZ, getTimezoneParts };
