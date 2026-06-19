import { test } from "node:test";
import assert from "node:assert/strict";
import {
    isVisionUnsupportedError,
    visionUnsupportedMessage,
    extractImageFromMessage,
} from "../Modules/visionHandler.js";

// ---------- isVisionUnsupportedError ----------
// Provider-driven detection: no hardcoded model allow/deny lists. We just look
// at the error's HTTP status (must be 400 or 422) and search the body for
// image/vision/multimodal keywords.

test("isVisionUnsupportedError: matches 400 with 'image' in message", () => {
    const err = { status: 400, message: "Provider rejected: image input not allowed" };
    assert.equal(isVisionUnsupportedError(err), true);
});

test("isVisionUnsupportedError: matches 422 with 'vision' in message", () => {
    const err = { status: 422, message: "Model does not support vision" };
    assert.equal(isVisionUnsupportedError(err), true);
});

test("isVisionUnsupportedError: matches 'multimodal' in nested error body", () => {
    const err = {
        status: 400,
        error: { message: "Multimodal content not supported by this model" },
    };
    assert.equal(isVisionUnsupportedError(err), true);
});

test("isVisionUnsupportedError: matches via response.data.error.message", () => {
    const err = {
        response: { status: 400, data: { error: { message: "image_url not allowed" } } },
    };
    assert.equal(isVisionUnsupportedError(err), true);
});

test("isVisionUnsupportedError: does not match generic 400 (no vision tokens)", () => {
    const err = { status: 400, message: "Invalid API key" };
    assert.equal(isVisionUnsupportedError(err), false);
});

test("isVisionUnsupportedError: does not match 500 (wrong status code)", () => {
    const err = { status: 500, message: "image processing failed" };
    assert.equal(isVisionUnsupportedError(err), false);
});

test("isVisionUnsupportedError: does not match 429 (rate limit, not vision)", () => {
    const err = { status: 429, message: "Rate limit exceeded" };
    assert.equal(isVisionUnsupportedError(err), false);
});

test("isVisionUnsupportedError: case-insensitive matching", () => {
    const err = { status: 400, message: "IMAGE INPUT not supported" };
    assert.equal(isVisionUnsupportedError(err), true);
});

test("isVisionUnsupportedError: handles null / undefined / non-object", () => {
    assert.equal(isVisionUnsupportedError(null), false);
    assert.equal(isVisionUnsupportedError(undefined), false);
    assert.equal(isVisionUnsupportedError("string"), false);
    assert.equal(isVisionUnsupportedError(42), false);
});

test("isVisionUnsupportedError: handles empty error message", () => {
    const err = { status: 400, message: "" };
    assert.equal(isVisionUnsupportedError(err), false);
});

test("isVisionUnsupportedError: matches 'does not support image' variant", () => {
    const err = { status: 400, message: "Model 'deepseek-chat' does not support image input" };
    assert.equal(isVisionUnsupportedError(err), true);
});

// ---------- visionUnsupportedMessage ----------

test("visionUnsupportedMessage: includes model name", () => {
    const msg = visionUnsupportedMessage("deepseek-chat");
    assert.match(msg, /deepseek-chat/);
    assert.match(msg, /Vision|Image/i);
});

