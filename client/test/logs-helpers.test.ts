import { describe, it, expect } from "vitest";
import { getLevelColor, parseMessageSegments } from "@/lib/logs-helpers";

describe("getLevelColor", () => {
  it("returns red for error", () => {
    expect(getLevelColor("error")).toBe("text-red-400");
  });

  it("returns amber for warn", () => {
    expect(getLevelColor("warn")).toBe("text-amber-400");
  });

  it("returns white for info", () => {
    expect(getLevelColor("info")).toBe("text-white");
  });

  it("returns zinc for debug", () => {
    expect(getLevelColor("debug")).toBe("text-zinc-500");
  });

  it("is case-insensitive", () => {
    expect(getLevelColor("ERROR")).toBe("text-red-400");
    expect(getLevelColor("Warn")).toBe("text-amber-400");
  });

  it("returns fallback for unknown level", () => {
    expect(getLevelColor("trace")).toBe("text-zinc-400");
    expect(getLevelColor("")).toBe("text-zinc-400");
  });
});

describe("parseMessageSegments", () => {
  it("returns single text segment when no brackets", () => {
    const out = parseMessageSegments("hello world");
    expect(out).toEqual([{ type: "text", value: "hello world" }]);
  });

  it("splits one [label] and surrounding text", () => {
    const out = parseMessageSegments("[ActivityDB] Logging event");
    expect(out).toEqual([
      { type: "label", value: "ActivityDB" },
      { type: "text", value: " Logging event" },
    ]);
  });

  it("splits multiple [labels] in one message", () => {
    const out = parseMessageSegments("[Mention] #general @user: hi");
    expect(out).toEqual([
      { type: "label", value: "Mention" },
      { type: "text", value: " #general @user: hi" },
    ]);
  });

  it("handles label at end of message", () => {
    const out = parseMessageSegments("prefix [Debug]");
    expect(out).toEqual([
      { type: "text", value: "prefix " },
      { type: "label", value: "Debug" },
    ]);
  });

  it("handles empty string", () => {
    const out = parseMessageSegments("");
    expect(out).toEqual([]);
  });

  it("handles only a label", () => {
    const out = parseMessageSegments("[Gateway RAW]");
    expect(out).toEqual([{ type: "label", value: "Gateway RAW" }]);
  });
});
