// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { LOG_BUFFER, bufferLog } from "./logging";

describe("bufferLog", () => {
  beforeEach(() => {
    LOG_BUFFER.length = 0; // Clear buffer before each test
  });

  it("adds an entry to the buffer", () => {
    bufferLog("info", "test message");
    expect(LOG_BUFFER).toHaveLength(1);
    expect(LOG_BUFFER[0].level).toBe("info");
    expect(LOG_BUFFER[0].msg).toContain("test message");
  });

  it("includes a timestamp", () => {
    const before = new Date().toISOString();
    bufferLog("warn", "warning!");
    const after = new Date().toISOString();
    expect(LOG_BUFFER[0].ts >= before).toBe(true);
    expect(LOG_BUFFER[0].ts <= after).toBe(true);
  });

  it("stringifies non-string arguments", () => {
    bufferLog("info", "count:", 42, { key: "value" });
    expect(LOG_BUFFER[0].msg).toContain("42");
    expect(LOG_BUFFER[0].msg).toContain('{"key":"value"}');
  });

  it("stores error level correctly", () => {
    bufferLog("error", "something broke");
    expect(LOG_BUFFER[0].level).toBe("error");
  });

  it("keeps buffer under max size (200 entries)", () => {
    for (let i = 0; i < 250; i++) {
      bufferLog("info", `message ${i}`);
    }
    expect(LOG_BUFFER).toHaveLength(200);
    // Oldest entries should be dropped
    expect(LOG_BUFFER[0].msg).toContain("message 50");
    expect(LOG_BUFFER[199].msg).toContain("message 249");
  });

  it("preserves order (FIFO with shift)", () => {
    bufferLog("info", "first");
    bufferLog("info", "second");
    bufferLog("info", "third");
    expect(LOG_BUFFER[0].msg).toContain("first");
    expect(LOG_BUFFER[1].msg).toContain("second");
    expect(LOG_BUFFER[2].msg).toContain("third");
  });
});

describe("LOG_BUFFER", () => {
  it("is exported and starts empty", () => {
    LOG_BUFFER.length = 0;
    expect(LOG_BUFFER).toHaveLength(0);
  });

  it("is mutated by bufferLog", () => {
    LOG_BUFFER.length = 0;
    bufferLog("info", "hello");
    expect(LOG_BUFFER).toHaveLength(1);
  });
});
