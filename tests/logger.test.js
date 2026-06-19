import { test } from "node:test";
import assert from "node:assert/strict";
import { logger } from "../Modules/logger.js";

test("logger writes JSON line to stdout", () => {
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = (chunk) => {
        captured += String(chunk);
        return true;
    };

    try {
        logger.info("hello world", { foo: "bar" });
    } finally {
        process.stdout.write = original;
    }

    const lines = captured.trim().split("\n");
    assert.equal(lines.length, 1, "should write exactly one line");

    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, "INFO");
    assert.equal(parsed.msg, "hello world");
    assert.equal(parsed.foo, "bar");
    assert.ok(parsed.ts, "should include timestamp");
});

test("logger redacts sensitive keys", () => {
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = (chunk) => {
        captured += String(chunk);
        return true;
    };

    try {
        logger.info("auth", { token: "secret-xyz", ai_apikey: "key-abc", user: "beni" });
    } finally {
        process.stdout.write = original;
    }

    const parsed = JSON.parse(captured.trim());
    assert.equal(parsed.token, "[REDACTED]");
    assert.equal(parsed.ai_apikey, "[REDACTED]");
    assert.equal(parsed.user, "beni");
});

test("logger respects LOG_LEVEL filtering", () => {
    const originalLevel = process.env.LOG_LEVEL;
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = (chunk) => {
        captured += String(chunk);
        return true;
    };

    try {
        process.env.LOG_LEVEL = "WARN";
        logger.debug("should-be-hidden");
        logger.warn("should-show");
    } finally {
        process.stdout.write = original;
        if (originalLevel === undefined) delete process.env.LOG_LEVEL;
        else process.env.LOG_LEVEL = originalLevel;
    }

    const lines = captured.trim().split("\n");
    assert.equal(lines.length, 1, "only WARN should pass through");
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, "WARN");
});

test("logger.child prepends context", () => {
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = (chunk) => {
        captured += String(chunk);
        return true;
    };

    try {
        const child = logger.child({ module: "test" });
        child.info("nested");
    } finally {
        process.stdout.write = original;
    }

    const parsed = JSON.parse(captured.trim());
    assert.equal(parsed.module, "test");
    assert.equal(parsed.msg, "nested");
});

test("logger does not throw on stdout failure", () => {
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => {
        throw new Error("broken pipe");
    };
    try {
        assert.doesNotThrow(() => logger.error("boom"));
    } finally {
        process.stdout.write = original;
    }
});
