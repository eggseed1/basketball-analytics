function parseMinutes(m: string | null): number {
  if (m == null) return 0;
  const match = /^(\d+):(\d+)/.exec(String(m));
  if (match) return Number(match[1]) + Number(match[2]) / 60;
  const n = Number(m);
  return Number.isFinite(n) ? n : 0;
}

function parseIso(m: string | null): number {
  const s = String(m ?? "");
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(s);
  if (iso) {
    const h = Number(iso[1] || 0);
    const min = Number(iso[2] || 0);
    const sec = Number(iso[3] || 0);
    return h * 60 + min + sec / 60;
  }
  return parseMinutes(m);
}

import { readFileSync } from "node:fs";

const data = JSON.parse(
  readFileSync(
    "data/drbl/history/drbl-history-v1/2019-20/player-games.json",
    "utf8"
  )
) as { rows: Array<{ playerId: string; minutes: string | null }> };

const all = data.rows.filter((r) => r.playerId === "1629027");
let a = 0;
let b = 0;
let ok = 0;
let bad = 0;
const formats = new Map<string, number>();
for (const r of all) {
  const p = parseMinutes(r.minutes);
  a += p;
  const i = parseIso(r.minutes);
  b += i;
  if (p > 0) ok++;
  else bad++;
  const kind = r.minutes?.startsWith("PT")
    ? "PT"
    : r.minutes?.includes(":")
      ? "MMSS"
      : "OTHER";
  formats.set(kind, (formats.get(kind) ?? 0) + 1);
}
console.log(
  JSON.stringify(
    {
      n: all.length,
      oldSum: a,
      isoSum: Math.round(b * 10) / 10,
      parsedOldPositive: ok,
      oldZero: bad,
      formats: Object.fromEntries(formats),
      sample: all[0]?.minutes,
      sampleIso: parseIso(all[0]?.minutes ?? null),
    },
    null,
    2
  )
);

// Why was season minutes 530.6?
const seasons = JSON.parse(
  readFileSync(
    "data/drbl/history/drbl-history-v1/players/player-seasons.json",
    "utf8"
  )
) as { rows: Array<{ playerId: string; season: string; minutes: number }> };
const row = seasons.rows.find(
  (r) => r.playerId === "1629027" && r.season === "2019-20"
);
console.log("seasonRowMinutes", row?.minutes);
