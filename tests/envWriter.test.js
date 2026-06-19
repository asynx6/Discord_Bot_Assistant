import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    quoteEnvValue,
    readEnvSync,
    hasEnvKey,
    getEnvKeyValue,
    writeEnvVar,
    removeEnvVar,
    parseEnvFile,
    maskSecret,
} from "../Modules/envWriter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_PATH = path.join(__dirname, "_tmp_env.txt");

async function clean() {
    await fs.rm(TMP_PATH, { force: true });
    await fs.rm(`${TMP_PATH}.bak`, { force: true });
}

test.afterEach(async () => {
    await clean();
});

// ---------- quoteEnvValue ----------

test("quoteEnvValue: simple value unquoted", () => {
    assert.equal(quoteEnvValue("hello"), "hello");
});

test("quoteEnvValue: empty string returns empty", () => {
    assert.equal(quoteEnvValue(""), "");
    assert.equal(quoteEnvValue(null), "");
    assert.equal(quoteEnvValue(undefined), "");
});

test("quoteEnvValue: values with spaces get quoted", () => {
    assert.equal(quoteEnvValue("hello world"), `"hello world"`);
});

test("quoteEnvValue: values with # get quoted", () => {
    assert.equal(quoteEnvValue("foo#bar"), `"foo#bar"`);
});

test("quoteEnvValue: values with = get quoted", () => {
    assert.equal(quoteEnvValue("a=b"), `"a=b"`);
});

test("quoteEnvValue: values with embedded quotes get escaped", () => {
    assert.equal(quoteEnvValue(`she said "hi"`), `"she said \\"hi\\""`);
});

test("quoteEnvValue: numeric values not quoted", () => {
    assert.equal(quoteEnvValue(42), "42");
});

// ---------- readEnvSync / hasEnvKey / getEnvKeyValue ----------

test("readEnvSync: returns '' when file does not exist", () => {
    assert.equal(readEnvSync(TMP_PATH), "");
});

test("readEnvSync: returns file content when exists", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar\nBAZ=qux\n", "utf8");
    assert.equal(readEnvSync(TMP_PATH), "FOO=bar\nBAZ=qux\n");
});

test("hasEnvKey: true for present key", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar\n", "utf8");
    assert.equal(hasEnvKey("FOO", TMP_PATH), true);
});

test("hasEnvKey: false for missing key", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar\n", "utf8");
    assert.equal(hasEnvKey("NOPE", TMP_PATH), false);
});

test("hasEnvKey: handles empty value", async () => {
    await fs.writeFile(TMP_PATH, "FOO=\n", "utf8");
    assert.equal(hasEnvKey("FOO", TMP_PATH), true);
});

test("getEnvKeyValue: returns value for present key", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar\n", "utf8");
    assert.equal(getEnvKeyValue("FOO", TMP_PATH), "bar");
});

test("getEnvKeyValue: returns null for missing key", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar\n", "utf8");
    assert.equal(getEnvKeyValue("NOPE", TMP_PATH), null);
});

test("getEnvKeyValue: unquotes double-quoted value", async () => {
    await fs.writeFile(TMP_PATH, 'FOO="hello world"\n', "utf8");
    assert.equal(getEnvKeyValue("FOO", TMP_PATH), "hello world");
});

test("getEnvKeyValue: unquotes single-quoted value", async () => {
    await fs.writeFile(TMP_PATH, "FOO='hello world'\n", "utf8");
    assert.equal(getEnvKeyValue("FOO", TMP_PATH), "hello world");
});

test("getEnvKeyValue: strips inline comment", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar # this is comment\n", "utf8");
    assert.equal(getEnvKeyValue("FOO", TMP_PATH), "bar");
});

// ---------- writeEnvVar ----------

test("writeEnvVar: creates new file with key", async () => {
    const r = await writeEnvVar("FOO", "bar", { filePath: TMP_PATH, backup: false });
    assert.equal(r.ok, true);
    assert.equal(r.action, "created");
    const content = await fs.readFile(TMP_PATH, "utf8");
    assert.match(content, /FOO=bar/);
});

