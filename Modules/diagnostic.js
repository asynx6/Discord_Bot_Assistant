import os from "node:os";
import { logger } from "./logger.js";

/**
 * AI System Auto-Diagnostic
 * -------------------------
 * Collects a snapshot of the bot's health for the @Bot diagnostic command.
 * Exposes:
 *   - getSystemHealth()  — pure data snapshot (no Discord dependency)
 *   - formatDiagnosticEmbed() — builds a Discord-compatible embed object
 *     (the caller wraps it in EmbedBuilder)
 *
 * The snapshot is intentionally cheap to compute — it is safe to call on
 * every diagnostic request.
 */

/**
 * Format a byte count as a human-friendly string.
 */
function formatBytes(n) {
    if (!Number.isFinite(n) || n < 0) return "0 B";
    if (n === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    // For B (bytes), show no decimal
    if (i === 0) return `${v} B`;
    return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format a duration in seconds as a human-friendly uptime string.
 */
function formatUptime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(" ");
}

/**
 * Get CPU usage as a percentage. Uses os.cpus() and computes a delta
 * between two samples taken 100ms apart.
 */
async function getCpuUsagePercent() {
    const sample = () => {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        for (const c of cpus) {
            idle += c.times.idle;
            total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
        }
        return { idle, total };
    };

    const a = sample();
    await new Promise((r) => setTimeout(r, 100));
    const b = sample();
    const idleDelta = b.idle - a.idle;
    const totalDelta = b.total - a.total;
    if (totalDelta <= 0) return 0;
    return Math.max(0, Math.min(100, Number(((1 - idleDelta / totalDelta) * 100).toFixed(1))));
}

/**
 * Collect a full health snapshot.
 *
 * @param {object} [options]
 * @param {object} [options.metrics] - metrics module snapshot (for AI usage)
 * @param {object} [options.dynamic] - { count: number, loaded: number } from dynamicExecutor
 * @param {object} [options.registry] - { total: number, active: number } from systemRegistry
 * @param {object} [options.mongo] - { connected: boolean, host?: string }
 * @returns {Promise<object>}
 */
export async function getSystemHealth(options = {}) {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const cpuPercent = await getCpuUsagePercent();

    const proc = process.memoryUsage();
    const procUptime = process.uptime();

    const metrics = options.metrics ?? {};
    const dynamic = options.dynamic ?? { count: 0, loaded: 0 };
    const registry = options.registry ?? { total: 0, active: 0 };
    const mongo = options.mongo ?? { connected: false };

    // Rough spend estimate: $0.15 per 1M input tokens, $0.60 per 1M output (gpt-4o-mini-ish)
    const inputCost = (metrics.totalAiInputTokens ?? 0) * 0.15 / 1_000_000;
    const outputCost = (metrics.totalAiOutputTokens ?? 0) * 0.60 / 1_000_000;
    const estimatedSpend = Number((inputCost + outputCost).toFixed(6));

    return {
        timestamp: new Date().toISOString(),
        host: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            cpuModel: cpus[0]?.model ?? "unknown",
            cpuCount: cpus.length,
            cpuPercent,
            loadAvg: loadAvg.map((n) => Number(n.toFixed(2))),
            uptimeSec: Math.floor(os.uptime()),
        },
        memory: {
            totalBytes: totalMem,
            freeBytes: freeMem,
            usedBytes: usedMem,
            usedPercent: totalMem > 0 ? Number(((usedMem / totalMem) * 100).toFixed(1)) : 0,
        },
        process: {
            pid: process.pid,
            rss: proc.rss,
            heapUsed: proc.heapUsed,
            heapTotal: proc.heapTotal,
            external: proc.external,
            uptimeSec: Math.floor(procUptime),
        },
        mongo: {
            connected: !!mongo.connected,
            host: mongo.host ?? null,
        },
        dynamic: {
            files: dynamic.count ?? 0,
            loaded: dynamic.loaded ?? 0,
        },
        registry: {
            total: registry.total ?? 0,
            active: registry.active ?? 0,
        },
        ai: {
            totalCalls: metrics.totalAiCalls ?? 0,
            totalInputTokens: metrics.totalAiInputTokens ?? 0,
            totalOutputTokens: metrics.totalAiOutputTokens ?? 0,
            totalRequests: metrics.totalRequests ?? 0,
            totalFailures: metrics.totalFailures ?? 0,
            estimatedSpendUsd: estimatedSpend,
        },
    };
}

