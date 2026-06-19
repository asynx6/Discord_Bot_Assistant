import { test } from "node:test";
import assert from "node:assert/strict";
import {
    normalizeTextForHash,
    computeTextHash,
    fingerprintMessage,
    AntiPhishingTracker,
    recordAndCheckMessage,
    resetDefaultTracker,
    phishingWarningMessage,
} from "../Modules/antiPhishing.js";

// ---------- normalizeTextForHash ----------

test("normalizeTextForHash: lowercase", () => {
    assert.equal(normalizeTextForHash("HELLO"), "hello");
});

test("normalizeTextForHash: strip URLs", () => {
    assert.equal(
        normalizeTextForHash("check this https://evil.com/pay now"),
        "check this now"
    );
});

test("normalizeTextForHash: collapse whitespace", () => {
    assert.equal(normalizeTextForHash("a   b\t\tc\n\nd"), "a b c d");
});

test("normalizeTextForHash: trims and handles empty", () => {
    assert.equal(normalizeTextForHash("   "), "");
    assert.equal(normalizeTextForHash(null), "");
    assert.equal(normalizeTextForHash(undefined), "");
});

// ---------- computeTextHash ----------

test("computeTextHash: deterministic for same input", () => {
    const a = computeTextHash("Hello World");
    const b = computeTextHash("Hello World");
    assert.equal(a, b);
    assert.equal(a.length, 64); // sha256 hex
});

test("computeTextHash: case + URL + whitespace variations collide", () => {
    const a = computeTextHash("Check this https://evil.com/pay now");
    const b = computeTextHash("check  this https://evil.com/pay NOW");
    assert.equal(a, b);
});

test("computeTextHash: empty input returns empty string", () => {
    assert.equal(computeTextHash(""), "");
    assert.equal(computeTextHash(null), "");
});

// ---------- fingerprintMessage ----------

test("fingerprintMessage: text-only message", () => {
    const fp = fingerprintMessage({ text: "hello", imageUrls: [] });
    assert.equal(fp.textHash.length, 64);
    assert.deepEqual(fp.imageHashes, []);
    assert.equal(fp.compositeHash.length, 64);
});

test("fingerprintMessage: image-only message", () => {
    const fp = fingerprintMessage({ text: "", imageUrls: ["https://x/a.png"] });
    assert.equal(fp.textHash, "");
    assert.equal(fp.imageHashes.length, 1);
    assert.equal(fp.compositeHash.length, 64);
});

test("fingerprintMessage: text + image collision regardless of order", () => {
    const a = fingerprintMessage({ text: "x", imageUrls: ["u1", "u2"] });
    const b = fingerprintMessage({ text: "x", imageUrls: ["u2", "u1"] });
    assert.equal(a.compositeHash, b.compositeHash);
});

test("fingerprintMessage: filters invalid image URLs", () => {
    const fp = fingerprintMessage({ text: "hi", imageUrls: ["valid", null, undefined, "", 42] });
    assert.equal(fp.imageHashes.length, 1);
});

test("fingerprintMessage: empty content returns empty compositeHash", () => {
    const fp = fingerprintMessage({ text: "", imageUrls: [] });
    assert.equal(fp.compositeHash, "");
});

// ---------- AntiPhishingTracker ----------

test("AntiPhishingTracker: first message is not phishing", () => {
    const t = new AntiPhishingTracker();
    const r = t.recordAndCheck({
        userId: "u1",
        channelId: "c1",
        messageId: "m1",
        text: "hello",
    });
    assert.equal(r.isPhishing, false);
    assert.equal(r.distinctChannels, 1);
});

test("AntiPhishingTracker: same content in 4 channels triggers phishing", () => {
    const t = new AntiPhishingTracker();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "buy now" });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "buy now" });
    t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", text: "buy now" });
    const fourth = t.recordAndCheck({ userId: "u1", channelId: "c4", messageId: "m4", text: "buy now" });
    assert.equal(fourth.isPhishing, true);
    assert.equal(fourth.distinctChannels, 4);
    assert.ok(fourth.relatedMessages.length >= 4);
});

