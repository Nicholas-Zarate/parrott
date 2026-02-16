import { test, expect } from "@playwright/test";
import { getLevelColor, parseMessageSegments } from "@/lib/logs-helpers";

test.describe("getLevelColor", () => {
  test("returns red for error", () => {
    expect(getLevelColor("error")).toBe("text-red-400");
  });

  test("returns amber for warn", () => {
    expect(getLevelColor("warn")).toBe("text-amber-400");
  });

  test("returns white for info", () => {
    expect(getLevelColor("info")).toBe("text-white");
  });

  test("returns zinc for debug", () => {
    expect(getLevelColor("debug")).toBe("text-zinc-500");
  });

  test("is case-insensitive", () => {
    expect(getLevelColor("ERROR")).toBe("text-red-400");
    expect(getLevelColor("Warn")).toBe("text-amber-400");
  });

  test("returns fallback for unknown level", () => {
    expect(getLevelColor("trace")).toBe("text-zinc-400");
    expect(getLevelColor("")).toBe("text-zinc-400");
  });
});

test.describe("parseMessageSegments", () => {
  test("returns single text segment when no brackets", () => {
    const out = parseMessageSegments("hello world");
    expect(out).toEqual([{ type: "text", value: "hello world" }]);
  });

  test("splits one [label] and surrounding text", () => {
    const out = parseMessageSegments("[ActivityDB] Logging event");
    expect(out).toEqual([
      { type: "label", value: "ActivityDB" },
      { type: "text", value: " Logging event" },
    ]);
  });

  test("splits multiple [labels] in one message", () => {
    const out = parseMessageSegments("[Mention] #general @user: hi");
    expect(out).toEqual([
      { type: "label", value: "Mention" },
      { type: "text", value: " #general @user: hi" },
    ]);
  });

  test("handles label at end of message", () => {
    const out = parseMessageSegments("prefix [Debug]");
    expect(out).toEqual([
      { type: "text", value: "prefix " },
      { type: "label", value: "Debug" },
    ]);
  });

  test("handles empty string", () => {
    const out = parseMessageSegments("");
    expect(out).toEqual([]);
  });

  test("handles only a label", () => {
    const out = parseMessageSegments("[Gateway RAW]");
    expect(out).toEqual([{ type: "label", value: "Gateway RAW" }]);
  });
});
