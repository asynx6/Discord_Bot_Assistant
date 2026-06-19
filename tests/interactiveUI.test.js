import { test } from "node:test";
import assert from "node:assert/strict";
import {
    EXPIRY_MS,
    newYesNoId,
    newTokenId,
    parseYesNoId,
    parseTokenId,
    isExpired,
    formatRemaining,
    resolveYesNoAnswer,
    expiredNoticeMessage,
    yesNoFooter,
} from "../Modules/interactiveUI.js";

// ---------- customId encoding ----------

test("newYesNoId: includes prefix and expiry", () => {
    const id = newYesNoId("test");
    assert.match(id.customId, /^ui_yesno:/);
    assert.ok(id.expiresAt > Date.now());
    assert.equal(id.tag, "test");
});

test("newYesNoId: default tag is 'yn'", () => {
    const id = newYesNoId();
    assert.equal(id.tag, "yn");
});

test("newYesNoId: expiry is roughly 60s in the future", () => {
    const before = Date.now();
    const id = newYesNoId();
    const expected = before + EXPIRY_MS;
    // Allow a 1-second tolerance
    assert.ok(Math.abs(id.expiresAt - expected) < 1000);
});

test("newYesNoId: ids are unique", () => {
    const a = newYesNoId();
    const b = newYesNoId();
    assert.notEqual(a.customId, b.customId);
});

test("newTokenId: includes prefix and envVar", () => {
    const id = newTokenId("GIPHY_API_KEY");
    assert.match(id.customId, /^ui_token:/);
    assert.equal(id.envVar, "GIPHY_API_KEY");
});

// ---------- parsing ----------

test("parseYesNoId: round-trips", () => {
    const id = newYesNoId("rt");
    const parsed = parseYesNoId(id.customId);
    assert.ok(parsed);
    assert.equal(parsed.tag, "rt");
    assert.equal(parsed.expiresAt, id.expiresAt);
});

test("parseYesNoId: returns null for non-prefixed", () => {
    assert.equal(parseYesNoId("foo"), null);
    assert.equal(parseYesNoId(""), null);
    assert.equal(parseYesNoId(null), null);
});

test("parseYesNoId: returns null for malformed", () => {
    assert.equal(parseYesNoId("ui_yesno:"), null);
    assert.equal(parseYesNoId("ui_yesno:abc"), null); // no expiresAt
    assert.equal(parseYesNoId("ui_yesno:abc|notanumber|tag"), null);
});

test("parseTokenId: round-trips", () => {
    const id = newTokenId("MY_KEY");
    const parsed = parseTokenId(id.customId);
    assert.equal(parsed.envVar, "MY_KEY");
});

// ---------- isExpired ----------

test("isExpired: false when now < expiresAt", () => {
    const parsed = { expiresAt: Date.now() + 1000 };
    assert.equal(isExpired(parsed), false);
});

test("isExpired: true when now >= expiresAt", () => {
    const parsed = { expiresAt: Date.now() - 1 };
    assert.equal(isExpired(parsed), true);
});

test("isExpired: true for null/invalid", () => {
    assert.equal(isExpired(null), true);
    assert.equal(isExpired({}), true);
    assert.equal(isExpired({ expiresAt: NaN }), true);
});

// ---------- formatRemaining ----------

test("formatRemaining: returns seconds", () => {
    const r = formatRemaining(Date.now() + 5000);
    assert.match(r, /^\d+s$/);
});

test("formatRemaining: clamps to 0s when expired", () => {
    assert.equal(formatRemaining(Date.now() - 1000), "0s");
});

// ---------- resolveYesNoAnswer ----------

test("resolveYesNoAnswer: returns 'yes' for yes_ prefixed and not expired", () => {
    const id = newYesNoId("t");
    const yesCustom = id.customId.replace("ui_yesno:", "ui_yesno:yes_");
    assert.equal(resolveYesNoAnswer(yesCustom), "yes");
});

test("resolveYesNoAnswer: returns 'no' for no_ prefixed and not expired", () => {
    const id = newYesNoId("t");
    const noCustom = id.customId.replace("ui_yesno:", "ui_yesno:no_");
    assert.equal(resolveYesNoAnswer(noCustom), "no");
});

test("resolveYesNoAnswer: returns null when expired", () => {
    const id = { customId: `ui_yesno:abc|${Date.now() - 1000}|t`, expiresAt: Date.now() - 1000 };
    const yesCustom = id.customId.replace("ui_yesno:", "ui_yesno:yes_");
    assert.equal(resolveYesNoAnswer(yesCustom), null);
});

test("resolveYesNoAnswer: returns null for unknown customId", () => {
    assert.equal(resolveYesNoAnswer("other:id"), null);
    assert.equal(resolveYesNoAnswer(""), null);
    assert.equal(resolveYesNoAnswer(null), null);
});

test("resolveYesNoAnswer: yes_ and no_ need prefix even with extra parts", () => {
    // customId without "yes_" or "no_" inside the suffix should not resolve
    const id = newYesNoId("t");
    // id.customId is e.g. "ui_yesno:abc|123|t" — no yes_/no_ prefix
    assert.equal(resolveYesNoAnswer(id.customId), null);
});

// ---------- expiredNoticeMessage ----------

test("expiredNoticeMessage: mentions 60s", () => {
    const msg = expiredNoticeMessage();
    assert.match(msg, /60/);
    assert.match(msg, /expired/i);
});

test("expiredNoticeMessage: includes tag when provided", () => {
    const msg = expiredNoticeMessage("daily_reminder");
    assert.match(msg, /daily_reminder/);
});

// ---------- yesNoFooter ----------

test("yesNoFooter: shows remaining time", () => {
    const footer = yesNoFooter(Date.now() + 30000);
    assert.match(footer, /\d+s/);
    assert.match(footer, /expire/i);
});

test("yesNoFooter: shows 0s when already expired", () => {
    const footer = yesNoFooter(Date.now() - 1000);
    assert.match(footer, /0s/);
});

// ---------- EXPIRY_MS constant ----------

test("EXPIRY_MS: is 60 seconds", () => {
    assert.equal(EXPIRY_MS, 60_000);
});