/**
 * Format a health snapshot as a Discord embed object (plain object,
 * caller wraps in EmbedBuilder). Returns fields ready to be assigned to
 * an EmbedBuilder.
 *
 * @param {object} health
 * @returns {{title: string, description: string, color: number, fields: Array<{name: string, value: string, inline: boolean}>, footer: {text: string}, timestamp: string}}
 */
export function formatDiagnosticEmbed(health) {
    if (!health) health = {};

    const mem = health.memory ?? {};
    const proc = health.process ?? {};
    const host = health.host ?? {};
    const mongo = health.mongo ?? {};
    const dynamic = health.dynamic ?? {};
    const registry = health.registry ?? {};
    const ai = health.ai ?? {};

    const memLine = `${formatBytes(mem.usedBytes ?? 0)} / ${formatBytes(mem.totalBytes ?? 0)} (${mem.usedPercent ?? 0}%)`;
    const procLine = `RSS ${formatBytes(proc.rss ?? 0)} · Heap ${formatBytes(proc.heapUsed ?? 0)}/${formatBytes(proc.heapTotal ?? 0)}`;

    const fields = [
        { name: "🧠 CPU", value: `${host.cpuCount ?? 0}× ${host.cpuModel ?? "?"}\nUsage: ${host.cpuPercent ?? 0}% · Load: ${(host.loadAvg ?? []).join(" / ")}`, inline: false },
        { name: "💾 RAM", value: memLine + `\nProcess: ${procLine}`, inline: false },
        { name: "🗄️ MongoDB", value: mongo.connected ? `✅ Connected${mongo.host ? ` (${mongo.host})` : ""}` : "❌ Disconnected", inline: true },
        { name: "🧩 Dynamic cmds", value: `${dynamic.loaded ?? 0} loaded / ${dynamic.files ?? 0} on disk`, inline: true },
        { name: "🗂️ System Registry", value: `${registry.active ?? 0} active / ${registry.total ?? 0} registered`, inline: true },
        { name: "⏱️ Uptime", value: `Bot: ${formatUptime(proc.uptimeSec ?? 0)}\nHost: ${formatUptime(host.uptimeSec ?? 0)}`, inline: true },
        { name: "💰 AI Spend (est.)", value: `Calls: ${ai.totalCalls ?? 0}\nTokens: in ${ai.totalInputTokens ?? 0} / out ${ai.totalOutputTokens ?? 0}\nEst. cost: **$${(ai.estimatedSpendUsd ?? 0).toFixed(4)}**`, inline: true },
    ];

    // Healthy = green, warnings = yellow, critical = red
    let color = 0x2ecc71; // green
    if ((mem.usedPercent ?? 0) > 90 || (host.cpuPercent ?? 0) > 90) color = 0xe74c3c; // red
    else if ((mem.usedPercent ?? 0) > 75 || (host.cpuPercent ?? 0) > 75) color = 0xf39c12; // orange
    if (!mongo.connected) color = 0xe74c3c;

    return {
        title: "🩺 AI System Diagnostic",
        description: `Node ${host.nodeVersion ?? "?"} · ${host.platform ?? "?"} · PID ${proc.pid ?? 0}`,
        color,
        fields,
        footer: { text: "Auto-diagnostic · refresh anytime with @Bot diagnostic" },
        timestamp: health.timestamp ?? new Date().toISOString(),
    };
}

export const _internal = {
    formatBytes,
    formatUptime,
    getCpuUsagePercent,
};
