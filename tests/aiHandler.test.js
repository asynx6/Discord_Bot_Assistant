import { test } from "node:test";
import assert from "node:assert/strict";
import { _internal, buildUserContent } from "../Modules/aiHandler.js";

const { extractActions, isRetryable, classifyAiError } = _internal;

// ---------- classifyAiError ----------

test("classifyAiError: 401 returns clear Indonesian message with provider URL", () => {
    const msg = classifyAiError({ status: 401, error: { message: "User not found." } }, 3);
    assert.match(msg, /🔑/);
    assert.match(msg, /API key ditolak/);
    assert.match(msg, /openrouter\.ai\/keys/);
    assert.match(msg, /User not found\./);
});

test("classifyAiError: 403 same clear treatment as 401", () => {
    const msg = classifyAiError({ status: 403, error: { message: "Forbidden" } }, 3);
    assert.match(msg, /🔑/);
    assert.match(msg, /Forbidden/);
});

test("classifyAiError: 402 says credit habis with provider base URL", () => {
    const msg = classifyAiError({ status: 402, error: { message: "Insufficient credits" } }, 3);
    assert.match(msg, /💰/);
    assert.match(msg, /Credit/);
    assert.match(msg, /Insufficient credits/);
});

test("classifyAiError: 500 falls back to generic gagal-kontak format", () => {
    const msg = classifyAiError({ status: 500, message: "Internal error" }, 3);
    assert.match(msg, /Gagal kontak otak AI/);
    assert.match(msg, /3 percobaan/);
    assert.match(msg, /Internal error/);
});

test("classifyAiError: extracts message from response.data.error.message", () => {
    const msg = classifyAiError(
        { status: 401, response: { data: { error: { message: "Invalid API key" } } } },
        3
    );
    assert.match(msg, /🔑/);
    assert.match(msg, /Invalid API key/);
});

test("classifyAiError: handles unknown shape gracefully", () => {
    const msg = classifyAiError({}, 3);
    assert.match(msg, /Gagal kontak otak AI/);
});

// ---------- extractActions ----------

test("extracts bare array", () => {
    const out = extractActions([{ action: "X" }, { action: "Y" }]);
    assert.equal(out.length, 2);
    assert.equal(out[0].action, "X");
});

test("extracts {actions: [...]} shape", () => {
    const out = extractActions({ actions: [{ action: "A" }] });
    assert.equal(out.length, 1);
    assert.equal(out[0].action, "A");
});

test("extracts single {action: ...} object", () => {
    const out = extractActions({ action: "CREATE_ROLE" });
    assert.equal(out.length, 1);
    assert.equal(out[0].action, "CREATE_ROLE");
});

test("extracts numerically-keyed object in sorted order", () => {
    const out = extractActions({ "2": { action: "C" }, "0": { action: "A" }, "1": { action: "B" } });
    assert.equal(out.length, 3);
    assert.equal(out[0].action, "A");
    assert.equal(out[1].action, "B");
    assert.equal(out[2].action, "C");
});

test("returns empty for empty object", () => {
    const out = extractActions({});
    assert.equal(out.length, 0);
});

test("returns empty for null/undefined", () => {
    assert.equal(extractActions(null).length, 0);
    assert.equal(extractActions(undefined).length, 0);
});

test("ignores non-numeric keys when extracting numerically", () => {
    const out = extractActions({ "0": { action: "X" }, note: "ignore me" });
    assert.equal(out.length, 1);
    assert.equal(out[0].action, "X");
});

test("returns empty for strings/numbers/booleans", () => {
    assert.equal(extractActions("hello").length, 0);
    assert.equal(extractActions(42).length, 0);
    assert.equal(extractActions(true).length, 0);
});

// ---------- isRetryable ----------

test("isRetryable: 429 is retryable", () => {
    assert.equal(isRetryable({ status: 429 }), true);
    assert.equal(isRetryable({ response: { status: 429 } }), true);
});

