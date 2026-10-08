import { calendar, cohortLevel, performanceLevel, roleFor, simulateGame, type Level } from "./career";
import { clamp, hashString, rngOf } from "./rng";
import type { BoxScore, IntlKind, IntlResult, LifeState, Role } from "./types";
import { COUNTRIES, country, maybeCountry, teamStrength, type FibaRegion } from "./world";

/**
 * National team calendar (model). Senior dates follow the announced FIBA and
 * IOC cycle: World Cup 2027 in Qatar, Olympics 2028 in Los Angeles and 2032 in
 * Brisbane, continental cups every four years from 2025. Youth events use a
 * simplified cadence: U16 and U18 continental championships, U17 and U19 World
 * Cups. Qualification and selection are modeled from FIBA ranking points and
 * the player's level, not real qualifying results.
 */

export interface Tournament {
  id: string;
  name: string;
  short: string;
  kind: IntlKind;
  year: number;
  month: number;
  scope: "world" | Exclude<FibaRegion, "none" | "oceania">;
  field: number;
  host: string | null;
  knockout: number;
  minAge: number;
  maxAge: number | null;
}

const CONTINENTAL: Record<Tournament["scope"], { name: string; field: number }> = {
  world: { name: "", field: 0 },
  europe: { name: "EuroBasket", field: 24 },
  americas: { name: "FIBA AmeriCup", field: 12 },
  africa: { name: "FIBA AfroBasket", field: 16 },
  asia: { name: "FIBA Asia Cup", field: 16 },
};

const YOUTH_CONT: Record<Tournament["scope"], string> = { world: "", europe: "European Championship", americas: "AmeriCup", africa: "AfroBasket", asia: "Asia Cup" };

export function scopeFor(countryId: string): Tournament["scope"] {
  const r = maybeCountry(countryId)?.region ?? "none";
  return r === "oceania" ? "asia" : r === "none" ? "asia" : r;
}

/** Tournaments a country's teams could enter in a calendar year. */
export function tournamentsFor(countryId: string, year: number): Tournament[] {
  const out: Tournament[] = [];
  const scope = scopeFor(countryId);
  if (year >= 2027 && (year - 2027) % 4 === 0) {
    out.push({ id: `wc-${year}`, name: `FIBA Basketball World Cup ${year}${year === 2027 ? ", Qatar" : ""}`, short: `${year} World Cup`, kind: "world-cup", year, month: 8, scope: "world", field: 32, host: year === 2027 ? "QA" : null, knockout: 4, minAge: 17, maxAge: null });
  }
  if (year >= 2028 && (year - 2028) % 4 === 0) {
    const city = year === 2028 ? "Los Angeles" : year === 2032 ? "Brisbane" : null;
    out.push({ id: `og-${year}`, name: `Olympic Games${city ? ` ${city}` : ""} ${year}`, short: `${year} Olympics`, kind: "olympics", year, month: 7, scope: "world", field: 12, host: year === 2028 ? "US" : year === 2032 ? "AU" : null, knockout: 3, minAge: 17, maxAge: null });
  }
  if (year >= 2029 && (year - 2029) % 4 === 0) {
    const c = CONTINENTAL[scope];
    out.push({ id: `cc-${scope}-${year}`, name: `${c.name} ${year}`, short: `${c.name} ${year}`, kind: "continental", year, month: 8, scope, field: c.field, host: null, knockout: c.field >= 16 ? 4 : 3, minAge: 17, maxAge: null });
  }
  if (year % 2 === 1) {
    out.push({ id: `u19-${year}`, name: `FIBA U19 World Cup ${year}`, short: `U19 World Cup ${year}`, kind: "u19", year, month: 7, scope: "world", field: 16, host: null, knockout: 4, minAge: 15, maxAge: 19 });
    out.push({ id: `u16-${scope}-${year}`, name: `FIBA U16 ${YOUTH_CONT[scope]} ${year}`, short: `U16 ${YOUTH_CONT[scope]} ${year}`, kind: "u16", year, month: 8, scope, field: 16, host: null, knockout: 4, minAge: 14, maxAge: 16 });
  } else {
    out.push({ id: `u17-${year}`, name: `FIBA U17 World Cup ${year}`, short: `U17 World Cup ${year}`, kind: "u17", year, month: 7, scope: "world", field: 16, host: null, knockout: 4, minAge: 14, maxAge: 17 });
    out.push({ id: `u18-${scope}-${year}`, name: `FIBA U18 ${YOUTH_CONT[scope]} ${year}`, short: `U18 ${YOUTH_CONT[scope]} ${year}`, kind: "u18", year, month: 8, scope, field: 16, host: null, knockout: 4, minAge: 15, maxAge: 18 });
  }
  return out;
}

