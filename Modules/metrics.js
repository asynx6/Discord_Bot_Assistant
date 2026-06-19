import { logger } from "./logger.js";

/**
 * Lightweight in-memory metrics tracker.
 * - Tracks per-action success/failure counts
 * - Tracks per-user request counts
 * - Tracks AI token usage when reported
 * - Exposes a formatted summary (for INFO command or periodic dump)
 *
 * No external dependencies. No DB writes — purely RAM resident.
 * Acceptable for personal-assistant scale. Reset on restart is expected.
 */

const STARTED_AT = Date.now();

const actionCounts = new Map();
const userCounts = new Map();
const guildCounts = new Map();
let totalRequests = 0;
let totalFailures = 0;
let totalAiCalls = 0;
let totalAiInputTokens = 0;
let totalAiOutputTokens = 0;

function bumpMap(map, key) {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function topEntries(map, n = 5) {
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k, v]) => ({ key: k, count: v }));
}

export const metrics = {
    recordRequest({ userId, guildId } = {}) {
        totalRequests++;
        if (userId) bumpMap(userCounts, userId);
        if (guildId) bumpMap(guildCounts, guildId);
    },

    recordAction(actionName, success = true) {
        const key = `${actionName}:${success ? "ok" : "fail"}`;
        bumpMap(actionCounts, key);
        if (!success) totalFailures++;
    },

    recordAiCall({ inputTokens = 0, outputTokens = 0 } = {}) {
        totalAiCalls++;
        totalAiInputTokens += inputTokens;
        totalAiOutputTokens += outputTokens;
    },

    snapshot() {
        const uptimeSec = Math.floor((Date.now() - STARTED_AT) / 1000);
        return {
            uptimeSec,
            startedAt: new Date(STARTED_AT).toISOString(),
            totals: {
                requests: totalRequests,
                failures: totalFailures,
                failureRate: totalRequests === 0
                    ? 0
                    : Number((totalFailures / totalRequests).toFixed(4)),
                aiCalls: totalAiCalls,
                aiInputTokens: totalAiInputTokens,
                aiOutputTokens: totalAiOutputTokens,
            },
            topUsers: topEntries(userCounts, 5),
            topGuilds: topEntries(guildCounts, 5),
            topActions: topEntries(actionCounts, 10),
        };
    },

    formatSummary() {
        const s = this.snapshot();
        const lines = [
            "📈 **Bot Metrics**",
            ``,
            `⏱️ Uptime: ${Math.floor(s.uptimeSec / 3600)}h ${Math.floor((s.uptimeSec % 3600) / 60)}m`,
            `📨 Total requests: ${s.totals.requests}`,
            `❌ Failures: ${s.totals.failures} (${(s.totals.failureRate * 100).toFixed(2)}%)`,
            `🧠 AI calls: ${s.totals.aiCalls} (in: ${s.totals.aiInputTokens}, out: ${s.totals.aiOutputTokens} tokens)`,
        ];

        if (s.topActions.length > 0) {
            lines.push(``, `🔥 **Top actions:**`);
            for (const { key, count } of s.topActions) {
                lines.push(`  • \`${key}\`: ${count}`);
            }
        }

        if (s.topUsers.length > 0) {
            lines.push(``, `👥 **Top users:**`);
            for (const { key, count } of s.topUsers) {
                lines.push(`  • <@${key}>: ${count}`);
            }
        }

        return lines.join("\n");
    },

    reset() {
        actionCounts.clear();
        userCounts.clear();
        guildCounts.clear();
        totalRequests = 0;
        totalFailures = 0;
        totalAiCalls = 0;
        totalAiInputTokens = 0;
        totalAiOutputTokens = 0;
        logger.warn("metrics.reset");
    },
};
