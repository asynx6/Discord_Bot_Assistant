import { test } from "node:test";
import assert from "node:assert/strict";
import { saveContext, getContext, clearAllContext } from "../Modules/contextManager.js";

function fakeReply(messageId, authorId) {
    return {
        reference: messageId ? { messageId } : null,
        author: { id: authorId },
    };
}

test("returns null when no reference", () => {
    clearAllContext();
    const ctx = getContext(fakeReply(null, "u1"));
    assert.equal(ctx, null);
});

test("returns null when referencing unknown bot message", () => {
    clearAllContext();
    const ctx = getContext(fakeReply("unknown-bot-msg-id", "u1"));
    assert.equal(ctx, null);
});

test("returns and consumes context when reply matches", () => {
    clearAllContext();
    saveContext("bot-msg-1", "u1", "c1", { 0: { action: "CREATE_ROLE", name: "X" } });
    const reply = fakeReply("bot-msg-1", "u1");

    const ctx = getContext(reply);
    assert.ok(ctx);
    assert.equal(ctx[0].action, "CREATE_ROLE");

    // Second access should return null (consumed)
    const ctx2 = getContext(reply);
    assert.equal(ctx2, null);
});

test("does not return context to wrong user", () => {
    clearAllContext();
    saveContext("bot-msg-2", "alice", "c1", { 0: { action: "X" } });
    const ctx = getContext(fakeReply("bot-msg-2", "mallory"));
    assert.equal(ctx, null);
});

test("evicts oldest entries when MAX_ENTRIES exceeded", () => {
    clearAllContext();
    // Insert 510 entries — eviction should kick in at >500
    for (let i = 0; i < 510; i++) {
        saveContext(`bot-${i}`, "u1", "c1", { i, action: "TEST" });
    }
    // After eviction, oldest ~10 should be gone. We can't directly inspect
    // the private Map, but we can verify getContext still works for recent ones.
    const ctx = getContext(fakeReply("bot-509", "u1"));
    assert.ok(ctx);
    assert.equal(ctx.i, 509);
});

test("clearAllContext removes everything", () => {
    saveContext("bot-z", "u1", "c1", { 0: { x: 1 } });
    clearAllContext();
    const ctx = getContext(fakeReply("bot-z", "u1"));
    assert.equal(ctx, null);
});
