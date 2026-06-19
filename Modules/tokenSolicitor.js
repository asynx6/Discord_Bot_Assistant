/**
 * Token Solicitor
 * ----------------
 * When the bot generates dynamic code that needs an external API key, the
 * generation flow is PAUSED and the user is asked to provide the token.
 *
 * The solicitor has two responsibilities:
 *   1. SCAN  — given the generated code (or a description of what it does),
 *      extract a list of `requiredTokens` like ["GIPHY_API_KEY", "WEATHER_TOKEN"].
 *   2. SOLICIT — produce a user-facing message that asks the owner to share
 *      each missing token via a secure channel.
 *
 * This module is pure — it does not touch Discord or the network. The
 * caller (index.js) is responsible for posting the message, collecting
 * the reply, and writing the value via envWriter.writeEnvVar().
 */

/**
 * Heuristic token names we know how to detect in code.
 * Each entry: { pattern, envVar, reason, critical }
 * - pattern : regex applied to the code (case-insensitive)
 * - envVar  : the .env variable name to write to
 * - reason  : human-readable description for the solicit message
 * - critical: if true, generation is blocked until the token is provided
 */
const KNOWN_TOKEN_PATTERNS = [
    { pattern: /GIPHY/i, envVar: "GIPHY_API_KEY", reason: "Giphy GIF search", critical: false },
    { pattern: /OPENWEATHER/i, envVar: "OPENWEATHER_API_KEY", reason: "OpenWeatherMap", critical: true },
    { pattern: /WEATHER_API/i, envVar: "OPENWEATHER_API_KEY", reason: "OpenWeatherMap", critical: true },
    { pattern: /YOUTUBE/i, envVar: "YOUTUBE_API_KEY", reason: "YouTube Data API", critical: true },
    { pattern: /TWITTER/i, envVar: "TWITTER_BEARER_TOKEN", reason: "Twitter API", critical: true },
    { pattern: /REDDIT/i, envVar: "REDDIT_CLIENT_ID", reason: "Reddit API", critical: false },
    { pattern: /SPOTIFY/i, envVar: "SPOTIFY_CLIENT_ID", reason: "Spotify API", critical: false },
    { pattern: /STEAM/i, envVar: "STEAM_API_KEY", reason: "Steam Web API", critical: false },
    { pattern: /GOOGLE.*MAP/i, envVar: "GOOGLE_MAPS_API_KEY", reason: "Google Maps", critical: true },
    { pattern: /GMAIL|GOOGLE_MAIL/i, envVar: "GMAIL_APP_PASSWORD", reason: "Gmail sending", critical: true },
    { pattern: /NEWS_API|NEWSAPI/i, envVar: "NEWS_API_KEY", reason: "NewsAPI", critical: false },
    { pattern: /STRIPE/i, envVar: "STRIPE_SECRET_KEY", reason: "Stripe payments", critical: true },
    { pattern: /PAYPAL/i, envVar: "PAYPAL_CLIENT_ID", reason: "PayPal", critical: true },
];

/**
 * Scan generated code for references to known external APIs and return
 * the list of env variables that should be present.
 *
 * @param {string} code
 * @returns {Array<{envVar: string, reason: string, critical: boolean}>}
 */
export function detectTokenRequirements(code) {
    if (!code || typeof code !== "string") return [];
    const seen = new Set();
    const out = [];
    for (const t of KNOWN_TOKEN_PATTERNS) {
        if (t.pattern.test(code) && !seen.has(t.envVar)) {
            seen.add(t.envVar);
            out.push({ envVar: t.envVar, reason: t.reason, critical: t.critical });
        }
    }
    return out;
}

/**
 * Build a user-facing solicitation message. If the user has any tokens
 * already present in process.env, mention them as "already configured"
 * so the user does not re-share them.
 *
 * @param {Array<{envVar: string, reason: string, critical: boolean}>} requirements
 * @param {object} [options]
 * @param {string} [options.featureName] - name of the feature being built
 * @param {string[]} [options.existingEnvVars] - env vars already set in process.env
 * @returns {string}
 */
export function buildSolicitMessage(requirements, options = {}) {
    if (!Array.isArray(requirements) || requirements.length === 0) return "";
    const feature = options.featureName || "fitur ini";
    const existing = new Set(options.existingEnvVars ?? []);

    const missing = requirements.filter((r) => !existing.has(r.envVar));
    if (missing.length === 0) {
        return `✅ Semua token yang dibutuhkan untuk **${feature}** sudah ada di \`.env\`. Lanjut generate kode...`;
    }

    const lines = [
        `🔐 **Saya butuh token untuk ${feature}**`,
        ``,
        `Saya mendeteksi kode yang bakal gw generate butuh API key eksternal nih. ` +
        `Demi keamanan, gw nggak bisa lanjutin sebelum lo kasih token-nya.`,
        ``,
        `**Token yang dibutuhkan:**`,
        ...missing.map((m, i) => {
            const criticalTag = m.critical ? " ⚠️ _wajib_" : " _opsional_";
            return `  ${i + 1}. \`${m.envVar}\` — ${m.reason}${criticalTag}`;
        }),
        ``,
        `**Cara kasih:**`,
        `  • Ketik: \`kasih token <NAMA>=<nilai>\` (contoh: \`kasih token GIPHY_API_KEY=abc123\`) `,
        `  • Atau reply per token: \`token ${missing[0].envVar}=<nilai>\``,
        ``,
        `🔒 Token lo bakal gw tulis langsung ke \`.env\` lokal dengan aman, gak akan muncul di log atau response AI.`,
    ];
    return lines.join("\n");
}

/**
 * Parse a user reply for a token assignment.
 * Accepts:
 *   "kasih token GIPHY_API_KEY=abc123"
 *   "token GIPHY_API_KEY=abc123"
 *   "GIPHY_API_KEY=abc123"
 *   "GIPHY_API_KEY = abc123"
 *
 * @param {string} reply
 * @returns {{envVar: string, value: string} | null}
 */
export function parseTokenReply(reply) {
    if (!reply || typeof reply !== "string") return null;
    const m = reply.match(/^(?:(?:kasih|isi|set)\s+token|token)?\s*([A-Z][A-Z0-9_]*)\s*=\s*(.+)$/i);
    if (!m) return null;
    const envVar = m[1].toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(envVar)) return null;
    let value = m[2].trim();
    // Strip surrounding quotes if user pasted them
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
    }
    return { envVar, value };
}

/**
 * Classify a token as critical or optional. Returns null if not in the
 * known list.
 */
export function classifyToken(envVar) {
    if (!envVar) return null;
    const match = KNOWN_TOKEN_PATTERNS.find((t) => t.envVar === envVar);
    if (!match) return null;
    return { envVar, reason: match.reason, critical: match.critical };
}

export const _internal = { KNOWN_TOKEN_PATTERNS };
