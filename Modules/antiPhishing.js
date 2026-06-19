import crypto from "node:crypto";
import { logger } from "./logger.js";

/**
 * Real-Time Cross-Channel Anti-Phishing System
 * ---------------------------------------------
 * Tracks every message a user sends across ALL channels. If the SAME user
 * posts identical or visually-identical content (text hash or image URL)
 * in MORE than N different channels within a short time window, it is
 * flagged as phishing / spam and the caller is expected to auto-delete
 * every matching message without asking for confirmation.
 *
 * Design choices:
 *   - In-memory only (no DB). State lost on restart, which is fine — the
 *     window is so short that any pre-restart spam has already shipped.
 *   - Pure functions exposed (computeTextHash, fingerprintMessage) for
 *     unit testing without instantiating the tracker.
 *   - The tracker is intentionally lightweight — it lives in the hot
 *     path of every messageCreate event, so per-message work is O(1)
 *     amortized (hash insert + channel-count increment).
 *
 * Tunable thresholds (constructor options):
 *   - windowMs         (default 2000) — sliding time window
 *   - channelThreshold (default 3)    — # distinct channels to trigger
 *   - maxTrackedPerUser(default 200)  — cap to prevent memory blowup
 */

const DEFAULTS = {
    windowMs: 2000,
    channelThreshold: 3,
    maxTrackedPerUser: 200,
};

/**
 * Normalize text for hashing.
 * - Lowercase
 * - Strip URLs (they are the actual payload, not "content")
 * - Collapse whitespace
 * - Trim
 * This ensures "Check this out https://evil.com/pay" and "check   this  out  https://evil.com/pay"
 * hash to the same value.
 */
export function normalizeTextForHash(text) {
    if (!text) return "";
    return String(text)
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[\s\u00A0]+/g, " ")
        .trim();
}

/**
 * Compute SHA-256 of normalized text. Returns hex digest, or empty string for empty input.
 */
