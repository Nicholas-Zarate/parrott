import { test, expect } from "@playwright/test";
import {
  TRIGGER_LABELS,
  TRIGGER_CHIP_CLASSES,
  ACTIVITY_TYPE_LABELS,
  formatRelativeTime,
  messagePreview,
  formatContext,
} from "@/lib/activity-helpers";

test.describe("activity-helpers", () => {
  test.describe("TRIGGER_LABELS", () => {
    test("has labels for all known trigger types", () => {
      expect(TRIGGER_LABELS.game_start).toBe("Game start");
      expect(TRIGGER_LABELS.comeback).toBe("Comeback");
      expect(TRIGGER_LABELS.streaming).toBe("Streaming");
    });
  });

  test.describe("TRIGGER_CHIP_CLASSES", () => {
    test("has classes for known trigger types", () => {
      expect(TRIGGER_CHIP_CLASSES.game_start).toContain("green");
      expect(TRIGGER_CHIP_CLASSES.late_night).toContain("violet");
    });
  });

  test.describe("ACTIVITY_TYPE_LABELS", () => {
    test("maps Discord activity types", () => {
      expect(ACTIVITY_TYPE_LABELS[0]).toBe("Playing");
      expect(ACTIVITY_TYPE_LABELS[1]).toBe("Streaming");
    });
  });

  test.describe("formatRelativeTime", () => {
    test("returns exact locale string", () => {
      const iso = "2025-02-16T12:00:00.000Z";
      const { exact } = formatRelativeTime(iso);
      expect(exact).toContain("2025");
      expect(exact.length).toBeGreaterThan(5);
    });

    test("returns relative string for recent time", () => {
      const now = new Date();
      const { relative } = formatRelativeTime(now.toISOString());
      expect(relative).toBe("Just now");
    });
  });

  test.describe("messagePreview", () => {
    test("returns null for empty or null", () => {
      expect(messagePreview(null)).toBeNull();
      expect(messagePreview("")).toBeNull();
      expect(messagePreview("   ")).toBeNull();
    });

    test("truncates long message with ellipsis", () => {
      const long = "a".repeat(60);
      expect(messagePreview(long, 50)).toBe("a".repeat(50) + "…");
    });

    test("replaces newlines with space", () => {
      expect(messagePreview("foo\nbar", 20)).toBe("foo bar");
    });
  });

  test.describe("formatContext", () => {
    test("returns — for null/undefined", () => {
      expect(formatContext(null)).toBe("—");
      expect(formatContext(undefined)).toBe("—");
    });

    test("stringifies object with indentation", () => {
      const out = formatContext({ game: "Minecraft" });
      expect(out).toContain("game");
      expect(out).toContain("Minecraft");
    });
  });
});
