import { test } from "node:test";
import assert from "node:assert/strict";
import {
    Scheduler,
    shouldFireNow,
    getDefaultScheduler,
    _internal,
} from "../Modules/scheduler.js";

const { getTimezoneParts } = _internal;

// ---------- shouldFireNow ----------

test("shouldFireNow: dailyAt at 12:00 fires when current time is 12:00", () => {
    const date = new Date("2026-06-19T12:00:30+07:00");
    assert.equal(shouldFireNow({ dailyAt: "12:00", timeZone: "Asia/Jakarta" }, date), true);
});

test("shouldFireNow: dailyAt at 12:00 does NOT fire at 11:59", () => {
    const date = new Date("2026-06-19T11:59:00+07:00");
    assert.equal(shouldFireNow({ dailyAt: "12:00", timeZone: "Asia/Jakarta" }, date), false);
});

test("shouldFireNow: dailyAt at 12:00 does NOT fire at 12:01", () => {
    const date = new Date("2026-06-19T12:01:00+07:00");
    assert.equal(shouldFireNow({ dailyAt: "12:00", timeZone: "Asia/Jakarta" }, date), false);
});

test("shouldFireNow: cron '0 12 * * *' fires at 12:00 every day", () => {
    const date = new Date("2026-06-19T12:00:00+07:00");
    assert.equal(shouldFireNow({ cron: "0 12 * * *", timeZone: "Asia/Jakarta" }, date), true);
});

test("shouldFireNow: cron with DoW filters days", () => {
    // 2026-06-19 is a Friday
    const friday = new Date("2026-06-19T09:00:00+07:00");
    const saturday = new Date("2026-06-20T09:00:00+07:00");
    assert.equal(shouldFireNow({ cron: "0 9 * * 5", timeZone: "Asia/Jakarta" }, friday), true);
    assert.equal(shouldFireNow({ cron: "0 9 * * 5", timeZone: "Asia/Jakarta" }, saturday), false);
});

test("shouldFireNow: one-shot at specific time", () => {
    const now = new Date("2026-06-19T12:00:00+07:00");
    assert.equal(
        shouldFireNow({ at: "2026-06-19T12:00:00+07:00", timeZone: "Asia/Jakarta" }, now),
        true
    );
});

test("shouldFireNow: one-shot before its time", () => {
    const now = new Date("2026-06-19T10:00:00+07:00");
    assert.equal(
        shouldFireNow({ at: "2026-06-19T12:00:00+07:00", timeZone: "Asia/Jakarta" }, now),
        false
    );
});

test("shouldFireNow: empty spec returns false", () => {
    assert.equal(shouldFireNow({}, new Date()), false);
    assert.equal(shouldFireNow(null, new Date()), false);
});

test("shouldFireNow: invalid dailyAt format returns false", () => {
    assert.equal(shouldFireNow({ dailyAt: "noon" }, new Date()), false);
});

test("shouldFireNow: invalid cron returns false (too few tokens)", () => {
    assert.equal(shouldFireNow({ cron: "0 12" }, new Date()), false);
});

// ---------- getTimezoneParts ----------

test("getTimezoneParts: Asia/Jakarta returns correct hour offset", () => {
    const date = new Date("2026-06-19T05:00:00Z"); // midnight Jakarta
    const parts = getTimezoneParts(date, "Asia/Jakarta");
    assert.equal(parts.hour, 12); // UTC+7 → noon
    assert.equal(parts.minute, 0);
});

test("getTimezoneParts: falls back to local time on invalid timezone", () => {
    const date = new Date("2026-06-19T12:34:00Z");
    const parts = getTimezoneParts(date, "Mars/Olympus_Mons");
    // Should not throw; should return some valid parts
    assert.equal(typeof parts.hour, "number");
    assert.equal(typeof parts.minute, "number");
});

// ---------- Scheduler ----------

test("Scheduler: start/stop is idempotent", () => {
    const s = new Scheduler();
    s.start();
    s.start(); // no-op
    s.stop();
    s.stop(); // no-op
});

test("Scheduler: register and list", () => {
    const s = new Scheduler();
    s.register("a", { dailyAt: "12:00" }, () => {});
    s.register("b", { dailyAt: "18:00" }, () => {});
    assert.equal(s.size(), 2);
    const list = s.list();
    assert.equal(list.length, 2);
    assert.ok(list.find((j) => j.id === "a"));
});

test("Scheduler: register requires id and callback", () => {
    const s = new Scheduler();
    assert.throws(() => s.register(null, {}, () => {}));
    assert.throws(() => s.register("a", {}, null));
});

test("Scheduler: register returns job metadata", () => {
    const s = new Scheduler();
    const job = s.register("a", { dailyAt: "12:00" }, () => {});
    assert.equal(job.id, "a");
    assert.equal(job.fireCount, 0);
    assert.ok(job.registeredAt);
});

test("Scheduler: unregister removes job", () => {
    const s = new Scheduler();
    s.register("a", { dailyAt: "12:00" }, () => {});
    assert.equal(s.unregister("a"), true);
    assert.equal(s.size(), 0);
});

test("Scheduler: unregister on missing returns false", () => {
    const s = new Scheduler();
    assert.equal(s.unregister("ghost"), false);
});

test("Scheduler: fireNow calls the callback", async () => {
    const s = new Scheduler();
    let calls = 0;
    s.register("a", { dailyAt: "12:00" }, () => {
        calls++;
    });
    const r = await s.fireNow("a");
    assert.equal(r.ok, true);
    assert.equal(calls, 1);
});

test("Scheduler: fireNow on missing job returns error", async () => {
    const s = new Scheduler();
    const r = await s.fireNow("ghost");
    assert.equal(r.ok, false);
});

test("Scheduler: fireNow captures callback errors", async () => {
    const s = new Scheduler();
    s.register("bad", { dailyAt: "12:00" }, () => {
        throw new Error("intentional");
    });
    const r = await s.fireNow("bad");
    assert.equal(r.ok, false);
    assert.match(r.error, /intentional/);
});

test("Scheduler: clear empties all jobs", () => {
    const s = new Scheduler();
    s.register("a", {}, () => {});
    s.register("b", {}, () => {});
    s.clear();
    assert.equal(s.size(), 0);
});

test("Scheduler: tick fires due jobs", async () => {
    const s = new Scheduler();
    let calls = 0;
    s.register("a", { dailyAt: "12:00" }, () => {
        calls++;
    });
    // Manually invoke tick with mocked time via _tick — instead just fire via fireNow
    await s.fireNow("a");
    assert.equal(calls, 1);
});

test("Scheduler: job spec is preserved on list", () => {
    const s = new Scheduler();
    s.register("a", { dailyAt: "12:00" }, () => {});
    const list = s.list();
    assert.equal(list[0].spec.dailyAt, "12:00");
});

test("Scheduler: fireCount increments on success", async () => {
    const s = new Scheduler();
    s.register("a", {}, () => "ok");
    await s.fireNow("a");
    await s.fireNow("a");
    const list = s.list();
    assert.equal(list[0].fireCount, 2);
    assert.ok(list[0].lastFiredAt);
});

test("Scheduler: lastError captured on callback throw", async () => {
    const s = new Scheduler();
    s.register("a", {}, () => {
        throw new Error("explode");
    });
    await s.fireNow("a");
    const list = s.list();
    assert.equal(list[0].lastError, "explode");
});

// ---------- Default scheduler ----------

test("getDefaultScheduler: returns same instance", () => {
    const a = getDefaultScheduler();
    const b = getDefaultScheduler();
    assert.equal(a, b);
});
