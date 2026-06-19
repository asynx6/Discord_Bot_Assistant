import { test } from "node:test";
import assert from "node:assert/strict";
import { metrics } from "../Modules/metrics.js";

test("records request and increments total", () => {
    const before = metrics.snapshot().totals.requests;
    metrics.recordRequest({ userId: "u1", guildId: "g1" });
    const after = metrics.snapshot().totals.requests;
    assert.equal(after, before + 1);
});

test("tracks per-user counts", () => {
    metrics.reset();
    metrics.recordRequest({ userId: "alice" });
    metrics.recordRequest({ userId: "alice" });
    metrics.recordRequest({ userId: "bob" });
    const snap = metrics.snapshot();
    const alice = snap.topUsers.find((e) => e.key === "alice");
    const bob = snap.topUsers.find((e) => e.key === "bob");
    assert.equal(alice?.count, 2);
    assert.equal(bob?.count, 1);
});

test("records action success and failure", () => {
    metrics.reset();
    metrics.recordAction("CREATE_CHANNEL", true);
    metrics.recordAction("CREATE_CHANNEL", true);
    metrics.recordAction("DELETE_CHANNEL", false);
    const snap = metrics.snapshot();
    assert.equal(snap.totals.failures, 1);
    const createOk = snap.topActions.find((e) => e.key === "CREATE_CHANNEL:ok");
    assert.equal(createOk?.count, 2);
});

test("failure rate is calculated correctly", () => {
    metrics.reset();
    metrics.recordRequest({});
    metrics.recordRequest({});
    metrics.recordAction("X", false);
    metrics.recordAction("X", true);
    const snap = metrics.snapshot();
    assert.equal(snap.totals.failureRate, 0.5);
});

test("failure rate is zero with no failures", () => {
    metrics.reset();
    metrics.recordRequest({});
    metrics.recordAction("X", true);
    const snap = metrics.snapshot();
    assert.equal(snap.totals.failureRate, 0);
});

test("failure rate is zero when no requests", () => {
    metrics.reset();
    const snap = metrics.snapshot();
    assert.equal(snap.totals.failureRate, 0);
});

test("AI token tracking accumulates", () => {
    metrics.reset();
    metrics.recordAiCall({ inputTokens: 100, outputTokens: 50 });
    metrics.recordAiCall({ inputTokens: 200, outputTokens: 75 });
    const snap = metrics.snapshot();
    assert.equal(snap.totals.aiCalls, 2);
    assert.equal(snap.totals.aiInputTokens, 300);
    assert.equal(snap.totals.aiOutputTokens, 125);
});

test("reset zeroes everything", () => {
    metrics.recordRequest({ userId: "x" });
    metrics.recordAction("Y", true);
    metrics.reset();
    const snap = metrics.snapshot();
    assert.equal(snap.totals.requests, 0);
    assert.equal(snap.totals.failures, 0);
    assert.equal(snap.topUsers.length, 0);
    assert.equal(snap.topActions.length, 0);
});

test("formatSummary is non-empty and contains expected fields", () => {
    metrics.reset();
    metrics.recordRequest({ userId: "u" });
    metrics.recordAction("TEST", true);
    const text = metrics.formatSummary();
    assert.ok(text.includes("Bot Metrics"));
    assert.ok(text.includes("Total requests"));
    assert.ok(text.includes("Top actions"));
});

test("uptimeSec is monotonically non-negative", () => {
    const snap = metrics.snapshot();
    assert.ok(snap.uptimeSec >= 0);
});
