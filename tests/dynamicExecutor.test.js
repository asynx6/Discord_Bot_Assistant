import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    sanitizeName,
    validateDynamicCode,
    saveDynamicCommand,
    registerDynamicCommand,
    loadAllDynamicCommands,
    hasDynamicCommand,
    getDynamicCommand,
    executeDynamicCommand,
    listDynamicCommands,
    clearDynamicRegistry,
    getCommandFileInfo,
    extractFeatureSummary,
    listDynamicCommandDetails,
    DYNAMIC_DIR,
} from "../Modules/dynamicExecutor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a sandbox test directory inside the repo so we don't pollute commands/dynamic/
const TEST_DIR = path.resolve(__dirname, "..", "commands", "dynamic_test");

async function ensureCleanDir() {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
}

test.beforeEach(async () => {
    await ensureCleanDir();
    clearDynamicRegistry();
});

test.after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    clearDynamicRegistry();
});

// ---------- sanitizeName ----------

test("sanitizeName: lowercase + alphanumeric + underscore only", () => {
    assert.equal(sanitizeName("Hello World!"), "hello_world");
    assert.equal(sanitizeName("bikin-command-GACOR"), "bikin_command_gacor");
    assert.equal(sanitizeName("foo123"), "foo123");
});

test("sanitizeName: collapses consecutive underscores", () => {
    assert.equal(sanitizeName("foo___bar"), "foo_bar");
});

test("sanitizeName: trims leading/trailing underscores", () => {
    assert.equal(sanitizeName("__hello__"), "hello");
});

test("sanitizeName: enforces 32-char cap", () => {
    const long = "a".repeat(50);
    assert.equal(sanitizeName(long).length, 32);
});

test("sanitizeName: returns null for empty/invalid input", () => {
    assert.equal(sanitizeName(""), null);
    assert.equal(sanitizeName(null), null);
    assert.equal(sanitizeName(undefined), null);
    assert.equal(sanitizeName("!!!"), null);
});

// ---------- validateDynamicCode ----------

test("validateDynamicCode: accepts valid default export async function", () => {
    const code = `export default async function (msg, params) { return "ok"; }`;
    const v = validateDynamicCode(code);
    assert.equal(v.valid, true);
});

test("validateDynamicCode: accepts named handle export", () => {
    const code = `export async function handle(msg, params) { return "ok"; }`;
    const v = validateDynamicCode(code);
    assert.equal(v.valid, true);
});

test("validateDynamicCode: strips markdown code fences before validation", () => {
    const fenced = "```javascript\nexport default async function(msg, params) { return 'ok'; }\n```";
    const v = validateDynamicCode(fenced);
    assert.equal(v.valid, true);
});

test("validateDynamicCode: rejects empty code", () => {
    const v = validateDynamicCode("");
    assert.equal(v.valid, false);
    assert.ok(v.errors.includes("Code is empty"));
});

test("validateDynamicCode: rejects syntax errors", () => {
    const v = validateDynamicCode("export default function ( { return ; }");
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.startsWith("Syntax error")));
});

test("validateDynamicCode: rejects eval()", () => {
    const code = `export default async function (m, p) { return eval("1+1"); }`;
    const v = validateDynamicCode(code);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes("eval")));
});

test("validateDynamicCode: rejects new Function()", () => {
    const code = `export default async function (m, p) { return new Function("return 1")(); }`;
    const v = validateDynamicCode(code);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes("Function")));
});

test("validateDynamicCode: rejects child_process import", () => {
    const code = `import { exec } from "node:child_process";\nexport default async function () {}`;
    const v = validateDynamicCode(code);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes("child_process")));
});

test("validateDynamicCode: rejects process.exit()", () => {
    const code = `export default async function () { process.exit(0); }`;
    const v = validateDynamicCode(code);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes("process.exit")));
});

test("validateDynamicCode: rejects fs.rm()", () => {
    const code = `import fs from "node:fs";\nexport default async function () { fs.rm("/"); }`;
    const v = validateDynamicCode(code);
    assert.equal(v.valid, false);
});

test("validateDynamicCode: rejects spawn/exec calls", () => {
    const code1 = `export default async function () { spawn("ls"); }`;
    const code2 = `export default async function () { execSync("ls"); }`;
    assert.equal(validateDynamicCode(code1).valid, false);
    assert.equal(validateDynamicCode(code2).valid, false);
});

test("validateDynamicCode: rejects code without export", () => {
    const code = `async function something(msg, params) { return "ok"; }`;
    const v = validateDynamicCode(code);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.toLowerCase().includes("export")));
});

test("validateDynamicCode: rejects oversized code", async () => {
    const huge = "export default async function() { return '" + "x".repeat(60_000) + "'; }";
    const v = validateDynamicCode(huge);
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes("bytes")));
});

// ---------- saveDynamicCommand ----------