test("visionUnsupportedMessage: strips path prefix from primary model name", () => {
    const msg = visionUnsupportedMessage("openai/gpt-3.5-turbo");
    // Primary model display name should be stripped of "openai/" prefix
    assert.match(msg, /\*\*gpt-3\.5-turbo\*\*/);
    // The model name must not start with "openai/" in the bolded display
    assert.doesNotMatch(msg, /\*\*openai\//);
});

test("visionUnsupportedMessage: handles null/undefined", () => {
    const msg = visionUnsupportedMessage(null);
    assert.match(msg, /unknown/);
});

test("visionUnsupportedMessage: mentions fallback to text-only", () => {
    const msg = visionUnsupportedMessage("kimi");
    // Should reassure user that the text request will still be processed.
    assert.match(msg, /tetap|normal|text|teks|proses/i);
});

// ---------- extractImageFromMessage ----------

function fakeAttachment(url, contentType) {
    return { url, contentType };
}

function fakeMessage({ attachments = [], embeds = [], reference = null, fetchReferenceImpl = null } = {}) {
    return {
        attachments,
        embeds,
        reference,
        fetchReference: fetchReferenceImpl || (async () => null),
    };
}

test("extractImageFromMessage: returns empty when no attachments and no reference", async () => {
    const msg = fakeMessage();
    const urls = await extractImageFromMessage(msg);
    assert.deepEqual(urls, []);
});

test("extractImageFromMessage: extracts PNG from attachment", async () => {
    const msg = fakeMessage({
        attachments: new Map([
            ["a", fakeAttachment("https://cdn.discord.com/abc.png", "image/png")],
        ]),
    });
    const urls = await extractImageFromMessage(msg);
    assert.deepEqual(urls, ["https://cdn.discord.com/abc.png"]);
});

test("extractImageFromMessage: filters non-image attachments", async () => {
    const msg = fakeMessage({
        attachments: new Map([
            ["a", fakeAttachment("https://x/y.pdf", "application/pdf")],
            ["b", fakeAttachment("https://x/y.txt", "text/plain")],
        ]),
    });
    const urls = await extractImageFromMessage(msg);
    assert.deepEqual(urls, []);
});

test("extractImageFromMessage: handles multiple images", async () => {
    const msg = fakeMessage({
        attachments: new Map([
            ["a", fakeAttachment("https://x/a.png", "image/png")],
            ["b", fakeAttachment("https://x/b.jpg", "image/jpeg")],
            ["c", fakeAttachment("https://x/c.webp", "image/webp")],
        ]),
    });
    const urls = await extractImageFromMessage(msg);
    assert.equal(urls.length, 3);
});

test("extractImageFromMessage: extracts from reply reference", async () => {
    const referencedMsg = fakeMessage({
        attachments: new Map([
            ["x", fakeAttachment("https://cdn.discord.com/replied.png", "image/png")],
        ]),
    });
    const msg = fakeMessage({
        reference: { messageId: "ref-id-123" },
        fetchReferenceImpl: async () => referencedMsg,
    });
    const urls = await extractImageFromMessage(msg);
    assert.deepEqual(urls, ["https://cdn.discord.com/replied.png"]);
});

test("extractImageFromMessage: falls back to embed image when no attachment in reply", async () => {
    const referencedMsg = fakeMessage({
        embeds: [{ image: { url: "https://cdn.discord.com/embed.png" } }],
    });
    const msg = fakeMessage({
        reference: { messageId: "ref-id-456" },
        fetchReferenceImpl: async () => referencedMsg,
    });
    const urls = await extractImageFromMessage(msg);
    assert.deepEqual(urls, ["https://cdn.discord.com/embed.png"]);
});

test("extractImageFromMessage: prefers current message attachments over reply", async () => {
    const referencedMsg = fakeMessage({
        attachments: new Map([
            ["x", fakeAttachment("https://x/reply.png", "image/png")],
        ]),
    });
    const msg = fakeMessage({
        attachments: new Map([
            ["y", fakeAttachment("https://x/current.png", "image/png")],
        ]),
        reference: { messageId: "ref-id-789" },
        fetchReferenceImpl: async () => referencedMsg,
    });
    const urls = await extractImageFromMessage(msg);
    // Current message attachments take priority — reply is NOT consulted if current has images
    assert.deepEqual(urls, ["https://x/current.png"]);
});

test("extractImageFromMessage: gracefully handles fetchReference failure", async () => {
    const msg = fakeMessage({
        reference: { messageId: "bad-id" },
        fetchReferenceImpl: async () => {
            throw new Error("Unknown Message");
        },
    });
    const urls = await extractImageFromMessage(msg);
    assert.deepEqual(urls, []);
});

test("extractImageFromMessage: accepts JPEG, PNG, WebP, GIF", async () => {
    const msg = fakeMessage({
        attachments: new Map([
            ["a", fakeAttachment("https://x/a.png", "image/png")],
            ["b", fakeAttachment("https://x/b.jpeg", "image/jpeg")],
            ["c", fakeAttachment("https://x/c.gif", "image/gif")],
            ["d", fakeAttachment("https://x/d.webp", "image/webp")],
        ]),
    });
    const urls = await extractImageFromMessage(msg);
    assert.equal(urls.length, 4);
});
