import mongoose from "mongoose";
import { logger } from "./logger.js";

/**
 * Multi-turn conversation context manager.
 *
 * Two-tier storage:
 * - In-memory Map (primary, fast)
 * - MongoDB collection (optional, survives restart)
 *
 * Each entry is keyed by the bot's reply message ID. When the user replies
 * to that bot message, the pending instruction is consumed and re-injected
 * into execution. This enables the AI to ask "kasih nama file?" and the
 * next user reply fills in the missing field.
 *
 * Hard cap on map size prevents unbounded memory growth from spam.
 */

const inMemory = new Map();
const timers = new Map();

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;

let ContextModel = null;

function getContextModel() {
    if (ContextModel !== null) return ContextModel;

    if (mongoose.connection.readyState !== 1) return null;

    try {
        const schema = new mongoose.Schema({
            botMessageId: { type: String, unique: true, index: true },
            userId: String,
            channelId: String,
            instruction: mongoose.Schema.Types.Mixed,
            createdAt: { type: Date, default: Date.now, expires: 300 },
        });
        ContextModel = mongoose.model("PendingContext", schema);
        return ContextModel;
    } catch (err) {
        logger.warn("context.model.init_failed", { error: err.message });
        return null;
    }
}

function evictIfNeeded() {
    if (inMemory.size <= MAX_ENTRIES) return;

    const overflow = inMemory.size - MAX_ENTRIES;
    const oldestFirst = [...inMemory.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, overflow);

    for (const [key, value] of oldestFirst) {
        inMemory.delete(key);
        const t = timers.get(key);
        if (t) {
            clearTimeout(t);
            timers.delete(key);
        }
        logger.debug("context.evicted", { botMessageId: key });
    }
}

function armCleanup(botMessageId) {
    if (timers.has(botMessageId)) {
        clearTimeout(timers.get(botMessageId));
    }

    const timer = setTimeout(async () => {
        inMemory.delete(botMessageId);
        timers.delete(botMessageId);

        const Model = getContextModel();
        if (Model) {
            try {
                await Model.deleteOne({ botMessageId });
            } catch (err) {
                logger.warn("context.db.cleanup_failed", { error: err.message });
            }
        }
    }, TTL_MS);

    if (typeof timer.unref === "function") timer.unref();
    timers.set(botMessageId, timer);
}

export function saveContext(botMessageId, userId, channelId, previousInstruction) {
    inMemory.set(botMessageId, {
        userId,
        channelId,
        instruction: previousInstruction,
        timestamp: Date.now(),
    });

    armCleanup(botMessageId);
    evictIfNeeded();

    const Model = getContextModel();
    if (Model) {
        Model.updateOne(
            { botMessageId },
            {
                $set: {
                    botMessageId,
                    userId,
                    channelId,
                    instruction: previousInstruction,
                    createdAt: new Date(),
                },
            },
            { upsert: true }
        ).catch((err) => logger.warn("context.db.save_failed", { error: err.message }));
    }
}

export function getContext(replyMessage) {
    const reference = replyMessage.reference;
    if (!reference) return null;

    const cached = inMemory.get(reference.messageId);
    if (cached && cached.userId === replyMessage.author.id) {
        inMemory.delete(reference.messageId);
        const t = timers.get(reference.messageId);
        if (t) {
            clearTimeout(t);
            timers.delete(reference.messageId);
        }

        const Model = getContextModel();
        if (Model) {
            Model.deleteOne({ botMessageId: reference.messageId }).catch(() => {});
        }

        return cached.instruction;
    }

    return null;
}

export function clearAllContext() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    inMemory.clear();
    logger.info("context.cleared");
}