test("isRetryable: 503 is retryable", () => {
    assert.equal(isRetryable({ status: 503 }), true);
});

test("isRetryable: 400 is NOT retryable", () => {
    assert.equal(isRetryable({ status: 400 }), false);
});

test("isRetryable: 401/403 are NOT retryable (auth errors won't fix themselves)", () => {
    assert.equal(isRetryable({ status: 401 }), false);
    assert.equal(isRetryable({ status: 403 }), false);
});

test("isRetryable: ETIMEDOUT is retryable", () => {
    assert.equal(isRetryable({ code: "ETIMEDOUT" }), true);
});

test("isRetryable: ECONNREFUSED is retryable", () => {
    assert.equal(isRetryable({ code: "ECONNREFUSED" }), true);
});

test("isRetryable: null/undefined returns false", () => {
    assert.equal(isRetryable(null), false);
    assert.equal(isRetryable(undefined), false);
});

test("isRetryable: message containing 'timeout' is retryable", () => {
    assert.equal(isRetryable({ message: "request timeout exceeded" }), true);
});

test("isRetryable: message containing 'rate limit' is retryable", () => {
    assert.equal(isRetryable({ message: "Rate limit exceeded" }), true);
});

test("isRetryable: generic 'something broke' is NOT retryable", () => {
    assert.equal(isRetryable({ message: "something broke" }), false);
});

// ---------- buildUserContent ----------

test("buildUserContent: text-only returns string as-is", () => {
    assert.equal(buildUserContent("hello world", []), "hello world");
    assert.equal(buildUserContent("hello world"), "hello world");
});

test("buildUserContent: text + images returns multimodal content array", () => {
    const out = buildUserContent("describe this", ["https://x/a.png"]);
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { type: "text", text: "describe this" });
    assert.deepEqual(out[1], { type: "image_url", image_url: { url: "https://x/a.png" } });
});

test("buildUserContent: handles multiple images", () => {
    const urls = ["https://x/a.png", "https://x/b.jpg", "https://x/c.webp"];
    const out = buildUserContent("compare these", urls);
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 4); // 1 text + 3 images
    assert.equal(out[0].type, "text");
    for (let i = 1; i < 4; i++) {
        assert.equal(out[i].type, "image_url");
        assert.equal(out[i].image_url.url, urls[i - 1]);
    }
});

test("buildUserContent: empty text + images → images only", () => {
    const out = buildUserContent("", ["https://x/a.png"]);
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "image_url");
});

test("buildUserContent: text + no images → returns string", () => {
    assert.equal(buildUserContent("hello", null), "hello");
    assert.equal(buildUserContent("hello", undefined), "hello");
});

test("buildUserContent: filters invalid (non-string) image URLs", () => {
    const out = buildUserContent("hi", ["https://x/a.png", null, undefined, "", 42, "https://x/b.jpg"]);
    assert.ok(Array.isArray(out));
    // Only 2 valid URLs survive
    assert.equal(out.length, 3); // 1 text + 2 images
    assert.equal(out[1].image_url.url, "https://x/a.png");
    assert.equal(out[2].image_url.url, "https://x/b.jpg");
});

test("buildUserContent: handles null/undefined userInput gracefully", () => {
    assert.equal(buildUserContent(null, []), "");
    assert.equal(buildUserContent(undefined, []), "");
});

test("buildUserContent: text-only when imageUrls is empty array", () => {
    assert.equal(buildUserContent("just text", []), "just text");
});

// ---------- Empty content retry behavior (Nemotron free-tier fix) ----------

test("isRetryable: 'AI returned empty content' message IS retryable", () => {
    assert.equal(isRetryable({ message: "AI returned empty content" }), true);
});

test("isRetryable: 'empty content' in any casing IS retryable", () => {
    assert.equal(isRetryable({ message: "Provider returned Empty Content due to rate limit" }), true);
});

test("isRetryable: 'temporarily' is retryable", () => {
    assert.equal(isRetryable({ message: "Service temporarily unavailable" }), true);
});
