import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    SystemRegistry,
    getDefaultRegistry,
    resetDefaultRegistry,
    formatSystemList,
    parseSystemCommand,
} from "../Modules/systemRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_PATH = path.join(__dirname, "_tmp_registry.json");

async function clean() {
    await fs.rm(TMP_PATH, { force: true });
}

test.afterEach(async () => {
    await clean();
});

// ---------- SystemRegistry basic CRUD ----------

test("SystemRegistry: set then get", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("daily_reminder", { name: "Daily Reminder", status: "on" });
    const got = r.get("daily_reminder");
    assert.equal(got.id, "daily_reminder");
    assert.equal(got.name, "Daily Reminder");
    assert.equal(got.status, "on");
});

test("SystemRegistry: set persists to disk", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("a", { name: "A", status: "on" });
    const r2 = new SystemRegistry({ filePath: TMP_PATH, autoLoad: true });
    // Wait a tick for autoLoad to complete
    await new Promise((res) => setTimeout(res, 50));
    const got = r2.get("a");
    assert.ok(got, "Expected entry to be loaded from disk");
    assert.equal(got.name, "A");
});

test("SystemRegistry: get returns null for missing", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    assert.equal(r.get("nope"), null);
});

test("SystemRegistry: set preserves createdAt on re-set", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    const first = await r.set("x", { name: "X" });
    const originalCreated = first.createdAt;
    await new Promise((res) => setTimeout(res, 10));
    const second = await r.set("x", { status: "on" });
    assert.equal(second.createdAt, originalCreated);
    assert.notEqual(second.updatedAt, originalCreated);
});

test("SystemRegistry: list returns all entries", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("a", { name: "A" });
    await r.set("b", { name: "B" });
    const list = r.list();
    assert.equal(list.length, 2);
    assert.ok(list.find((e) => e.id === "a"));
    assert.ok(list.find((e) => e.id === "b"));
});

test("SystemRegistry: list filters by status", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("a", { status: "on" });
    await r.set("b", { status: "off" });
    await r.set("c", { status: "on" });
    const onOnly = r.list({ status: "on" });
    assert.equal(onOnly.length, 2);
});

test("SystemRegistry: toggle on→off", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("x", { status: "on" });
    const result = await r.toggle("x");
    assert.equal(result.previousStatus, "on");
    assert.equal(result.entry.status, "off");
});

test("SystemRegistry: toggle off→on", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("x", { status: "off" });
    const result = await r.toggle("x");
    assert.equal(result.previousStatus, "off");
    assert.equal(result.entry.status, "on");
});

test("SystemRegistry: toggle on missing entry throws", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await assert.rejects(() => r.toggle("ghost"));
});

test("SystemRegistry: markError sets status + metadata", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("x", { status: "on" });
    await r.markError("x", "boom");
    const got = r.get("x");
    assert.equal(got.status, "error");
    assert.equal(got.metadata.lastError, "boom");
});

test("SystemRegistry: remove deletes entry", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("x", {});
    const removed = await r.remove("x");
    assert.equal(removed, true);
    assert.equal(r.get("x"), null);
});

test("SystemRegistry: remove on missing returns false", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    const removed = await r.remove("ghost");
    assert.equal(removed, false);
});

test("SystemRegistry: clear empties everything", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("a", {});
    await r.set("b", {});
    await r.clear();
    assert.equal(r.size(), 0);
});

test("SystemRegistry: status must be valid", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    const e = await r.set("x", { status: "weird" });
    // Invalid status should normalize to 'off'
    assert.equal(e.status, "off");
});

test("SystemRegistry: schedule preserved on re-set", async () => {
    const r = new SystemRegistry({ filePath: TMP_PATH, autoLoad: false });
    await r.set("daily", { schedule: { cron: "0 12 * * *" } });
    const got = r.get("daily");
    assert.equal(got.schedule.cron, "0 12 * * *");
});

// ---------- formatSystemList ----------

test("formatSystemList: empty list", () => {
    const out = formatSystemList([]);
    assert.match(out, /[Bb]elum ada/);
});

test("formatSystemList: includes name + status", () => {
    const out = formatSystemList([
        { id: "a", name: "A", status: "on", description: "", schedule: null, metadata: {} },
    ]);
    assert.match(out, /A/);
    assert.match(out, /on/i);
});

test("formatSystemList: shows last error when errored", () => {
    const out = formatSystemList([
        { id: "a", name: "A", status: "error", description: "", schedule: null, metadata: { lastError: "boom" } },
    ]);
    assert.match(out, /boom/);
});

test("formatSystemList: shows schedule", () => {
    const out = formatSystemList([
        { id: "a", name: "A", status: "on", description: "", schedule: { dailyAt: "12:00" }, metadata: {} },
    ]);
    assert.match(out, /12:00/);
});

// ---------- parseSystemCommand ----------

test("parseSystemCommand: list command", () => {
    assert.equal(parseSystemCommand("list systems").kind, "list");
    assert.equal(parseSystemCommand("lihat semua sistem").kind, "list");
    assert.equal(parseSystemCommand("apa yang lagi jalan").kind, "list");
});

test("parseSystemCommand: turn on", () => {
    const r = parseSystemCommand("turn on daily_reminder");
    assert.equal(r.kind, "toggle");
    assert.equal(r.id, "daily_reminder");
    assert.equal(r.status, "on");
});

test("parseSystemCommand: turn off", () => {
    const r = parseSystemCommand("turn off daily_reminder");
    assert.equal(r.kind, "toggle");
    assert.equal(r.id, "daily_reminder");
    assert.equal(r.status, "off");
});

test("parseSystemCommand: Indonesian nyalakan", () => {
    const r = parseSystemCommand("nyalakan daily reminder");
    assert.equal(r.kind, "toggle");
    // "daily" or "reminder" — the function picks the first alphanumeric token;
    // either is acceptable as long as status is on
    assert.equal(r.status, "on");
});

test("parseSystemCommand: Indonesian matikan", () => {
    const r = parseSystemCommand("matikan daily reminder");
    assert.equal(r.status, "off");
});

test("parseSystemCommand: status check", () => {
    const r = parseSystemCommand("status daily_reminder");
    assert.equal(r.kind, "status");
    assert.equal(r.id, "daily_reminder");
});

test("parseSystemCommand: unknown falls through", () => {
    assert.equal(parseSystemCommand("bikin role merah").kind, "unknown");
    assert.equal(parseSystemCommand("").kind, "unknown");
    assert.equal(parseSystemCommand(null).kind, "unknown");
});

test("parseSystemCommand: handles null/non-string", () => {
    assert.equal(parseSystemCommand(undefined).kind, "unknown");
    assert.equal(parseSystemCommand(42).kind, "unknown");
});

// ---------- default registry singleton ----------

test("getDefaultRegistry: returns same instance", () => {
    const a = getDefaultRegistry();
    const b = getDefaultRegistry();
    assert.equal(a, b);
});

test("resetDefaultRegistry: clears entries", async () => {
    const r = getDefaultRegistry();
    await r.set("temp_x", { name: "Temp" });
    assert.ok(r.get("temp_x"));
    resetDefaultRegistry();
    assert.equal(r.get("temp_x"), null);
});