test("AntiPhishingTracker: 3 channels does NOT trigger (threshold=3 means strictly more)", () => {
    const t = new AntiPhishingTracker();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "x" });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "x" });
    const r = t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", text: "x" });
    assert.equal(r.isPhishing, false);
    assert.equal(r.distinctChannels, 3);
});

test("AntiPhishingTracker: DIFFERENT content in 4 channels is NOT phishing", () => {
    const t = new AntiPhishingTracker();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "a" });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "b" });
    t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", text: "c" });
    const r = t.recordAndCheck({ userId: "u1", channelId: "c4", messageId: "m4", text: "d" });
    assert.equal(r.isPhishing, false);
    assert.equal(r.distinctChannels, 1);
});

test("AntiPhishingTracker: images only (no text) tracked by URL", () => {
    const t = new AntiPhishingTracker();
    const img = ["https://x/spam.png"];
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", imageUrls: img });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", imageUrls: img });
    t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", imageUrls: img });
    const r = t.recordAndCheck({ userId: "u1", channelId: "c4", messageId: "m4", imageUrls: img });
    assert.equal(r.isPhishing, true);
});

test("AntiPhishingTracker: case-insensitive text matching", () => {
    const t = new AntiPhishingTracker();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "BUY NOW" });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "buy now" });
    t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", text: "Buy Now" });
    const r = t.recordAndCheck({ userId: "u1", channelId: "c4", messageId: "m4", text: "BUY now" });
    assert.equal(r.isPhishing, true);
});

test("AntiPhishingTracker: URL variations do not produce false positives", () => {
    // URLs are stripped from text, so two messages with different URLs but same body collide
    const t = new AntiPhishingTracker();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "check https://a.com" });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "check https://b.com" });
    t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", text: "check https://c.com" });
    const r = t.recordAndCheck({ userId: "u1", channelId: "c4", messageId: "m4", text: "check https://d.com" });
    assert.equal(r.isPhishing, true);
});

test("AntiPhishingTracker: per-user isolation", () => {
    const t = new AntiPhishingTracker();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "x" });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "x" });
    t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", text: "x" });
    // u2 sending same content should NOT be flagged
    const r2 = t.recordAndCheck({ userId: "u2", channelId: "c4", messageId: "m4", text: "x" });
    assert.equal(r2.isPhishing, false);
    assert.equal(r2.distinctChannels, 1);
});

test("AntiPhishingTracker: window expiry clears old entries", () => {
    const t = new AntiPhishingTracker({ windowMs: 1000 });
    const base = Date.now();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "x", timestamp: base });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "x", timestamp: base + 100 });
    t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", text: "x", timestamp: base + 200 });
    // Wait past window then send new message
    const r = t.recordAndCheck({ userId: "u1", channelId: "c4", messageId: "m4", text: "x", timestamp: base + 5000 });
    assert.equal(r.isPhishing, false);
    assert.equal(r.distinctChannels, 1);
});

test("AntiPhishingTracker: custom threshold respected", () => {
    const t = new AntiPhishingTracker({ channelThreshold: 1 });
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "x" });
    const r = t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "x" });
    assert.equal(r.isPhishing, true);
});

test("AntiPhishingTracker: forgetUser clears state", () => {
    const t = new AntiPhishingTracker();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "x" });
    t.recordAndCheck({ userId: "u1", channelId: "c2", messageId: "m2", text: "x" });
    t.forgetUser("u1");
    const r = t.recordAndCheck({ userId: "u1", channelId: "c3", messageId: "m3", text: "x" });
    assert.equal(r.isPhishing, false);
    assert.equal(r.distinctChannels, 1);
});

test("AntiPhishingTracker: reset clears ALL state", () => {
    const t = new AntiPhishingTracker();
    t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "x" });
    t.recordAndCheck({ userId: "u2", channelId: "c1", messageId: "m1", text: "y" });
    t.reset();
    const snap = t.snapshot();
    assert.deepEqual(snap.users, {});
});

