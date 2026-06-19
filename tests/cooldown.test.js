import { test } from "node:test";
import assert from "node:assert/strict";
import { cooldown, CooldownTags } from "../Modules/cooldown.js";

test("allows first request", () => {
    const cd = cooldown.check("user-1");
    assert.equal(cd.allowed, true);
    assert.equal(cd.reason, null);
});

test("blocks request immediately after consume", () => {
    cooldown.consume("user-2");
    const cd = cooldown.check("user-2");
    assert.equal(cd.allowed, false);
    assert.match(cd.reason, /global cooldown/);
});

test("separate users do not interfere", () => {
    cooldown.consume("user-3");
    const cd = cooldown.check("user-4");
    assert.equal(cd.allowed, true);
});

test("action-specific cooldowns are stricter than global", () => {
    cooldown.consume("user-5", CooldownTags.BAN);
    const cd = cooldown.check("user-5", CooldownTags.BAN);
    assert.equal(cd.allowed, false);
    assert.match(cd.reason, /BAN cooldown/);
});

test("reset clears all cooldowns for user", () => {
    cooldown.consume("user-6", CooldownTags.BAN);
    cooldown.reset("user-6");
    const cd = cooldown.check("user-6", CooldownTags.BAN);
    assert.equal(cd.allowed, true);
});

test("destroy stops background timer", () => {
    const cd = cooldown;
    cd.destroy();
    assert.doesNotThrow(() => cd.consume("user-7"));
    assert.doesNotThrow(() => cd.destroy());
});

test("retryAfterMs is positive when blocked", () => {
    cooldown.consume("user-8", CooldownTags.NUKE_DELETE);
    const cd = cooldown.check("user-8", CooldownTags.NUKE_DELETE);
    assert.ok(cd.retryAfterMs > 0);
    assert.ok(cd.retryAfterMs <= 30_000);
});

test("CooldownTags is frozen", () => {
    assert.throws(
        () => {
            CooldownTags.NEW = "x";
        },
        /TypeError|Cannot add property|read only/
    );
});
