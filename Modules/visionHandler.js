import { logger } from "./logger.js";

/**
 * Vision Capability Registry
 * --------------------------
 * Centralizes which LLM models on OpenRouter support image/vision input.
 * Used by the message handler to short-circuit image requests before they
 * hit the API with a model that would either reject them or hallucinate.
 *
 * Pattern-based: easy to extend without code changes elsewhere.
 */

const VISION_PATTERNS = [
    /^gemini-/i,
    /^gemini\.ai/i,
    /^google\/gemini/i,
    /^gpt-4o/i,
    /^gpt-4-turbo/i,
    /^gpt-4-vision/i,
    /^openai\/gpt-4o/i,
    /^claude-3/i,
    /^claude-3\.5/i,
    /^anthropic\/claude-3/i,
    /^minimax\//i,
    /^minimax-/i,
    /^llama-3\.2-vision/i,
    /^llava/i,
    /vision/i,
    /multimodal/i,
];

const NON_VISION_PATTERNS = [
    /^deepseek/i,
    /^kimi/i,
    /^text-/i,
    /^gpt-3\.5/i,
    /^gpt-3/i,
    /^babbage/i,
    /^davinci/i,
    /^ada/i,
    /^curie/i,
    /^embedding/i,
];

/**
 * Check whether a model identifier supports vision/image input.
 *
 * @param {string} modelName - The model identifier (e.g. "openai/gpt-4o-mini").
 * @returns {boolean} True if model is known to accept images.
 */
export function supportsVision(modelName) {
    if (!modelName || typeof modelName !== "string") return false;
    if (NON_VISION_PATTERNS.some((p) => p.test(modelName))) return false;
    return VISION_PATTERNS.some((p) => p.test(modelName));
}

/**
 * Return the model name as-is if it supports vision, otherwise return the
 * preferred fallback (defaulting to a known vision-capable model).
 *
 * @param {string} currentModel
 * @param {string} [fallback] - Override fallback model.
 * @returns {{ model: string, switched: boolean }}
 */
export function resolveVisionModel(currentModel, fallback = "google/gemini-2.0-flash-exp") {
    if (supportsVision(currentModel)) {
        return { model: currentModel, switched: false };
    }
    logger.warn("vision.model_unsupported", { currentModel, fallback });
    return { model: fallback, switched: true };
}

// Allowed Discord image content types
const ALLOWED_IMAGE_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
]);

/**
 * Extract image URLs from a Discord message.
 * Two detection paths:
 *   1. Attachments uploaded with the message (user attaches image + tags bot)
 *   2. Reference to a previous message that contained an image (user replies to image)
 *
 * @param {import("discord.js").Message} message
 * @returns {Promise<string[]>} Array of HTTPS image URLs.
 */
export async function extractImageFromMessage(message) {
    const urls = [];

    // Path 1: direct attachments on this message
    if (message.attachments && message.attachments.size > 0) {
        for (const att of message.attachments.values()) {
            if (att.contentType && ALLOWED_IMAGE_TYPES.has(att.contentType.toLowerCase())) {
                if (att.url) urls.push(att.url);
            }
        }
    }

    // Path 2: message is a reply — check the referenced message for images
    if (urls.length === 0 && message.reference && message.reference.messageId) {
        try {
            const referenced = await message.fetchReference();
            if (referenced && referenced.attachments && referenced.attachments.size > 0) {
                for (const att of referenced.attachments.values()) {
                    if (att.contentType && ALLOWED_IMAGE_TYPES.has(att.contentType.toLowerCase())) {
                        if (att.url) urls.push(att.url);
                    }
                }
            }
            // Also check referenced message for image embeds (e.g. linked images)
            if (urls.length === 0 && referenced && referenced.embeds && referenced.embeds.length > 0) {
                for (const embed of referenced.embeds) {
                    if (embed.image && embed.image.url) urls.push(embed.image.url);
                    if (embed.thumbnail && embed.thumbnail.url) urls.push(embed.thumbnail.url);
                }
            }
        } catch (err) {
            logger.warn("vision.fetch_reference_failed", { error: err?.message });
        }
    }

    return urls;
}

/**
 * Build a user-facing error when the active model does not support vision.
 * Returned message is in Indonesian (matches bot voice).
 *
 * @param {string} modelName
 * @returns {string}
 */
export function visionUnsupportedMessage(modelName) {
    const displayName = String(modelName || "unknown").replace(/^.*\//, "");
    return `Maaf, model AI saya saat ini (**${displayName}**) tidak mendukung fitur Vision/Image. ` +
        `Coba pakai model yang support vision seperti gemini-2.0-flash, gpt-4o-mini, atau claude-3-haiku.`;
}

export const _internal = {
    VISION_PATTERNS,
    NON_VISION_PATTERNS,
    ALLOWED_IMAGE_TYPES,
};
