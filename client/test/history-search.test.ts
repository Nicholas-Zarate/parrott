import { test, expect } from "@playwright/test";
import {
  buildSearchParams,
  getHighlightTerms,
  getHighlightSegments,
  HISTORY_SEARCH_RESULT_LIMIT,
} from "@/lib/history-search";

test.describe("history-search", () => {
  test.describe("getHighlightTerms", () => {
    test("returns empty array for empty or blank string", () => {
      expect(getHighlightTerms("")).toEqual([]);
      expect(getHighlightTerms("   ")).toEqual([]);
    });

    test("splits on whitespace and trims", () => {
      expect(getHighlightTerms("hello world")).toEqual(["hello", "world"]);
      expect(getHighlightTerms("  foo   bar  ")).toEqual(["foo", "bar"]);
    });

    test("filters out empty segments", () => {
      expect(getHighlightTerms("a  b")).toEqual(["a", "b"]);
    });
  });

  test.describe("getHighlightSegments", () => {
    test("returns single text segment when no terms", () => {
      expect(getHighlightSegments("hello world", [])).toEqual([
        { type: "text", value: "hello world" },
      ]);
    });

    test("returns single text segment when text is empty", () => {
      expect(getHighlightSegments("", ["foo"])).toEqual([{ type: "text", value: "" }]);
    });

    test("wraps matching term in mark segment", () => {
      const out = getHighlightSegments("hello world", ["world"]);
      expect(out).toEqual([
        { type: "text", value: "hello " },
        { type: "mark", value: "world" },
      ]);
    });

    test("matches case-insensitively", () => {
      const out = getHighlightSegments("Hello WORLD", ["hello", "world"]);
      expect(out).toEqual([
        { type: "mark", value: "Hello" },
        { type: "text", value: " " },
        { type: "mark", value: "WORLD" },
      ]);
    });

    test("merges overlapping matches", () => {
      const out = getHighlightSegments("xxx", ["xx"]);
      expect(out).toEqual([
        { type: "mark", value: "xxx" },
      ]);
    });

    test("multiple non-overlapping terms", () => {
      const out = getHighlightSegments("a b c a b c", ["a", "c"]);
      expect(out).toEqual([
        { type: "mark", value: "a" },
        { type: "text", value: " b " },
        { type: "mark", value: "c" },
        { type: "text", value: " " },
        { type: "mark", value: "a" },
        { type: "text", value: " b " },
        { type: "mark", value: "c" },
      ]);
    });
  });

  test.describe("buildSearchParams", () => {
    test("passes trimmed search_query and null when empty", () => {
      const params = buildSearchParams(
        { dateFrom: "", dateTo: "", channelId: "" },
        "  ",
        50,
        0
      );
      expect(params.search_query).toBeNull();
      expect(params.filter_channel_id).toBeNull();
      expect(params.filter_date_from).toBeNull();
      expect(params.filter_date_to).toBeNull();
      expect(params.result_limit).toBe(50);
      expect(params.result_offset).toBe(0);
    });

    test("passes search query when non-empty", () => {
      const params = buildSearchParams(
        { dateFrom: "", dateTo: "", channelId: "" },
        "  funny joke  ",
        HISTORY_SEARCH_RESULT_LIMIT,
        0
      );
      expect(params.search_query).toBe("funny joke");
    });

    test("converts dateFrom to start-of-day ISO", () => {
      const params = buildSearchParams(
        { dateFrom: "2025-02-15", dateTo: "", channelId: "" },
        "",
        10,
        0
      );
      expect(params.filter_date_from).toBeDefined();
      expect(params.filter_date_from).toMatch(/^2025-02-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("converts dateTo to end-of-day ISO", () => {
      const params = buildSearchParams(
        { dateFrom: "", dateTo: "2025-02-16", channelId: "" },
        "",
        10,
        0
      );
      expect(params.filter_date_to).toBeDefined();
      expect(params.filter_date_to).toMatch(/^2025-02-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("passes channelId when set", () => {
      const params = buildSearchParams(
        { dateFrom: "", dateTo: "", channelId: "123456" },
        "test",
        20,
        5
      );
      expect(params.filter_channel_id).toBe("123456");
      expect(params.result_limit).toBe(20);
      expect(params.result_offset).toBe(5);
    });
  });
});
