import { logger } from "./logger.js";

/**
 * Per-user + per-action cooldown manager.
 * - In-memory store with periodic cleanup (no unbounded growth)
 * - Default 3s global + per-action cooldowns for destructive ops
 * - Thread-safe via Map (single Node event loop)
 *
 * Designed to be lightweight — fits a personal assistant scale.
 */

const DEFAULT_GLOBAL_COOLDOWN_MS = 3_000;

const ACTION_COOLDOWNS_MS = {
    NUKE_DELETE: 30_000,
    BAN: 10_000,
    KICK: 10_000,
    MASS_ROLE: 15_000,
    BULK_CREATE: 10_000,
    UNDO: 5_000,
};

const CLEANUP_INTERVAL_MS = 60_000;
const STALE_THRESHOLD_MS = 5 * 60_000;

class CooldownManager {
    constructor() {
        this.lastGlobal = new Map();
        this.lastAction = new Map();
        this.cleanupTimer = null;
        this._startCleanup();
    }

    _startCleanup() {
        if (this.cleanupTimer) return;
        this.cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
        if (typeof this.cleanupTimer.unref === "function") this.cleanupTimer.unref();
    }

    _cleanup() {
        const now = Date.now();
        const staleBefore = now - STALE_THRESHOLD_MS;

        for (const [userId, ts] of this.lastGlobal) {
            if (ts < staleBefore) this.lastGlobal.delete(userId);
        }
        for (const [key, ts] of this.lastAction) {
            if (ts < staleBefore) this.lastAction.delete(key);
        }
    }

    /**
     * Check whether a user can perform an action right now.
     * @param {string} userId
     * @param {string} [actionTag] - Optional action category (e.g. "BAN")
     * @returns {{ allowed: boolean, retryAfterMs: number, reason: string|null }}
     */
    check(userId, actionTag = null) {
        const now = Date.now();

        if (actionTag && ACTION_COOLDOWNS_MS[actionTag]) {
            const cooldownMs = ACTION_COOLDOWNS_MS[actionTag];
            const key = `${userId}:${actionTag}`;
            const actionLast = this.lastAction.get(key) ?? 0;
            const actionRemaining = (actionLast + cooldownMs) - now;
            if (actionRemaining > 0) {
                return {
                    allowed: false,
                    retryAfterMs: actionRemaining,
                    reason: `${actionTag} cooldown (${Math.ceil(actionRemaining / 1000)}s remaining)`,
                };
            }
        }

        const globalLast = this.lastGlobal.get(userId) ?? 0;
        const globalRemaining = (globalLast + DEFAULT_GLOBAL_COOLDOWN_MS) - now;
        if (globalRemaining > 0) {
            return {
                allowed: false,
                retryAfterMs: globalRemaining,
                reason: `global cooldown (${Math.ceil(globalRemaining / 1000)}s remaining)`,
            };
        }

        return { allowed: true, retryAfterMs: 0, reason: null };
    }

    /**
     * Mark that a user just performed an action (sets timestamps).
     * @param {string} userId
     * @param {string} [actionTag]
     */
    consume(userId, actionTag = null) {
        const now = Date.now();
        this.lastGlobal.set(userId, now);
        if (actionTag) {
            this.lastAction.set(`${userId}:${actionTag}`, now);
        }
    }

    /**
     * Force-clear cooldown for a user (admin override).
     * @param {string} userId
     */
    reset(userId) {
        this.lastGlobal.delete(userId);
        for (const key of this.lastAction.keys()) {
            if (key.startsWith(`${userId}:`)) this.lastAction.delete(key);
        }
        logger.info("cooldown.reset", { userId });
    }

    /**
     * Stop background cleanup. Call on graceful shutdown.
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.lastGlobal.clear();
        this.lastAction.clear();
    }
}

export const cooldown = new CooldownManager();

export const CooldownTags = Object.freeze({
    NUKE_DELETE: "NUKE_DELETE",
    BAN: "BAN",
    KICK: "KICK",
    MASS_ROLE: "MASS_ROLE",
    BULK_CREATE: "BULK_CREATE",
    UNDO: "UNDO",
});