export function computeTextHash(text) {
    const normalized = normalizeTextForHash(text);
    if (!normalized) return "";
    return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Build a stable fingerprint for a message.
 * Returns an object with:
 *   - textHash: hash of normalized text (or "")
 *   - imageHashes: array of image URL hashes (each URL gets its own hash)
 *   - compositeHash: combined hash used for cross-channel comparison
 * Two messages are considered "identical" when their compositeHash matches.
 */
export function fingerprintMessage({ text, imageUrls } = {}) {
    const textHash = computeTextHash(text);
    const urls = Array.isArray(imageUrls) ? imageUrls.filter((u) => typeof u === "string" && u) : [];
    const imageHashes = urls.map((u) => crypto.createHash("sha256").update(u).digest("hex"));
    const compositeInput = [textHash, ...imageHashes].sort().join("|");
    const compositeHash = compositeInput
        ? crypto.createHash("sha256").update(compositeInput).digest("hex")
        : "";
    return { textHash, imageHashes, compositeHash };
}

class AntiPhishingTracker {
    constructor(options = {}) {
        this.windowMs = options.windowMs ?? DEFAULTS.windowMs;
        this.channelThreshold = options.channelThreshold ?? DEFAULTS.channelThreshold;
        this.maxTrackedPerUser = options.maxTrackedPerUser ?? DEFAULTS.maxTrackedPerUser;

        // userId -> compositeHash -> array of { channelId, messageId, ts }
        this.userHashIndex = new Map();
        // userId -> compositeHash -> set of channelIds (for fast count)
        this.userChannelIndex = new Map();
    }

    /**
     * Record a message and decide whether it triggers the anti-phishing rule.
     *
     * @param {object} entry
     * @param {string} entry.userId
     * @param {string} entry.channelId
     * @param {string} entry.messageId
     * @param {string} [entry.text]
     * @param {string[]} [entry.imageUrls]
     * @param {number} [entry.timestamp] - ms epoch (defaults to Date.now())
     * @returns {{
     *   recorded: boolean,
     *   isPhishing: boolean,
     *   reason: string|null,
     *   compositeHash: string,
     *   distinctChannels: number,
     *   relatedMessages: Array<{channelId: string, messageId: string, ts: number}>,
     *   threshold: number
     * }}
     */
    recordAndCheck(entry) {
        const userId = String(entry?.userId ?? "");
        const channelId = String(entry?.channelId ?? "");
        const messageId = String(entry?.messageId ?? "");
        if (!userId || !channelId || !messageId) {
            return {
                recorded: false,
                isPhishing: false,
                reason: "missing-fields",
                compositeHash: "",
                distinctChannels: 0,
                relatedMessages: [],
                threshold: this.channelThreshold,
            };
        }

        const ts = typeof entry.timestamp === "number" ? entry.timestamp : Date.now();
        const { compositeHash } = fingerprintMessage({ text: entry.text, imageUrls: entry.imageUrls });

        if (!compositeHash) {
            return {
                recorded: false,
                isPhishing: false,
                reason: "empty-content",
                compositeHash: "",
                distinctChannels: 0,
                relatedMessages: [],
                threshold: this.channelThreshold,
            };
        }

        this._cleanupUserEntries(userId, ts);

        if (!this.userHashIndex.has(userId)) this.userHashIndex.set(userId, new Map());
        if (!this.userChannelIndex.has(userId)) this.userChannelIndex.set(userId, new Map());

        const hashMap = this.userHashIndex.get(userId);
        const channelMap = this.userChannelIndex.get(userId);

        if (!hashMap.has(compositeHash)) hashMap.set(compositeHash, []);
        if (!channelMap.has(compositeHash)) channelMap.set(compositeHash, new Set());

        const entries = hashMap.get(compositeHash);
        if (entries.length >= this.maxTrackedPerUser) {
            // Drop oldest to keep memory bounded
            entries.shift();
        }
        entries.push({ channelId, messageId, ts });
        channelMap.get(compositeHash).add(channelId);

        const distinctChannels = channelMap.get(compositeHash).size;
        const isPhishing = distinctChannels > this.channelThreshold;

        if (isPhishing) {
            const relatedMessages = entries
                .filter((e) => ts - e.ts <= this.windowMs)
                .map((e) => ({ channelId: e.channelId, messageId: e.messageId, ts: e.ts }));
            return {
                recorded: true,
                isPhishing: true,
                reason: `same-content-in-${distinctChannels}-channels-within-${this.windowMs}ms`,
                compositeHash,
                distinctChannels,
                relatedMessages,
                threshold: this.channelThreshold,
            };
        }

        return {
            recorded: true,
            isPhishing: false,
            reason: null,
            compositeHash,
            distinctChannels,
            relatedMessages: [],
            threshold: this.channelThreshold,
        };
    }

    /**
     * Drop entries older than windowMs for a single user. Called automatically.
     */
    _cleanupUserEntries(userId, now) {
        const hashMap = this.userHashIndex.get(userId);
        const channelMap = this.userChannelIndex.get(userId);
        if (!hashMap || !channelMap) return;

        for (const [hash, entries] of hashMap.entries()) {
            const fresh = entries.filter((e) => now - e.ts <= this.windowMs);
            if (fresh.length === 0) {
                hashMap.delete(hash);
                channelMap.delete(hash);
            } else {
                hashMap.set(hash, fresh);
                // Recompute channel set from remaining entries
                channelMap.set(hash, new Set(fresh.map((e) => e.channelId)));
            }
        }
    }

    /**
     * Forget everything for a single user (e.g. after handling a phishing event).
     */
    forgetUser(userId) {
        this.userHashIndex.delete(String(userId));
        this.userChannelIndex.delete(String(userId));
    }

    /**
     * Forget all state. Mostly for tests.
     */
    reset() {
        this.userHashIndex.clear();
        this.userChannelIndex.clear();
    }

    /**
     * Snapshot for diagnostics.
     */
    snapshot() {
        const users = {};
        for (const [userId, hashMap] of this.userHashIndex.entries()) {
            users[userId] = {};
            for (const [hash, entries] of hashMap.entries()) {
                users[userId][hash] = {
                    entryCount: entries.length,
                    channels: Array.from(this.userChannelIndex.get(userId)?.get(hash) ?? []),
                };
            }
        }
        return {
            windowMs: this.windowMs,
            channelThreshold: this.channelThreshold,
            users,
        };
    }
}

// Module-level singleton — same instance shared across messageCreate events
const defaultTracker = new AntiPhishingTracker();

/**
 * Convenience wrapper for the hot path.
 *
 * @param {object} entry - same shape as recordAndCheck
 * @returns same shape as recordAndCheck
 */
export function recordAndCheckMessage(entry) {
    return defaultTracker.recordAndCheck(entry);
}

export function getDefaultTracker() {
    return defaultTracker;
}

export function resetDefaultTracker() {
    defaultTracker.reset();
}

/**
 * Build the user-facing warning text when phishing is detected.
 * @param {object} result - output of recordAndCheckMessage
 * @param {string} userId
 * @returns {string}
 */
export function phishingWarningMessage(result, userId) {
    const channels = result.relatedMessages.map((m) => m.channelId).filter((v, i, a) => a.indexOf(v) === i);
    return (
        `🚨 **Anti-Phishing: pesan lintas-channel terdeteksi!**\n\n` +
        `User: <@${userId}>\n` +
        `Konten identik terdistribusi ke **${result.distinctChannels} channel** dalam ${result.windowMs ?? 2000}ms.\n` +
        `Channel yang terlibat: ${channels.map((c) => `<#${c}>`).join(", ")}\n\n` +
        `Semua pesan terkait sudah dihapus otomatis. User di-banned dari aksi ini.`
    );
}

export { AntiPhishingTracker };
export const _internal = { DEFAULTS };