test("writeEnvVar: appends to existing file", async () => {
    await fs.writeFile(TMP_PATH, "EXISTING=1\n", "utf8");
    await writeEnvVar("NEW", "2", { filePath: TMP_PATH, backup: false });
    const content = await fs.readFile(TMP_PATH, "utf8");
    assert.match(content, /EXISTING=1/);
    assert.match(content, /NEW=2/);
});

test("writeEnvVar: updates existing key in place", async () => {
    await fs.writeFile(TMP_PATH, "FOO=old\nBAR=keep\n", "utf8");
    const r = await writeEnvVar("FOO", "new", { filePath: TMP_PATH, backup: false });
    assert.equal(r.action, "updated");
    const content = await fs.readFile(TMP_PATH, "utf8");
    assert.match(content, /FOO=new/);
    assert.doesNotMatch(content, /FOO=old/);
    assert.match(content, /BAR=keep/);
});

test("writeEnvVar: reports unchanged when value identical", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar\n", "utf8");
    const r = await writeEnvVar("FOO", "bar", { filePath: TMP_PATH, backup: false });
    assert.equal(r.action, "unchanged");
});

test("writeEnvVar: creates backup by default", async () => {
    await fs.writeFile(TMP_PATH, "FOO=old\n", "utf8");
    await writeEnvVar("FOO", "new", { filePath: TMP_PATH });
    const bak = await fs.readFile(`${TMP_PATH}.bak`, "utf8");
    assert.match(bak, /FOO=old/);
});

test("writeEnvVar: rejects invalid key name", async () => {
    await assert.rejects(() => writeEnvVar("1INVALID", "x", { filePath: TMP_PATH, backup: false }));
    await assert.rejects(() => writeEnvVar("HAS SPACE", "x", { filePath: TMP_PATH, backup: false }));
    await assert.rejects(() => writeEnvVar("", "x", { filePath: TMP_PATH, backup: false }));
});

test("writeEnvVar: quotes value with spaces automatically", async () => {
    await writeEnvVar("GREETING", "hello world", { filePath: TMP_PATH, backup: false });
    const val = getEnvKeyValue("GREETING", TMP_PATH);
    assert.equal(val, "hello world");
});

test("writeEnvVar: appends comment when provided", async () => {
    await writeEnvVar("FOO", "bar", { filePath: TMP_PATH, backup: false, comment: "test comment" });
    const content = await fs.readFile(TMP_PATH, "utf8");
    assert.match(content, /# test comment/);
    assert.match(content, /FOO=bar/);
});

// ---------- removeEnvVar ----------

test("removeEnvVar: removes present key", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar\nBAZ=qux\n", "utf8");
    const r = await removeEnvVar("FOO", { filePath: TMP_PATH });
    assert.equal(r.action, "removed");
    const content = await fs.readFile(TMP_PATH, "utf8");
    assert.doesNotMatch(content, /FOO/);
    assert.match(content, /BAZ=qux/);
});

test("removeEnvVar: returns absent for missing key", async () => {
    await fs.writeFile(TMP_PATH, "FOO=bar\n", "utf8");
    const r = await removeEnvVar("NOPE", { filePath: TMP_PATH });
    assert.equal(r.action, "absent");
});

// ---------- parseEnvFile ----------

test("parseEnvFile: parses all key=value pairs", async () => {
    await fs.writeFile(TMP_PATH, "FOO=1\nBAR=2\n# comment\n\nBAZ=three\n", "utf8");
    const parsed = parseEnvFile(TMP_PATH);
    assert.deepEqual(parsed, { FOO: "1", BAR: "2", BAZ: "three" });
});

test("parseEnvFile: unquotes quoted values", async () => {
    await fs.writeFile(TMP_PATH, 'FOO="hello world"\n', "utf8");
    const parsed = parseEnvFile(TMP_PATH);
    assert.equal(parsed.FOO, "hello world");
});

test("parseEnvFile: empty file returns empty object", () => {
    assert.deepEqual(parseEnvFile(TMP_PATH), {});
});

// ---------- maskSecret ----------

test("maskSecret: long value shows first 6 and last 4", () => {
    const masked = maskSecret("sk-or-v1-abcdefghijklmnop");
    assert.equal(masked, "sk-or-…mnop");
});

test("maskSecret: short value returns ***", () => {
    assert.equal(maskSecret("short"), "***");
    assert.equal(maskSecret(""), "***");
    assert.equal(maskSecret(null), "***");
});