export const isYouth = (t: Tournament) => t.maxAge !== null;

function noise(key: string) {
  return hashString(key) / 4294967296 - 0.5;
}

/** Teams in the field: the host plus the best ranked-and-noise entries in scope. */
export function fieldOf(t: Tournament): string[] {
  const pool = COUNTRIES.filter((c) => c.federation && c.inhabited && (t.scope === "world" || scopeFor(c.id) === t.scope));
  const youthBias = isYouth(t) ? 10 : 6;
  const ranked = pool
    .map((c) => ({ id: c.id, v: teamStrength(c.id) + noise(`${t.id}:${c.id}`) * 2 * youthBias + (c.id === t.host ? 1000 : 0) }))
    .sort((a, b) => b.v - a.v);
  return ranked.slice(0, t.field).map((x) => x.id);
}

export function nationalTeam(s: LifeState): string | null {
  const id = s.international.countryId ?? s.citizenships[0] ?? null;
  return id && country(id).federation ? id : null;
}

export function ageInYear(s: LifeState, year: number) {
  return year - s.identity.birthYear;
}

/** Playing level a coach would need to pick this player (model). */
export function selectionBar(s: LifeState, t: Tournament, nat: string): number {
  if (!isYouth(t)) return seniorBar(s, nat);
  const snub = typeof s.flags.intlSnub === "number" && s.ageMonths - s.flags.intlSnub < 36 ? 2 : 0;
  return cohortLevel(ageInYear(s, t.year)) * (1.04 + teamStrength(nat) / 500) + snub;
}

export function seniorBar(s: LifeState, nat: string): number {
  const snub = typeof s.flags.intlSnub === "number" && s.ageMonths - s.flags.intlSnub < 36 ? 2 : 0;
  return 36 + 0.42 * teamStrength(nat) + snub;
}

export function eligible(s: LifeState, t: Tournament): boolean {
  const a = ageInYear(s, t.year);
  return a >= t.minAge && (t.maxAge === null || a <= t.maxAge);
}

export interface Selection {
  t: Tournament;
  nat: string;
  qualified: boolean;
  bar: number;
  level: number;
  picked: boolean;
}

export function evaluate(s: LifeState, t: Tournament): Selection | null {
  const nat = nationalTeam(s);
  if (!nat || !eligible(s, t)) return null;
  const qualified = fieldOf(t).includes(nat);
  const bar = selectionBar(s, t, nat);
  const scouted = s.placement.node !== "home" && s.placement.node !== "playground" && s.placement.node !== "unattached";
  const level = performanceLevel(s) - (scouted ? 0 : 4) + rngOf(s.rng, "intl").normal(0, 1.5);
  return { t, nat, qualified, bar, level, picked: qualified && level >= bar };
}

/** Upcoming tournaments for the UI, without consuming randomness. */
export function upcoming(s: LifeState, n = 3): { t: Tournament; qualified: boolean; bar: number }[] {
  const nat = nationalTeam(s);
  if (!nat) return [];
  const { year, month } = calendar(s);
  const out: { t: Tournament; qualified: boolean; bar: number }[] = [];
  for (let y = year; y <= year + 4 && out.length < n; y++) {
    for (const t of tournamentsFor(nat, y).sort((a, b) => a.month - b.month)) {
      if (y === year && t.month < month) continue;
      if (!eligible(s, t)) continue;
      out.push({ t, qualified: fieldOf(t).includes(nat), bar: Math.round(selectionBar(s, t, nat)) });
      if (out.length >= n) break;
    }
  }
  return out;
}

const ROUND_NAME: Record<number, string> = { 1: "Final", 2: "Semifinals", 3: "Quarterfinals", 4: "Round of 16" };

export interface TournamentRun {
  result: IntlResult;
  boxes: BoxScore[];
  summary: string;
}

