import { test } from "node:test";
import assert from "node:assert/strict";
import {
    detectTokenRequirements,
    buildSolicitMessage,
    parseTokenReply,
    classifyToken,
} from "../Modules/tokenSolicitor.js";

// ---------- detectTokenRequirements ----------

test("detectTokenRequirements: empty input returns []", () => {
    assert.deepEqual(detectTokenRequirements(""), []);
    assert.deepEqual(detectTokenRequirements(null), []);
});

test("detectTokenRequirements: detects GIPHY", () => {
    const r = detectTokenRequirements("const url = `https://api.giphy.com/v1/gifs/search`;");
    assert.ok(r.some((x) => x.envVar === "GIPHY_API_KEY"));
});

test("detectTokenRequirements: detects OpenWeather", () => {
    const r = detectTokenRequirements("fetch('https://api.openweathermap.org/data/2.5/weather')");
    assert.ok(r.some((x) => x.envVar === "OPENWEATHER_API_KEY"));
});

test("detectTokenRequirements: detects YouTube", () => {
    const r = detectTokenRequirements("youtube.googleapis.com/youtube/v3");
    assert.ok(r.some((x) => x.envVar === "YOUTUBE_API_KEY"));
});

test("detectTokenRequirements: detects Google Maps", () => {
    const r = detectTokenRequirements("maps.googleapis.com/maps/api");
    assert.ok(r.some((x) => x.envVar === "GOOGLE_MAPS_API_KEY"));
});

test("detectTokenRequirements: multiple APIs detected", () => {
    const code = `
        const giphy = await fetch("https://api.giphy.com");
        const yt = await fetch("https://youtube.googleapis.com");
    `;
    const r = detectTokenRequirements(code);
    const envs = r.map((x) => x.envVar);
    assert.ok(envs.includes("GIPHY_API_KEY"));
    assert.ok(envs.includes("YOUTUBE_API_KEY"));
});

test("detectTokenRequirements: dedupes by envVar", () => {
    const r = detectTokenRequirements("openweathermap WEATHER_API");
    const owmCount = r.filter((x) => x.envVar === "OPENWEATHER_API_KEY").length;
    assert.equal(owmCount, 1);
});

test("detectTokenRequirements: returns critical flag", () => {
    const r = detectTokenRequirements("openweathermap");
    const owm = r.find((x) => x.envVar === "OPENWEATHER_API_KEY");
    assert.equal(owm.critical, true);
});

test("detectTokenRequirements: benign code returns []", () => {
    const code = `export default async function (msg, params) { return message.channel.send("hello"); }`;
    assert.deepEqual(detectTokenRequirements(code), []);
});

// ---------- buildSolicitMessage ----------

test("buildSolicitMessage: empty requirements returns empty string", () => {
    assert.equal(buildSolicitMessage([]), "");
});

test("buildSolicitMessage: includes feature name", () => {
    const msg = buildSolicitMessage([{ envVar: "GIPHY_API_KEY", reason: "Giphy", critical: false }], {
        featureName: "gif_search",
    });
    assert.match(msg, /gif_search/);
});

test("buildSolicitMessage: lists each required token", () => {
    const reqs = [
        { envVar: "GIPHY_API_KEY", reason: "Giphy", critical: false },
        { envVar: "OPENWEATHER_API_KEY", reason: "Weather", critical: true },
    ];
    const msg = buildSolicitMessage(reqs);
    assert.match(msg, /GIPHY_API_KEY/);
    assert.match(msg, /OPENWEATHER_API_KEY/);
});

test("buildSolicitMessage: marks critical vs optional", () => {
    const reqs = [
        { envVar: "GIPHY_API_KEY", reason: "Giphy", critical: false },
        { envVar: "STRIPE_SECRET_KEY", reason: "Stripe", critical: true },
    ];
    const msg = buildSolicitMessage(reqs);
    assert.match(msg, /opsional|optional/i);
    assert.match(msg, /wajib|critical/i);
});

test("buildSolicitMessage: skips already-existing env vars from the listing", () => {
    const reqs = [
        { envVar: "GIPHY_API_KEY", reason: "Giphy", critical: false },
        { envVar: "STRIPE_SECRET_KEY", reason: "Stripe", critical: true },
    ];
    const msg = buildSolicitMessage(reqs, { existingEnvVars: ["GIPHY_API_KEY"] });
    // The listing section (between "Token yang dibutuhkan:" and "Cara kasih:") should not mention GIPHY_API_KEY
    const listing = msg.split("Token yang dibutuhkan:")[1]?.split("Cara kasih:")[0] ?? "";
    assert.doesNotMatch(listing, /GIPHY_API_KEY/);
    assert.match(listing, /STRIPE_SECRET_KEY/);
});

test("buildSolicitMessage: all present returns ok message", () => {
    const reqs = [
        { envVar: "GIPHY_API_KEY", reason: "Giphy", critical: false },
    ];
    const msg = buildSolicitMessage(reqs, { existingEnvVars: ["GIPHY_API_KEY"] });
    assert.match(msg, /sudah ada|sudah|configured/i);
});

// ---------- parseTokenReply ----------

test("parseTokenReply: kasih token prefix", () => {
    const r = parseTokenReply("kasih token GIPHY_API_KEY=abc123");
    assert.deepEqual(r, { envVar: "GIPHY_API_KEY", value: "abc123" });
});

test("parseTokenReply: token prefix", () => {
    const r = parseTokenReply("token FOO=bar");
    assert.deepEqual(r, { envVar: "FOO", value: "bar" });
});

test("parseTokenReply: no prefix", () => {
    const r = parseTokenReply("FOO=bar");
    assert.deepEqual(r, { envVar: "FOO", value: "bar" });
});

test("parseTokenReply: spaces around =", () => {
    const r = parseTokenReply("FOO = bar");
    assert.deepEqual(r, { envVar: "FOO", value: "bar" });
});

test("parseTokenReply: strips surrounding quotes", () => {
    const r = parseTokenReply('FOO="bar baz"');
    assert.equal(r.value, "bar baz");
});

test("parseTokenReply: returns null on no =", () => {
    assert.equal(parseTokenReply("just a message"), null);
    assert.equal(parseTokenReply(""), null);
    assert.equal(parseTokenReply(null), null);
});

test("parseTokenReply: lowercases key but normalizes to upper", () => {
    const r = parseTokenReply("foo=bar");
    assert.equal(r.envVar, "FOO");
});

test("parseTokenReply: long value preserved", () => {
    const longValue = "sk-or-v1-".padEnd(60, "x");
    const r = parseTokenReply(`KEY=${longValue}`);
    assert.equal(r.value, longValue);
});

// ---------- classifyToken ----------

test("classifyToken: known critical token", () => {
    const c = classifyToken("OPENWEATHER_API_KEY");
    assert.equal(c.critical, true);
    assert.match(c.reason, /weather/i);
});

test("classifyToken: known optional token", () => {
    const c = classifyToken("GIPHY_API_KEY");
    assert.equal(c.critical, false);
});

test("classifyToken: unknown returns null", () => {
    assert.equal(classifyToken("RANDOM_UNKNOWN_TOKEN"), null);
    assert.equal(classifyToken(""), null);
    assert.equal(classifyToken(null), null);
});
