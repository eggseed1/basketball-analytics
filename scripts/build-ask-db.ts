/**
 * Builds the Ask DRBL agent's read-only database from the bundled runtime
 * snapshots and writes it as SQL to .ask-db/ask-db.sql.
 *
 *   npx tsx scripts/build-ask-db.ts
 *   npx wrangler d1 execute ASK_DB --local --file .ask-db/ask-db.sql
 *
 * Every value comes from a snapshot the site already ships; missing values stay NULL.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ASK_TABLES, askSchemaDdl, nameKeyOf } from "../src/ask-agent/schema";

const ROOT = path.resolve(import.meta.dirname, "..");
const RUNTIME = path.join(ROOT, "src/data/runtime");
const OUT_DIR = path.join(ROOT, ".ask-db");
const BATCH = 200;

type Row = Record<string, string | number | null | undefined>;

function load<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(RUNTIME, file), "utf8")) as T;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function sqlValue(v: string | number | null | undefined): string {
  if (v == null) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function inserts(table: string, rows: Row[]): string[] {
  const def = ASK_TABLES.find((t) => t.name === table);
  if (!def) throw new Error(`Unknown table ${table}`);
  const cols = def.columns.map((c) => c.name);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows
      .slice(i, i + BATCH)
      .map((row) => `(${cols.map((c) => sqlValue(row[c])).join(", ")})`)
      .join(",\n");
    out.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${values};`);
  }
  return out;
}

// ---------------------------------------------------------------- player_seasons

type BrefPerGame = Record<string, unknown> & { n: string; t: string; e?: string };
type BrefAdvanced = Record<string, unknown> & { n: string; t: string; e?: string };
type BrefFile = { seasons: Record<string, { perGame?: BrefPerGame[]; advanced?: BrefAdvanced[] }> };

function playerSeasons(): Row[] {
  const file = load<BrefFile>("bref-advanced-snapshot.json");
  const rows: Row[] = [];
  for (const [season, data] of Object.entries(file.seasons)) {
    const advanced = new Map<string, BrefAdvanced>();
    for (const a of data.advanced ?? []) advanced.set(`${a.e ?? nameKeyOf(a.n)}|${a.t}`, a);
    const seen = new Set<string>();
    const emit = (pg: BrefPerGame | null, adv: BrefAdvanced | null) => {
      const base = pg ?? adv!;
      const gp = num(pg?.gp) ?? num(adv?.gp);
      const mpg = num(pg?.mp);
      const totalMinutes = num(adv?.mp) ?? (mpg != null && gp != null ? Math.round(mpg * gp) : null);
      rows.push({
        season,
        name: base.n,
        name_key: nameKeyOf(base.n),
        espn_id: str(base.e),
        team: base.t,
        pos: str(pg?.pos),
        age: num(pg?.age),
        gp,
        gs: num(pg?.gs),
        mpg,
        minutes: totalMinutes,
        pts: num(pg?.pts),
        trb: num(pg?.trb),
        orb: num(pg?.orb),
        drb: num(pg?.drb),
        ast: num(pg?.ast),
        stl: num(pg?.stl),
        blk: num(pg?.blk),
        tov: num(pg?.tov),
        pf: num(pg?.pf),
        fgm: num(pg?.fgm),
        fga: num(pg?.fga),
        fg_pct: num(pg?.fgPct),
        fg3m: num(pg?.fg3m),
        fg3a: num(pg?.fg3a),
        fg3_pct: num(pg?.fg3Pct),
        efg_pct: num(pg?.efgPct),
        ftm: num(pg?.ftm),
        fta: num(pg?.fta),
        ft_pct: num(pg?.ftPct),
        ts_pct: num(adv?.ts),
        usg_pct: num(adv?.usg),
        per: num(adv?.per),
        ws: num(adv?.ws),
        ws48: num(adv?.ws48),
        bpm: num(adv?.bpm),
        obpm: num(adv?.obpm),
        dbpm: num(adv?.dbpm),
        vorp: num(adv?.vorp),
        ast_pct: num(adv?.astPct),
        trb_pct: num(adv?.trbPct),
        stl_pct: num(adv?.stlPct),
        blk_pct: num(adv?.blkPct),
        tov_pct: num(adv?.tovPct),
        ortg: num(adv?.ortg),
        drtg: num(adv?.drtg),
      });
    };
    for (const pg of data.perGame ?? []) {
      const key = `${pg.e ?? nameKeyOf(pg.n)}|${pg.t}`;
      seen.add(key);
      emit(pg, advanced.get(key) ?? null);
    }
    for (const [key, adv] of advanced) if (!seen.has(key)) emit(null, adv);
  }
  return rows;
}

// ---------------------------------------------------------------- impact

type DrblFile = { seasons: Record<string, unknown[][]> };

function drblRatings(): Row[] {
  const file = load<DrblFile>("drbl-overlay-snapshot.json");
  const rows: Row[] = [];
  for (const [season, list] of Object.entries(file.seasons)) {
    for (const r of list) {
      if (typeof r[1] !== "string") continue;
      const name = r[1] as string;
      rows.push({
        season,
        name,
        name_key: nameKeyOf(name),
        nba_id: str(r[0]),
        team_id: str(r[2]),
        drbl_per100: num(r[3]),
        possessions: num(r[5]),
        offense: num(r[6]),
        defense: num(r[7]),
        playmaking: num(r[8]),
        lineup: num(r[9]),
        box_prior: num(r[10]),
        r1_points: num(r[11]),
        wins_above_r1: num(r[12]),
      });
    }
  }
  return rows;
}

type ImpactFile = { darko?: Record<string, unknown[][]>; raptor?: Record<string, unknown[][]> };

function impactRatings(): Row[] {
  const file = load<ImpactFile>("impact-overlay-snapshot.json");
  const rows: Row[] = [];
  for (const [season, list] of Object.entries(file.darko ?? {})) {
    for (const r of list) {
      const name = str(r[1]) ?? "";
      rows.push({ season, source: "darko", name, name_key: nameKeyOf(name), player_id: str(r[0]), total: num(r[2]), offense: num(r[3]), defense: num(r[4]), war: null });
    }
  }
  for (const [season, list] of Object.entries(file.raptor ?? {})) {
    for (const r of list) {
      const name = str(r[1]) ?? "";
      rows.push({ season, source: "raptor", name, name_key: nameKeyOf(name), player_id: str(r[0]), total: num(r[2]), offense: num(r[3]), defense: num(r[4]), war: num(r[5]) });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- standings

type StandingsFile = {
  seasons: Record<string, { conferences: Array<{ conference: string; rows: Array<Record<string, unknown>> }> }>;
};

function standings(): Row[] {
  const file = load<StandingsFile>("standings-snapshot.json");
  const rows: Row[] = [];
  for (const [season, data] of Object.entries(file.seasons)) {
    for (const conf of data.conferences ?? []) {
      for (const r of conf.rows ?? []) {
        const wins = num(r.wins);
        const losses = num(r.losses);
        if (!wins && !losses) continue;
        rows.push({
          season,
          team: str(r.abbreviation),
          team_name: str(r.displayName),
          conference: str(r.conference) ?? conf.conference,
          conf_rank: num(r.rank),
          wins,
          losses,
          win_pct: num(r.winPct) != null ? Math.round((r.winPct as number) * 1000) / 1000 : null,
          games_behind: num(r.gamesBehind),
          ppg: num(r.ppg) != null ? Math.round((r.ppg as number) * 10) / 10 : null,
          opp_ppg: num(r.oppPpg) != null ? Math.round((r.oppPpg as number) * 10) / 10 : null,
          differential: num(r.differential) != null ? Math.round((r.differential as number) * 10) / 10 : null,
          home_record: str(r.homeRecord),
          road_record: str(r.roadRecord),
          last_ten: str(r.lastTen),
          streak: str(r.streak),
        });
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------- contracts

type SalaryCell = { amount: number; option?: "player" | "team"; notGuaranteed?: true } | null;
type ContractsFile = {
  teams: Record<string, { code: string; seasons: string[]; rows: Array<{ name: string; brefId: string; age?: number; years: SalaryCell[]; guaranteed: number | null }> }>;
};
type ContractValueFile = {
  players: Record<string, { team: string; years?: Array<[string, ...unknown[]]>; salary?: number; worth?: number; surplus?: number; low?: number; high?: number; pct?: number; reason?: string }>;
};

function contracts(brefNames: Map<string, string>): { contracts: Row[]; values: Row[] } {
  const file = load<ContractsFile>("bref-team-contracts-snapshot.json");
  const teamCode = new Map<string, string>();
  const contractRows: Row[] = [];
  for (const [teamId, team] of Object.entries(file.teams)) {
    teamCode.set(teamId, team.code);
    for (const r of team.rows) {
      brefNames.set(r.brefId, r.name);
      r.years.forEach((cell, i) => {
        if (!cell) return;
        contractRows.push({
          team: team.code,
          name: r.name,
          name_key: nameKeyOf(r.name),
          bref_id: r.brefId,
          age: num(r.age),
          season: team.seasons[i] ?? null,
          salary: num(cell.amount),
          option: cell.option ?? null,
          not_guaranteed: cell.notGuaranteed ? 1 : 0,
          guaranteed_total: num(r.guaranteed),
        });
      });
    }
  }
  const value = load<ContractValueFile>("contract-value-snapshot.json");
  const values: Row[] = [];
  for (const [key, r] of Object.entries(value.players)) {
    if (r.reason) continue;
    const brefId = key.slice(key.indexOf(":") + 1);
    const name = brefNames.get(brefId) ?? brefId;
    values.push({
      team: teamCode.get(r.team) ?? r.team,
      name,
      name_key: nameKeyOf(name),
      bref_id: brefId,
      salary: num(r.salary),
      worth: num(r.worth),
      surplus: num(r.surplus),
      surplus_low: num(r.low),
      surplus_high: num(r.high),
      percentile: num(r.pct),
      seasons: (r.years ?? []).map((y) => y[0]).join(","),
    });
  }
  return { contracts: contractRows, values };
}

// ---------------------------------------------------------------- transactions, awards

type TransactionsFile = { events: unknown[][] };

function transactions(): Row[] {
  const file = load<TransactionsFile>("transactions-snapshot.json");
  return file.events.map((e) => ({
    date: str(e[1]),
    season: str(e[2]),
    team: str(e[4]),
    description: str(e[5]),
    type: str(e[6]),
  }));
}

type AwardsFile = { names: Record<string, string>; slugs: Record<string, string>; players: Record<string, Array<[string, string, string?]>> };

function awards(file: AwardsFile): Row[] {
  const rows: Row[] = [];
  for (const [nbaId, list] of Object.entries(file.players)) {
    const name = file.names[nbaId] ?? "";
    for (const [award, season, detail] of list) {
      rows.push({ name, name_key: nameKeyOf(name), nba_id: nbaId, bref_id: file.slugs[nbaId] ?? null, award, season, detail: detail ?? null });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- players

type SearchFile = { players: Array<[string, string, string, string, number, string]> };
type AliasFile = { aliases: Array<{ espnPlayerId?: string; nbaPlayerId?: string; brefSlug?: string }> };

function players(awardsFile: AwardsFile, brefNames: Map<string, string>): Row[] {
  const search = load<SearchFile>("player-search-snapshot.json");
  const aliases = load<AliasFile>("player-id-aliases-snapshot.json");
  const nbaByEspn = new Map<string, string>();
  const brefByEspn = new Map<string, string>();
  for (const a of aliases.aliases) {
    if (a.espnPlayerId && a.nbaPlayerId) nbaByEspn.set(String(a.espnPlayerId), String(a.nbaPlayerId));
    if (a.espnPlayerId && a.brefSlug) brefByEspn.set(String(a.espnPlayerId), a.brefSlug.toLowerCase());
  }
  const brefByName = new Map<string, string>();
  for (const [bref, name] of brefNames) brefByName.set(nameKeyOf(name), bref);
  const nbaByName = new Map<string, string>();
  for (const [nbaId, name] of Object.entries(awardsFile.names)) nbaByName.set(nameKeyOf(name), nbaId);
  for (const [nbaId, slug] of Object.entries(awardsFile.slugs)) {
    const name = awardsFile.names[nbaId];
    if (name && !brefByName.has(nameKeyOf(name))) brefByName.set(nameKeyOf(name), slug);
  }

  return search.players.map(([espnId, name, team, lastSeason, , firstSeason]) => {
    const key = nameKeyOf(name);
    return {
      name,
      name_key: key,
      espn_id: espnId,
      nba_id: nbaByEspn.get(espnId) ?? nbaByName.get(key) ?? null,
      bref_id: brefByEspn.get(espnId) ?? brefByName.get(key) ?? null,
      team: str(team),
      first_season: str(firstSeason),
      last_season: str(lastSeason),
    };
  });
}

// ---------------------------------------------------------------- main

const brefNames = new Map<string, string>();
const awardsFile = load<AwardsFile>("player-awards-snapshot.json");
const { contracts: contractRows, values } = contracts(brefNames);
const tables: Record<string, Row[]> = {
  players: players(awardsFile, brefNames),
  player_seasons: playerSeasons(),
  drbl_ratings: drblRatings(),
  impact_ratings: impactRatings(),
  standings: standings(),
  contracts: contractRows,
  contract_value: values,
  transactions: transactions(),
  awards: awards(awardsFile),
};

const sql = [askSchemaDdl()];
for (const [name, rows] of Object.entries(tables)) sql.push(...inserts(name, rows));
mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, "ask-db.sql");
writeFileSync(out, sql.join("\n") + "\n");
for (const [name, rows] of Object.entries(tables)) console.log(`${name.padEnd(16)} ${rows.length}`);
console.log(`wrote ${path.relative(ROOT, out)}`);