/** Plays a tournament. With `withPlayer` false, only the team's finish is modeled. */
export function playTournament(s: LifeState, sel: Selection, withPlayer: boolean): TournamentRun {
  const { t, nat } = sel;
  const rng = rngOf(s.rng, "intl");
  const field = fieldOf(t).filter((id) => id !== nat);
  const str = teamStrength(nat);
  const age = ageInYear(s, t.year);
  const need = isYouth(t) ? sel.bar * 0.97 : sel.bar - 2;
  const lvl = performanceLevel(s);
  const role: Role = withPlayer ? roleFor(lvl, sel.bar + 2) : "none";
  const boost = withPlayer ? clamp((lvl - sel.bar) / 4, -1, 4) * ({ none: 0, "deep-bench": 0.1, bench: 0.3, rotation: 0.6, starter: 1, star: 1.4 }[role]) : 0;
  const level: Level = {
    label: t.short,
    need,
    model: { strength: need, exposure: 0, coaching: 0, salaryUsd: [0, 0], games: 8, minutesCap: 40, season: { startMonth: t.month, months: 1 }, minAge: t.minAge },
    leagueId: null,
    youth: isYouth(t),
  };
  const sorted = [...field].sort((a, b) => teamStrength(b) - teamStrength(a));
  const boxes: BoxScore[] = [];
  let wins = 0;
  let losses = 0;
  const playGame = (opp: string): boolean => {
    const p = 1 / (1 + Math.exp(-(str + boost - teamStrength(opp)) / 7));
    const won = rng.next() < p;
    if (withPlayer) {
      const box = simulateGame(s, level, rng, undefined, role);
      box.opponent = country(opp).name;
      box.seasonKey = `intl:${t.id}`;
      const margin = 1 + Math.floor(rng.next() * 14);
      if (won && box.teamScore <= box.oppScore) box.oppScore = Math.max(box.pts, box.teamScore - margin);
      if (won && box.teamScore <= box.oppScore) box.teamScore = box.oppScore + margin;
      if (!won && box.teamScore >= box.oppScore) box.oppScore = box.teamScore + margin;
      boxes.push(box);
    }
    if (won) wins++;
    else losses++;
    return won;
  };
  let groupWins = 0;
  for (let g = 0; g < 3; g++) if (playGame(field[Math.floor(rng.next() * field.length)]!)) groupWins++;
  let finish = "Group stage";
  let medal: IntlResult["medal"] = null;
  const advances = groupWins >= 2 || (groupWins === 1 && rng.next() < (t.field <= 12 ? 0.6 : 0.3));
  if (advances) {
    for (let r = t.knockout; r >= 1; r--) {
      const pool = sorted.slice(0, Math.max(2, Math.ceil(sorted.length / (r >= 3 ? 1 : 2))));
      const won = playGame(pool[Math.floor(rng.next() * pool.length)]!);
      if (won && r === 1) {
        finish = "Gold";
        medal = "gold";
        break;
      }
      if (!won && r === 1) {
        finish = "Silver";
        medal = "silver";
        break;
      }
      if (!won && r === 2) {
        const bronze = playGame(pool[Math.floor(rng.next() * pool.length)]!);
        finish = bronze ? "Bronze" : "4th place";
        medal = bronze ? "bronze" : null;
        break;
      }
      if (!won) {
        finish = ROUND_NAME[r]!;
        break;
      }
    }
  }
  const sum = (k: keyof BoxScore) => boxes.reduce((a, b) => a + (b[k] as number), 0);
  const gp = boxes.filter((b) => b.min > 0).length;
  const result: IntlResult = {
    id: t.id,
    name: t.name,
    kind: t.kind,
    year: t.year,
    age,
    countryId: nat,
    finish,
    medal,
    role,
    gp,
    min: sum("min"),
    pts: sum("pts"),
    reb: sum("reb"),
    ast: sum("ast"),
    stl: sum("stl"),
    blk: sum("blk"),
    tov: sum("tov"),
    fgm: sum("fgm"),
    fga: sum("fga"),
    tpm: sum("tpm"),
    tpa: sum("tpa"),
    ftm: sum("ftm"),
    fta: sum("fta"),
    wins,
    losses,
  };
  const team = country(nat).name;
  const finishText = medal ? `${team} win ${finish.toLowerCase()}` : finish === "4th place" ? `${team} finish fourth` : finish === "Group stage" ? `${team} go out in the group stage` : `${team} lose in the ${finish.toLowerCase()}`;
  const line = gp ? ` You average ${(result.pts / gp).toFixed(1)} points, ${(result.reb / gp).toFixed(1)} rebounds and ${(result.ast / gp).toFixed(1)} assists.` : "";
  return { result, boxes, summary: `${t.name}: ${finishText} (${wins}-${losses}).${line}` };
}

export const KIND_EXPOSURE: Record<IntlKind, number> = { olympics: 12, "world-cup": 10, continental: 7, u19: 7, u18: 6, u17: 6, u16: 5 };
export const KIND_LABEL: Record<IntlKind, string> = { olympics: "Olympics", "world-cup": "World Cup", continental: "Continental cup", u19: "U19 World Cup", u18: "U18 continental", u17: "U17 World Cup", u16: "U16 continental" };