test("saveDynamicCommand: rejects invalid name", async () => {
    const r = await saveDynamicCommand("", "export default async function(){}");
    assert.equal(r.ok, false);
});

test("saveDynamicCommand: rejects invalid code", async () => {
    const r = await saveDynamicCommand("test", "syntax error !!");
    assert.equal(r.ok, false);
});

test("saveDynamicCommand: writes file to dynamic dir on success", async () => {
    const code = `export default async function (msg, params) { return "saved"; }`;
    const r = await saveDynamicCommand("test_save", code);
    // The save uses the real DYNAMIC_DIR (read-only test would need DI)
    // We only assert that when valid, ok=true and filePath ends with handle_test_save.js
    if (r.ok) {
        assert.match(r.filePath, /handle_test_save\.js$/);
        // Cleanup
        await fs.rm(r.filePath, { force: true });
    } else {
        // Acceptable if write fails in some env — but the test dir should exist
        assert.fail(`saveDynamicCommand failed: ${r.error}`);
    }
});

// ---------- DYNAMIC_DIR metadata ----------

test("DYNAMIC_DIR is inside the project commands/dynamic/", () => {
    assert.match(DYNAMIC_DIR, /commands[\\/]+dynamic$/);
});

test("listDynamicCommands starts empty after clear", () => {
    clearDynamicRegistry();
    assert.deepEqual(listDynamicCommands(), []);
});

test("hasDynamicCommand returns false for unknown", () => {
    clearDynamicRegistry();
    assert.equal(hasDynamicCommand("does_not_exist"), false);
});

test("getDynamicCommand returns null for unknown", () => {
    clearDynamicRegistry();
    assert.equal(getDynamicCommand("nope"), null);
});

test("executeDynamicCommand returns error when not loaded", async () => {
    clearDynamicRegistry();
    const r = await executeDynamicCommand("ghost", {}, {});
    assert.equal(r.ok, false);
    assert.match(r.error, /not loaded/);
});

// ---------- Cache behavior ----------

// ---------- v1.3.0: getCommandFileInfo & extractFeatureSummary ----------

test("extractFeatureSummary: returns JSDoc summary", async () => {
    const tmpDir = path.join(__dirname, "_tmp_summary");
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, "with_jsdoc.js");
    await fs.writeFile(
        filePath,
        `/** Sends a motivational quote to the channel.\n * Works in any text channel.\n */\nexport default async function () { return "ok"; }\n`
    );
    const summary = await extractFeatureSummary(filePath);
    assert.match(summary, /motivational/);
    await fs.rm(tmpDir, { recursive: true, force: true });
});

test("extractFeatureSummary: returns first // comment when no JSDoc", async () => {
    const tmpDir = path.join(__dirname, "_tmp_summary2");
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, "with_comment.js");
    await fs.writeFile(
        filePath,
        `// Counts words in user message\nimport x from "y";\nexport default async function () { return x; }\n`
    );
    const summary = await extractFeatureSummary(filePath);
    assert.match(summary, /Counts words/);
    await fs.rm(tmpDir, { recursive: true, force: true });
});

test("extractFeatureSummary: returns (no summary) when nothing found", async () => {
    const tmpDir = path.join(__dirname, "_tmp_summary3");
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, "blank.js");
    await fs.writeFile(filePath, `\n\n\n`);
    const summary = await extractFeatureSummary(filePath);
    assert.equal(summary, "(no summary)");
    await fs.rm(tmpDir, { recursive: true, force: true });
});

test("extractFeatureSummary: returns (unable to read file) on missing path", async () => {
    const summary = await extractFeatureSummary("C:/this/path/does/not/exist.js");
    assert.equal(summary, "(unable to read file)");
});

test("getCommandFileInfo: returns metadata for an existing command", async () => {
    clearDynamicRegistry();
    await fs.mkdir(DYNAMIC_DIR, { recursive: true });
    const fp = path.join(DYNAMIC_DIR, "handle_test_info.js");
    await fs.writeFile(
        fp,
        `/** Replies pong to the user. */\nexport default async function () { return "pong"; }\n`
    );
    try {
        const info = await getCommandFileInfo("test_info");
        assert.ok(info);
        assert.equal(info.name, "test_info");
        assert.equal(info.exists, true);
        assert.ok(info.sizeBytes > 0);
        assert.ok(info.createdAt);
        assert.match(info.summary, /Replies pong/);
    } finally {
        await fs.rm(fp, { force: true });
        clearDynamicRegistry();
    }
});

test("getCommandFileInfo: returns null for empty/null name", async () => {
    const info1 = await getCommandFileInfo("");
    const info2 = await getCommandFileInfo(null);
    assert.equal(info1, null);
    assert.equal(info2, null);
});

