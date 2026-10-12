/**
 * Run: npx tsx --test src/lib/findings-archive.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { findingsRss, groupFindingsByDate, mergeFindings } from "@/lib/findings-archive";
import type { RecentInsight } from "@/lib/recent-insights";

function card(id: string, gameDate: string, extra: Partial<RecentInsight> = {}): RecentInsight {
  return {
    id,
    category: "PLAYER · BIG NIGHT",
    headline: `Headline ${id}`,
    description: `Description ${id}.`,
    context: `NY 94, SA 90 · Jun 13`,
    gameId: "401859967",
    gameDate,
    priority: 1,
    bucket: "player",
    ...extra,
  } as RecentInsight;
}

const meta = { season: "2026-27", preseason: false, now: "2026-10-22T10:00:00.000Z" };

test("merging keeps first-seen time, takes newer text, skips surprise cards", () => {
  const first = mergeFindings([], [card("a", "2026-10-21")], meta);
  const later = { ...meta, now: "2026-10-23T10:00:00.000Z" };
  const merged = mergeFindings(
    first,
    [
      card("a", "2026-10-21", { headline: "Corrected" }),
      card("b", "2026-10-22"),
      card("s", "2026-10-22", { focus: "surprise" }),
    ],
    later
  );
  assert.deepEqual(merged.map((f) => f.id), ["b", "a"]);
  assert.equal(merged[1]!.headline, "Corrected");
  assert.equal(merged[1]!.addedAt, meta.now);
  assert.equal(merged[0]!.addedAt, later.now);
});

test("the archive keeps the newest cards up to its cap", () => {
  const cards = ["2026-10-21", "2026-10-22", "2026-10-23"].map((d, i) => card(`c${i}`, d));
  const merged = mergeFindings([], cards, meta, 2);
  assert.deepEqual(merged.map((f) => f.gameDate), ["2026-10-23", "2026-10-22"]);
  assert.deepEqual(groupFindingsByDate(merged).map((g) => g.date), ["2026-10-23", "2026-10-22"]);
});

test("the feed escapes text and links each card to its game", () => {
  const merged = mergeFindings([], [card("x", "2026-10-21", { headline: "A & B <win>" })], meta);
  const xml = findingsRss(merged, { siteUrl: "https://drbl.io", title: "DRBL findings" });
  assert.match(xml, /<title>A &amp; B &lt;win&gt;<\/title>/);
  assert.match(xml, /<link>https:\/\/drbl.io\/games\/401859967<\/link>/);
  assert.match(xml, /<guid isPermaLink="false">drbl-finding:x<\/guid>/);
  assert.match(xml, /<pubDate>Thu, 22 Oct 2026 10:00:00 GMT<\/pubDate>/);
});
