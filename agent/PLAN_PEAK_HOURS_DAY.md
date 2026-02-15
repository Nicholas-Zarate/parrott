# Plan: Peak hours / day-of-week insight

## Goal
Add "Peak hours / day-of-week" to the full analysis report: bucket messages by hour (0–23) and by day (Mon–Sun), then show when the channel/server is most active in the embed.

## Implementation instructions (from insight table)
- Bucket each `msg.createdTimestamp` by hour (0–23) and day (Mon–Sun).
- Count per bucket.
- Display as bar or grid in embed (respect Discord 1024-char field limit).

---

## 1. Data model (types)

**File:** `analysis/types.js`

- Add a small typedef for the new structure (optional but clear):
  - `activityByTime`: `{ byHour: number[] }` (length 24) and `{ byDay: number[] }` (length 7, index 0 = Sunday).
- Extend `AnalysisReport` with an optional field:
  - `peakActivity?: { byHour: number[], byDay: number[] }`.

No change to collector or commands; we reuse existing message data.

---

## 2. Compute buckets (report)

**File:** `analysis/report.js`

- In `buildFullReport`, after building `channelStats` / `userStats`, add a single pass over the same messages (or integrate into the existing loop) to:
  - Skip bot messages.
  - For each message: `const d = new Date(msg.createdTimestamp)`.
  - Hour bucket: `d.getUTCHours()` → increment `byHour[hour]`.
  - Day bucket: `d.getUTCDay()` (0=Sun, 1=Mon, …, 6=Sat) → increment `byDay[day]`.
- Initialize `byHour` and `byDay` as arrays of 24 and 7 zeros.
- Attach `peakActivity: { byHour, byDay }` to the returned report object (always; if no messages, arrays stay zeros).

Use UTC for consistency and to avoid timezone handling in the bot.

---

## 3. Display in embed (handlers)

**File:** `analysis/handlers.js`

- In `formatFullReportEmbed`, after the "Activity (games/apps)" block (or before it), add a **Peak activity** field only when `report.peakActivity` exists and there is at least one message (e.g. `report.totalMessages > 0`).
- Content (keep under 1024 chars, use `truncate()` if needed):
  - **By hour (UTC):** Either:
    - Top 5 hours with counts, e.g. `14:00 (42), 20:00 (38), 21:00 (35), 22:00 (28), 12:00 (25)`.
    - Or a compact bar row: use a small set of block characters (e.g. `▁▂▃▄▅▆▇█`) to map each hour’s count to a character and output one line like `0 1 2 … 23` with bars below, e.g. `▁▁▂▃▄▅▅▆▇█▇▆…`.
  - **By day:** One line: `Sun 12 · Mon 45 · Tue 33 · Wed 41 · Thu 89 · Fri 120 · Sat 98` (or same with short labels Mon–Sun and counts).
- Suggested format (two lines in one field):
  - Line 1: `**By hour (UTC)** Top: 14:00 (42), 20:00 (38), 21:00 (35)`
  - Line 2: `**By day** Sun 12 · Mon 45 · Tue 33 · Wed 41 · Thu 89 · Fri 120 · Sat 98`
- If you add a bar row for hours, ensure total length stays under 1024 (e.g. 24 chars + labels + newlines).

Minimal report (`formatMinimalReportEmbed`): optionally add one short line, e.g. "Peak: 20:00 UTC, Fri–Sat", or omit to keep minimal report small.

---

## 4. Edge cases

- **No messages:** Don’t show the field, or show "No message data" (report.peakActivity still present with zeros).
- **All zeros:** Same as no messages; skip field or show a neutral message.
- **Truncation:** If the formatted string is long (e.g. all 24 hours with counts), prefer "top N hours" + "by day" summary so we stay well under 1024 chars and never hit the limit.

---

## 5. Files to touch (summary)

| File | Change |
|------|--------|
| `analysis/types.js` | Add `peakActivity` (and optional typedef) to `AnalysisReport`. |
| `analysis/report.js` | In `buildFullReport`, compute `byHour` / `byDay` from message timestamps; set `report.peakActivity`. |
| `analysis/handlers.js` | In `formatFullReportEmbed`, add one embed field "Peak activity" with by-hour and by-day text (and `truncate()`). |

No new commands, no new collector logic; only report building and embed formatting.

---

## 6. Effort

**Low** — Reuses existing `channelMessages`; one extra pass in `buildFullReport` and one new embed field with simple formatting.

---

## 7. Review checklist before coding

- [ ] Use UTC for hour/day so behavior is consistent everywhere.
- [ ] Day order in display: either Sun–Sat (match `getUTCDay`) or Mon–Sun (reorder array for display).
- [ ] Always initialize 24- and 7-length arrays; avoid undefined.
- [ ] Respect 1024-char limit; use `truncate()` for the new field value.
- [ ] Skip or handle zero-message case so the embed doesn’t show misleading "Top: 00:00 (0)".