test("AntiPhishingTracker: same channel posting 5 times does NOT trigger", () => {
    const t = new AntiPhishingTracker();
    for (let i = 0; i < 5; i++) {
        const r = t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: `m${i}`, text: "x" });
        assert.equal(r.isPhishing, false);
    }
});

test("AntiPhishingTracker: empty content short-circuits", () => {
    const t = new AntiPhishingTracker();
    const r = t.recordAndCheck({ userId: "u1", channelId: "c1", messageId: "m1", text: "" });
    assert.equal(r.recorded, false);
    assert.equal(r.isPhishing, false);
    assert.equal(r.reason, "empty-content");
});

test("AntiPhishingTracker: missing fields short-circuits", () => {
    const t = new AntiPhishingTracker();
    const r = t.recordAndCheck({ userId: "", channelId: "c1", messageId: "m1", text: "x" });
    assert.equal(r.recorded, false);
    assert.equal(r.reason, "missing-fields");
});

test("AntiPhishingTracker: maxTrackedPerUser cap enforced", () => {
    const t = new AntiPhishingTracker({ maxTrackedPerUser: 3 });
    for (let i = 0; i < 10; i++) {
        t.recordAndCheck({ userId: "u1", channelId: `c${i}`, messageId: `m${i}`, text: "x" });
    }
    const snap = t.snapshot();
    const totalEntries = Object.values(snap.users.u1 ?? {}).reduce(
        (sum, h) => sum + h.entryCount,
        0
    );
    assert.ok(totalEntries <= 3);
});

// ---------- Module-level singleton ----------

test("recordAndCheckMessage: uses shared default tracker", () => {
    resetDefaultTracker();
    recordAndCheckMessage({ userId: "su1", channelId: "sc1", messageId: "sm1", text: "shared" });
    recordAndCheckMessage({ userId: "su1", channelId: "sc2", messageId: "sm2", text: "shared" });
    recordAndCheckMessage({ userId: "su1", channelId: "sc3", messageId: "sm3", text: "shared" });
    const r = recordAndCheckMessage({ userId: "su1", channelId: "sc4", messageId: "sm4", text: "shared" });
    assert.equal(r.isPhishing, true);
    resetDefaultTracker();
});

test("resetDefaultTracker clears singleton state", () => {
    recordAndCheckMessage({ userId: "sx", channelId: "sc", messageId: "sm", text: "x" });
    resetDefaultTracker();
    const r = recordAndCheckMessage({ userId: "sx", channelId: "sc", messageId: "sm", text: "x" });
    assert.equal(r.distinctChannels, 1);
});

// ---------- phishingWarningMessage ----------

test("phishingWarningMessage: includes userId", () => {
    const result = {
        distinctChannels: 4,
        relatedMessages: [
            { channelId: "c1", messageId: "m1", ts: 1 },
            { channelId: "c2", messageId: "m2", ts: 2 },
            { channelId: "c3", messageId: "m3", ts: 3 },
            { channelId: "c4", messageId: "m4", ts: 4 },
        ],
        windowMs: 2000,
    };
    const msg = phishingWarningMessage(result, "u_abc");
    assert.match(msg, /u_abc/);
    assert.match(msg, /4 channel/);
    assert.match(msg, /Anti-Phishing/);
});

test("phishingWarningMessage: deduplicates channel mentions", () => {
    const result = {
        distinctChannels: 2,
        relatedMessages: [
            { channelId: "c1", messageId: "m1", ts: 1 },
            { channelId: "c1", messageId: "m2", ts: 2 },
            { channelId: "c2", messageId: "m3", ts: 3 },
        ],
        windowMs: 2000,
    };
    const msg = phishingWarningMessage(result, "u");
    // Channel c1 should appear only once in the listing
    const matches = msg.match(/<#c1>/g) ?? [];
    assert.equal(matches.length, 1);
});
