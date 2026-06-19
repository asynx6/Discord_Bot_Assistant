import { logger } from "./logger.js";

/**
 * Vision Support — Provider-Driven Detection
 * -------------------------------------------
 * The bot does NOT pre-check whether a model supports image input via a
 * hardcoded allow/deny list. Instead, it sends the request with images to the
 * provider (9Router / OpenRouter) and listens for the provider's verdict:
 *
 *   - 200 OK    → model processed the image, return result.
 *   - 400/422   → model rejected the image. We inspect the error message for
 *                 vision-related keywords ("image", "vision", "multimodal",
 *                 "does not support"). If matched, we transparently retry the
 *                 same user request as a text-only chat and prepend a friendly
 *                 Indonesian notice.
 *   - Other     → bubble up as a generic AI error.
 *
 * Why this approach:
 *   - Zero maintenance: no need to keep a list of which model supports what.
 *   - New model?  Just flip ACTIVE_MODEL and it just works.
 *   - Provider is the single source of truth for capability.
 */

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
 * Build a user-facing fallback notice when the active model does not support
 * vision. The Indonesian message explains that the model can't see the image
 * and the request will continue as text-only.
 *
 * @param {string} modelName
 * @returns {string}
 */
export function visionUnsupportedMessage(modelName) {
    const displayName = String(modelName || "unknown").replace(/^.*\//, "");
    return (
        `⚠️ Model AI saya saat ini (**${displayName}**) **tidak mendukung** fitur Vision/Image, ` +
        `jadi gw nggak bisa liat gambar yang lu kirim.\n\n` +
        `Tapi tenang, request teks lu bakal gw proses normal kok. ` +
        `Kalo mau fitur vision aktif, ganti \`ACTIVE_MODEL\` di \`.env\` ke model yang support image ` +
        `(contoh: \`openai/gpt-4o-mini\`, \`google/gemini-2.0-flash-exp\`, \`anthropic/claude-3-haiku\`).`
    );
}

// Tokens in error messages that strongly indicate the provider rejected the
// request because of an unsupported image/vision input. Matched case-insensitively.
// We are deliberately conservative — only flag a 4xx-class error as a vision
// rejection when at least one of these tokens appears in the body. This avoids
// false positives (e.g. a generic "Bad Request" with no mention of images).
const VISION_ERROR_TOKENS = [
    "image",
    "vision",
    "multimodal",
    "visual input",
    "image input",
    "image_url",
    "does not support image",
    "doesn't support image",
    "not support image",
    "no image support",
    "unsupported media",
];

/**
 * Inspect a thrown error from the LLM client and decide whether it means the
 * active model does not support image input.
 *
 * Heuristic — must satisfy ALL of:
 *   1. Status code is 400 (Bad Request) or 422 (Unprocessable Entity) — these
 *      are the codes providers use to reject unsupported content shapes.
 *   2. Error message body contains at least one of VISION_ERROR_TOKENS.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isVisionUnsupportedError(err) {
    if (!err) return false;

    const status = err?.status ?? err?.response?.status ?? err?.response?.statusCode;
    if (status !== 400 && status !== 422) return false;

    const body = String(
        err?.error?.message ??
        err?.response?.data?.error?.message ??
        err?.message ??
        ""
    ).toLowerCase();

    if (!body) return false;

    return VISION_ERROR_TOKENS.some((tok) => body.includes(tok));
}

export const _internal = {
    ALLOWED_IMAGE_TYPES,
    VISION_ERROR_TOKENS,
};
