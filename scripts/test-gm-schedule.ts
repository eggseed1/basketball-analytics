import assert from "node:assert/strict";
import { FRANCHISES } from "../src/gm/seed/franchises";
import {
  gapBefore,
  generateSchedule,
  officialSchedule,
  tradeDeadlineDate,
  tradeDeadlineDay,
} from "../src/gm/engine/schedule";
import { seasonMarks } from "../src/gm/engine/calendar-marks";
import { secondNightScale } from "../src/gm/engine/simulate";
import type { GmTeam } from "../src/gm/types";

const teams = FRANCHISES.map(
  (franchise) => ({ id: franchise.id }) as GmTeam
);

function audit(label: string, games: ReturnType<typeof officialSchedule>) {
  const byTeam = new Map<string, string[]>();
  const homes = new Map<string, number>();
  const nights = new Map<string, number>();
  for (const game of games) {
    assert.notEqual(game.homeTeamId, game.awayTeamId);
    const date = game.gameDate ?? "";
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    nights.set(date, (nights.get(date) ?? 0) + 1);
    for (const id of [game.homeTeamId, game.awayTeamId]) {
      const list = byTeam.get(id) ?? [];
      list.push(date);
      byTeam.set(id, list);
    }
    homes.set(game.homeTeamId, (homes.get(game.homeTeamId) ?? 0) + 1);
  }
  assert.equal(byTeam.size, 30, label);
  let triples = 0;
  let doubles = 0;
  const b2b: number[] = [];
  for (const dates of byTeam.values()) {
    const unique = [...new Set(dates)].sort();
    if (unique.length !== dates.length) doubles += dates.length - unique.length;
    let streak = 1;
    let backs = 0;
    for (let i = 1; i < unique.length; i++) {
      const prev = Date.parse(`${unique[i - 1]}T00:00:00Z`);
      const cur = Date.parse(`${unique[i]}T00:00:00Z`);
      const diff = (cur - prev) / 86_400_000;
      if (diff === 1) {
        streak += 1;
        if (streak === 2) backs += 1;
        if (streak >= 3) triples += 1;
      } else streak = 1;
    }
    b2b.push(backs);
  }
  const counts = [...byTeam.values()].map((dates) => dates.length);
  const homeCounts = [...homes.values()];
  return {
    label,
    games: games.length,
    perTeam: [Math.min(...counts), Math.max(...counts)],
    homes: [Math.min(...homeCounts), Math.max(...homeCounts)],
    nights: nights.size,
    perNight: [Math.min(...nights.values()), Math.max(...nights.values())],
    doubles,
    triples,
    b2b: [Math.min(...b2b), Math.max(...b2b)],
  };
}

const real = officialSchedule(2027);
const realAudit = audit("2027", real);
assert.deepEqual(realAudit.perTeam, [80, 80]);
assert.deepEqual(realAudit.homes, [40, 40]);
assert.equal(realAudit.doubles, 0);
assert.equal(realAudit.triples, 0);
assert.ok(realAudit.b2b[1]! <= 18);
const bos = real
  .filter((game) => game.homeTeamId === "bos" || game.awayTeamId === "bos")
  .sort((a, b) => (a.gameDate ?? "").localeCompare(b.gameDate ?? ""));
assert.equal(bos[0]?.gameDate, "2026-10-20");
assert.equal(bos[0]?.homeTeamId, "det");
assert.equal(bos[0]?.awayTeamId, "bos");

const built = generateSchedule(teams, 2028, 42);
const builtAudit = audit("2028", built);
assert.deepEqual(builtAudit.perTeam, [80, 80]);
assert.ok(builtAudit.homes[0]! >= 39 && builtAudit.homes[1]! <= 41);
assert.equal(builtAudit.doubles, 0);
assert.equal(builtAudit.triples, 0);
assert.ok(builtAudit.b2b[1]! <= 20);
assert.ok((built[0]?.gameDate ?? "") >= "2027-10-01");
assert.ok((built[built.length - 1]?.gameDate ?? "") <= "2028-04-20");

const again = generateSchedule(teams, 2027, 1);
assert.equal(again.length, 1200);

assert.equal(tradeDeadlineDate(real), "2027-02-11");
assert.equal(tradeDeadlineDay(real), real.find((game) => game.gameDate === "2027-02-11")?.day);
const bosNov2 = bos.find((game) => game.gameDate === "2026-11-02");
assert.ok(bosNov2);
assert.equal(gapBefore(real, "bos", "2026-11-02"), 1);
assert.equal(gapBefore(real, "bos", "2026-10-20"), null);
assert.equal(secondNightScale(36, 1), 0.974);
assert.equal(secondNightScale(24, 1), 0.994);
assert.equal(secondNightScale(36, 2), 1);

const marks = seasonMarks(real);
const labelOn = (date: string) =>
  marks.find((mark) => mark.iso === date && mark.label)?.label;
assert.equal(labelOn("2026-10-20"), "Opener");
assert.equal(labelOn("2026-11-26"), "Thanks");
assert.equal(labelOn("2026-12-04"), "Cup");
assert.equal(labelOn("2026-12-15"), "Deals");
assert.equal(labelOn("2026-12-25"), "Christmas");
assert.equal(labelOn("2027-01-01"), "New Year");
assert.equal(labelOn("2027-01-18"), "MLK");
assert.equal(labelOn("2027-02-11"), "Trade");
assert.equal(labelOn("2027-02-19"), "All-Star");
assert.equal(labelOn("2027-03-01"), "Buyout");
assert.equal(labelOn("2027-04-11"), "Finale");
assert.equal(marks.filter((mark) => mark.kind === "cup").length, 8);
assert.equal(marks.filter((mark) => mark.kind === "break").length, 6);

console.log("gm schedule ok", realAudit, builtAudit);