test("getCommandFileInfo: returns exists:false for missing file", async () => {
    clearDynamicRegistry();
    const info = await getCommandFileInfo("totally_made_up_xyz");
    assert.ok(info);
    assert.equal(info.exists, false);
    assert.equal(info.loaded, false);
});

test("listDynamicCommandDetails: returns array of metadata objects", async () => {
    clearDynamicRegistry();
    await fs.mkdir(DYNAMIC_DIR, { recursive: true });
    const fp1 = path.join(DYNAMIC_DIR, "handle_listed_one.js");
    const fp2 = path.join(DYNAMIC_DIR, "handle_listed_two.js");
    await fs.writeFile(fp1, `/** One */\nexport default async function () { return "1"; }`);
    await fs.writeFile(fp2, `/** Two */\nexport default async function () { return "2"; }`);
    try {
        const list = await listDynamicCommandDetails();
        const names = list.map((d) => d.name);
        assert.ok(names.includes("listed_one"));
        assert.ok(names.includes("listed_two"));
    } finally {
        await fs.rm(fp1, { force: true });
        await fs.rm(fp2, { force: true });
        clearDynamicRegistry();
    }
});

// ---------- v1.3.0: Self-Healing error capture ----------

test("executeDynamicCommand: captures runtime error message", async () => {
    clearDynamicRegistry();
    await fs.mkdir(DYNAMIC_DIR, { recursive: true });
    const fp = path.join(DYNAMIC_DIR, "handle_crashes.js");
    // Code that throws at runtime
    await fs.writeFile(
        fp,
        `export default async function (msg, params) { throw new Error("intentional crash for test"); }`
    );
    try {
        const reg = await registerDynamicCommand("crashes");
        assert.equal(reg.ok, true);

        const exec = await executeDynamicCommand("crashes", {}, {});
        assert.equal(exec.ok, false);
        assert.match(exec.error, /intentional crash/);
    } finally {
        await fs.rm(fp, { force: true });
        clearDynamicRegistry();
    }
});

test("executeDynamicCommand: returns ok=true with string result on success", async () => {
    clearDynamicRegistry();
    await fs.mkdir(DYNAMIC_DIR, { recursive: true });
    const fp = path.join(DYNAMIC_DIR, "handle_okay.js");
    await fs.writeFile(
        fp,
        `export default async function () { return "all good"; }`
    );
    try {
        await registerDynamicCommand("okay");
        const exec = await executeDynamicCommand("okay", {}, {});
        assert.equal(exec.ok, true);
        assert.equal(exec.result, "all good");
    } finally {
        await fs.rm(fp, { force: true });
        clearDynamicRegistry();
    }
});

test("executeDynamicCommand: stringifies non-string return values", async () => {
    clearDynamicRegistry();
    await fs.mkdir(DYNAMIC_DIR, { recursive: true });
    const fp = path.join(DYNAMIC_DIR, "handle_obj.js");
    await fs.writeFile(
        fp,
        `export default async function () { return { a: 1 }; }`
    );
    try {
        await registerDynamicCommand("obj");
        const exec = await executeDynamicCommand("obj", {}, {});
        assert.equal(exec.ok, true);
        assert.match(exec.result, /"a":\s*1/);
    } finally {
        await fs.rm(fp, { force: true });
        clearDynamicRegistry();
    }
});

test("registry is shared: re-registering same name overwrites", async () => {
    clearDynamicRegistry();
    const code1 = `export default async function (msg, params) { return "v1"; }`;
    const code2 = `export default async function (msg, params) { return "v2"; }`;

    // Write to actual dynamic dir
    await fs.mkdir(DYNAMIC_DIR, { recursive: true });
    const filePath = path.join(DYNAMIC_DIR, "handle_overwrite.js");
    await fs.writeFile(filePath, code1);

    const r1 = await registerDynamicCommand("overwrite");
    assert.equal(r1.ok, true);

    await fs.writeFile(filePath, code2);
    const r2 = await registerDynamicCommand("overwrite");
    assert.equal(r2.ok, true);

    const exec = await executeDynamicCommand("overwrite", {}, {});
    assert.equal(exec.ok, true);
    assert.equal(exec.result, "v2");

    // Cleanup
    await fs.rm(filePath, { force: true });
    clearDynamicRegistry();
});

test("loadAllDynamicCommands imports pre-existing files", async () => {
    clearDynamicRegistry();
    await fs.mkdir(DYNAMIC_DIR, { recursive: true });
    const fp = path.join(DYNAMIC_DIR, "handle_preloaded.js");
    await fs.writeFile(
        fp,
        `export default async function (msg, params) { return "preloaded"; }`
    );

    try {
        const res = await loadAllDynamicCommands();
        assert.ok(res.loaded >= 1);
        assert.ok(hasDynamicCommand("preloaded"));
    } finally {
        await fs.rm(fp, { force: true });
        clearDynamicRegistry();
    }
});
