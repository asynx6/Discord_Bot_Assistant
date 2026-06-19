/**
 * Discord Interactive UI — Buttons & Modals
 * -----------------------------------------
 * Wraps discord.js interactive components (Buttons, Modals) for the bot's
 * confirmation flow. The previous v1.2.0 flow used free-text "Ya/Tidak"
 * replies; v1.4.0 introduces real Buttons with a 60-second strict expiry.
 *
 * Design:
 *   - Pure helpers exposed (buildYesNoRow, buildTokenModal) for unit
 *     testing without instantiating discord.js.
 *   - Discord.js is imported lazily inside the runtime functions so tests
 *     do not need to load the library.
 *   - Every interaction carries a customId that encodes:
 *       { action: "yesno" | "token", id: <unique>, expiresAt: <epoch ms> }
 *     so the runtime can validate the interaction is still within the
 *     60-second window before acting on it.
 */

import crypto from "node:crypto";
import { logger } from "./logger.js";

export const EXPIRY_MS = 60_000;
const YESNO_PREFIX = "ui_yesno:";
const TOKEN_PREFIX = "ui_token:";

/**
 * Generate a short, URL-safe unique id for an interaction.
 */
function shortId() {
    return crypto.randomBytes(6).toString("base64url");
}

/**
 * Build a customId for a yes/no button row, encoding the expiry time so
 * the runtime can reject expired clicks without needing an external store.
 *
 * @param {string} tag - human-friendly tag (e.g. "dynamic:gacor") for logging
 * @returns {{ customId: string, expiresAt: number, tag: string }}
 */
export function newYesNoId(tag = "yn") {
    const expiresAt = Date.now() + EXPIRY_MS;
    const id = shortId();
    return {
        customId: `${YESNO_PREFIX}${id}|${expiresAt}|${encodeURIComponent(tag)}`,
        expiresAt,
        tag,
    };
}

/**
 * Build a customId for a token-input modal.
 * @param {string} envVar
 * @returns {{ customId: string, expiresAt: number, envVar: string }}
 */
export function newTokenId(envVar) {
    const expiresAt = Date.now() + EXPIRY_MS;
    const id = shortId();
    return {
        customId: `${TOKEN_PREFIX}${id}|${expiresAt}|${encodeURIComponent(envVar)}`,
        expiresAt,
        envVar,
    };
}

/**
 * Parse a yes/no customId. Returns null if malformed.
 */
export function parseYesNoId(customId) {
    if (!customId || typeof customId !== "string") return null;
    if (!customId.startsWith(YESNO_PREFIX)) return null;
    const body = customId.slice(YESNO_PREFIX.length);
    const [id, expiresAtStr, tag] = body.split("|");
    const expiresAt = Number(expiresAtStr);
    if (!id || !Number.isFinite(expiresAt)) return null;
    return { id, expiresAt, tag: decodeURIComponent(tag || "yn") };
}

export function parseTokenId(customId) {
    if (!customId || typeof customId !== "string") return null;
    if (!customId.startsWith(TOKEN_PREFIX)) return null;
    const body = customId.slice(TOKEN_PREFIX.length);
    const [id, expiresAtStr, envVar] = body.split("|");
    const expiresAt = Number(expiresAtStr);
    if (!id || !Number.isFinite(expiresAt)) return null;
    return { id, expiresAt, envVar: decodeURIComponent(envVar || "") };
}

/**
 * Check whether an interaction is still within its expiry window.
 * @param {{expiresAt: number}} parsed
 * @param {number} [now]
 * @returns {boolean}
 */
export function isExpired(parsed, now = Date.now()) {
    if (!parsed || !Number.isFinite(parsed.expiresAt)) return true;
    return now >= parsed.expiresAt;
}

/**
 * Format a human-friendly remaining time string, e.g. "42s".
 * @param {number} expiresAt
 * @param {number} [now]
 * @returns {string}
 */
export function formatRemaining(expiresAt, now = Date.now()) {
    const ms = Math.max(0, expiresAt - now);
    return `${Math.ceil(ms / 1000)}s`;
}

/**
 * Build a Discord ActionRow with [Yes] and [No] buttons.
 * Lazy-imports discord.js so unit tests do not require the library.
 *
 * @param {string} tag
 * @returns {Promise<{row: any, yesId: string, noId: string, expiresAt: number}>}
 */
export async function buildYesNoRow(tag = "yn") {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
    const yes = newYesNoId(tag);
    const no = newYesNoId(tag);
    // The two buttons share a prefix but a different sub-id so the runtime
    // can distinguish "Yes" from "No" from the same interaction.
    const yesCustom = yes.customId.replace(YESNO_PREFIX, `${YESNO_PREFIX}yes_`);
    const noCustom = no.customId.replace(YESNO_PREFIX, `${YESNO_PREFIX}no_`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(yesCustom)
            .setLabel("✅ Ya")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(noCustom)
            .setLabel("❌ Tidak")
            .setStyle(ButtonStyle.Danger)
    );

    return {
        row,
        yesCustomId: yesCustom,
        noCustomId: noCustom,
        expiresAt: yes.expiresAt,
    };
}

/**
 * Build a Discord Modal that asks the user to enter a token value.
 * @param {string} envVar
 * @returns {Promise<{modal: any, customId: string, expiresAt: number}>}
 */
export async function buildTokenModal(envVar) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import("discord.js");
    const id = newTokenId(envVar);
    const modal = new ModalBuilder()
        .setCustomId(id.customId)
        .setTitle(`Masukkan token ${envVar}`);

    const input = new TextInputBuilder()
        .setCustomId(`${id.customId}#value`)
        .setLabel(`Nilai untuk ${envVar}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(200)
        .setPlaceholder("paste token di sini, akan langsung ditulis ke .env");

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return { modal, customId: id.customId, expiresAt: id.expiresAt };
}

/**
 * Convenience helper used by the messageCreate handler.
 * Returns the answer ("yes" or "no") if the customId encodes a yes/no
 * click and is not expired; otherwise null.
 */
export function resolveYesNoAnswer(customId, now = Date.now()) {
    if (!customId || typeof customId !== "string") return null;
    if (!customId.startsWith(YESNO_PREFIX)) return null;
    const rest = customId.slice(YESNO_PREFIX.length);
    if (rest.startsWith("yes_")) {
        const parsed = parseYesNoId(YESNO_PREFIX + rest.slice(4));
        if (parsed && !isExpired(parsed, now)) return "yes";
    } else if (rest.startsWith("no_")) {
        const parsed = parseYesNoId(YESNO_PREFIX + rest.slice(3));
        if (parsed && !isExpired(parsed, now)) return "no";
    }
    return null;
}

/**
 * Build a follow-up Discord message that announces the buttons have expired.
 */
export function expiredNoticeMessage(tag = "") {
    return `⏰ Tombol konfirmasi${tag ? ` (${tag})` : ""} sudah **expired** (lewat 60 detik). ` +
        `Ketik ulang request lo kalo masih mau lanjut, atau reply "batal" untuk cancel.`;
}

/**
 * Build a small human-readable note about the yes/no row that gets
 * prepended to the confirmation prompt.
 */
export function yesNoFooter(expiresAt, now = Date.now()) {
    return `\n\n_Tombol ini expire dalam ${formatRemaining(expiresAt, now)}._`;
}

export const _internal = {
    EXPIRY_MS,
    YESNO_PREFIX,
    TOKEN_PREFIX,
    shortId,
};
