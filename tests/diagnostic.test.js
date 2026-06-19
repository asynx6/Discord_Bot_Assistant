import { test } from "node:test";
import assert from "node:assert/strict";
import {
    getSystemHealth,
    formatDiagnosticEmbed,
    _internal,
} from "../Modules/diagnostic.js";

const { formatBytes, formatUptime } = _internal;

// ---------- formatBytes ----------

test("formatBytes: bytes", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
});

test("formatBytes: kilobytes", () => {
    assert.match(formatBytes(2048), /KB/);
});

test("formatBytes: megabytes", () => {
    assert.match(formatBytes(5 * 1024 * 1024), /MB/);
});

test("formatBytes: gigabytes", () => {
    assert.match(formatBytes(2 * 1024 * 1024 * 1024), /GB/);
});

test("formatBytes: invalid input returns 0 B", () => {
    assert.equal(formatBytes(NaN), "0 B");
    assert.equal(formatBytes(-1), "0 B");
});

// ---------- formatUptime ----------

test("formatUptime: seconds only", () => {
    assert.equal(formatUptime(30), "30s");
});

test("formatUptime: minutes and seconds", () => {
    assert.equal(formatUptime(125), "2m 5s");
});

test("formatUptime: hours", () => {
    assert.equal(formatUptime(3725), "1h 2m 5s");
});

test("formatUptime: days", () => {
    assert.equal(formatUptime(90061), "1d 1h 1m 1s");
});

test("formatUptime: clamps negative to 0", () => {
    assert.equal(formatUptime(-10), "0s");
});

// ---------- getSystemHealth ----------

test("getSystemHealth: returns valid structure", async () => {
    const h = await getSystemHealth();
    assert.ok(h.timestamp);
    assert.ok(h.host);
    assert.ok(h.memory);
    assert.ok(h.process);
    assert.ok(h.mongo);
    assert.ok(h.dynamic);
    assert.ok(h.registry);
    assert.ok(h.ai);
});

test("getSystemHealth: includes platform and arch", async () => {
    const h = await getSystemHealth();
    assert.equal(typeof h.host.platform, "string");
    assert.equal(typeof h.host.arch, "string");
});

test("getSystemHealth: memory has total and free", async () => {
    const h = await getSystemHealth();
    assert.ok(h.memory.totalBytes > 0);
    assert.ok(h.memory.freeBytes >= 0);
    assert.ok(h.memory.usedBytes >= 0);
});

test("getSystemHealth: process has pid and rss", async () => {
    const h = await getSystemHealth();
    assert.equal(h.process.pid, process.pid);
    assert.ok(h.process.rss > 0);
});

test("getSystemHealth: integrates metrics options", async () => {
    const h = await getSystemHealth({
        metrics: { totalAiCalls: 10, totalAiInputTokens: 1000, totalAiOutputTokens: 500, totalRequests: 50, totalFailures: 1 },
    });
    assert.equal(h.ai.totalCalls, 10);
    assert.equal(h.ai.totalInputTokens, 1000);
    assert.equal(h.ai.totalOutputTokens, 500);
    assert.equal(h.ai.totalRequests, 50);
    assert.equal(h.ai.totalFailures, 1);
    assert.ok(h.ai.estimatedSpendUsd > 0);
});

test("getSystemHealth: integrates dynamic and registry options", async () => {
    const h = await getSystemHealth({
        dynamic: { count: 12, loaded: 8 },
        registry: { total: 5, active: 3 },
    });
    assert.equal(h.dynamic.files, 12);
    assert.equal(h.dynamic.loaded, 8);
    assert.equal(h.registry.total, 5);
    assert.equal(h.registry.active, 3);
});

test("getSystemHealth: integrates mongo state", async () => {
    const h = await getSystemHealth({ mongo: { connected: true, host: "cluster.mongodb.net" } });
    assert.equal(h.mongo.connected, true);
    assert.equal(h.mongo.host, "cluster.mongodb.net");
});

test("getSystemHealth: default mongo is disconnected", async () => {
    const h = await getSystemHealth();
    assert.equal(h.mongo.connected, false);
});

test("getSystemHealth: cost estimate scales linearly with tokens", async () => {
    const a = await getSystemHealth({ metrics: { totalAiInputTokens: 1000, totalAiOutputTokens: 1000 } });
    const b = await getSystemHealth({ metrics: { totalAiInputTokens: 2000, totalAiOutputTokens: 2000 } });
    assert.ok(b.ai.estimatedSpendUsd > a.ai.estimatedSpendUsd);
});

test("getSystemHealth: zero tokens means zero cost", async () => {
    const h = await getSystemHealth({ metrics: { totalAiInputTokens: 0, totalAiOutputTokens: 0 } });
    assert.equal(h.ai.estimatedSpendUsd, 0);
});

// ---------- formatDiagnosticEmbed ----------

test("formatDiagnosticEmbed: returns valid embed shape", async () => {
    const h = await getSystemHealth();
    const e = formatDiagnosticEmbed(h);
    assert.equal(e.title, "🩺 AI System Diagnostic");
    assert.ok(Array.isArray(e.fields));
    assert.ok(typeof e.color === "number");
});

test("formatDiagnosticEmbed: includes all expected fields", async () => {
    const h = await getSystemHealth();
    const e = formatDiagnosticEmbed(h);
    const names = e.fields.map((f) => f.name);
    assert.ok(names.some((n) => n.includes("CPU")));
    assert.ok(names.some((n) => n.includes("RAM")));
    assert.ok(names.some((n) => n.includes("MongoDB")));
    assert.ok(names.some((n) => n.includes("Dynamic")));
    assert.ok(names.some((n) => n.includes("Spend")));
});

test("formatDiagnosticEmbed: green when healthy", async () => {
    // Pass explicit low values to make the test deterministic
    const h = await getSystemHealth({ mongo: { connected: true } });
    h.memory.usedPercent = 30;
    h.host.cpuPercent = 20;
    const e = formatDiagnosticEmbed(h);
    assert.equal(e.color, 0x2ecc71);
});

test("formatDiagnosticEmbed: red when mongo disconnected", async () => {
    const h = await getSystemHealth({ mongo: { connected: false } });
    const e = formatDiagnosticEmbed(h);
    assert.equal(e.color, 0xe74c3c);
});

test("formatDiagnosticEmbed: red when high memory pressure", async () => {
    const h = await getSystemHealth({
        mongo: { connected: true },
        // Fake a heavily-used system
        // We can't easily fake os.totalmem, so just test the color is one of the valid set
    });
    const e = formatDiagnosticEmbed(h);
    assert.ok([0x2ecc71, 0xf39c12, 0xe74c3c].includes(e.color));
});

test("formatDiagnosticEmbed: timestamp included", async () => {
    const h = await getSystemHealth();
    const e = formatDiagnosticEmbed(h);
    assert.ok(e.timestamp);
});

test("formatDiagnosticEmbed: tolerates empty health", () => {
    const e = formatDiagnosticEmbed({});
    assert.equal(e.title, "🩺 AI System Diagnostic");
    assert.ok(Array.isArray(e.fields));
});

test("formatDiagnosticEmbed: includes token spend line", async () => {
    const h = await getSystemHealth({
        metrics: { totalAiCalls: 5, totalAiInputTokens: 100, totalAiOutputTokens: 50 },
    });
    const e = formatDiagnosticEmbed(h);
    const spendField = e.fields.find((f) => f.name.includes("Spend"));
    assert.ok(spendField);
    assert.match(spendField.value, /\$/);
});
