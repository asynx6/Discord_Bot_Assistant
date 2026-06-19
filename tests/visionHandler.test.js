import { test } from "node:test";
import assert from "node:assert/strict";
import {
    supportsVision,
    resolveVisionModel,
    visionUnsupportedMessage,
    extractImageFromMessage,
} from "../Modules/visionHandler.js";

// ---------- supportsVision ----------

test("supportsVision: true for known vision models", () => {
    assert.equal(supportsVision("openai/gpt-4o-mini"), true);
    assert.equal(supportsVision("gpt-4o"), true);
    assert.equal(supportsVision("gpt-4-turbo"), true);
    assert.equal(supportsVision("gpt-4-vision-preview"), true);
    assert.equal(supportsVision("google/gemini-2.0-flash-exp"), true);
    assert.equal(supportsVision("gemini-1.5-pro"), true);
    assert.equal(supportsVision("anthropic/claude-3-haiku"), true);
    assert.equal(supportsVision("claude-3.5-sonnet"), true);
    assert.equal(supportsVision("minimax/MiniMax-M3"), true);
    assert.equal(supportsVision("llama-3.2-vision"), true);
});

test("supportsVision: false for known non-vision models", () => {
    assert.equal(supportsVision("deepseek-chat"), false);
    assert.equal(supportsVision("deepseek/deepseek-chat"), false);
    assert.equal(supportsVision("kimi-k2"), false);
    assert.equal(supportsVision("moonshot/kimi"), false);
    assert.equal(supportsVision("openai/gpt-3.5-turbo"), false);
    assert.equal(supportsVision("text-embedding-ada-002"), false);
});

test("supportsVision: false for null/empty/undefined", () => {
    assert.equal(supportsVision(null), false);
    assert.equal(supportsVision(undefined), false);
    assert.equal(supportsVision(""), false);
    assert.equal(supportsVision(42), false);
});

// ---------- resolveVisionModel ----------

test("resolveVisionModel: returns current model when vision-capable", () => {
    const r = resolveVisionModel("gpt-4o-mini");
    assert.equal(r.model, "gpt-4o-mini");
    assert.equal(r.switched, false);
});

test("resolveVisionModel: switches to fallback for non-vision model", () => {
    const r = resolveVisionModel("deepseek-chat");
    assert.equal(r.switched, true);
    assert.match(r.model, /gemini|gpt-4o|claude-3/i);
});

test("resolveVisionModel: honors custom fallback", () => {
    const r = resolveVisionModel("kimi", "gpt-4o");
    assert.equal(r.model, "gpt-4o");
    assert.equal(r.switched, true);
});

// ---------- visionUnsupportedMessage ----------

test("visionUnsupportedMessage: includes model name", () => {
    const msg = visionUnsupportedMessage("deepseek-chat");
    assert.match(msg, /deepseek-chat/);
    assert.match(msg, /Vision|Image/i);
});

test("visionUnsupportedMessage: strips path prefix", () => {
    const msg = visionUnsupportedMessage("openai/gpt-3.5-turbo");
    assert.match(msg, /gpt-3\.5-turbo/);
    assert.doesNotMatch(msg, /openai\//);
});

test("visionUnsupportedMessage: handles null/undefined", () => {
    const msg = visionUnsupportedMessage(null);
    assert.match(msg, /unknown/);
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
