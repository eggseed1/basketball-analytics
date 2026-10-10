/**
 * Adds ESPN ↔ NBA id aliases for rostered players the crosswalk doesn't know
 * yet (rookies, two-ways, returning players). Additive only: existing rows are
 * never changed.
 *
 * Match rule: the NBA player index and an ESPN team roster agree on team, and
 * the normalized name is unique on both sides league-wide. Anything else is
 * skipped and counted.
 *
 * Writes (only when something new matched):
 * - data/impact/player-id-aliases.json
 * - src/data/runtime/player-id-aliases-snapshot.json
 *
 * Run: npx tsx scripts/sync-new-player-aliases.ts [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizePlayerName } from "../src/lib/player-name";

const ROOT = process.cwd();
const IMPACT = path.join(ROOT, "data/impact/player-id-aliases.json");
const SNAPSHOT = path.join(ROOT, "src/data/runtime/player-id-aliases-snapshot.json");
const PLAYER_INDEX = "https://cdn.nba.com/static/json/staticData/playerIndex.json";
const ESPN_ROSTER = (teamId: number) =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`;
const DRY_RUN = process.argv.includes("--dry-run");

const NBA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  Accept: "application/json, text/plain, */*",
};

const ESPN_TO_NBA_ABBR: Record<string, string> = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};

type Alias = {
  espnPlayerId: string;
  nbaPlayerId: string;
  playerName: string;
  matchMethod: string;
  confidence: string;
  productionApproved: boolean;
};

type AliasFile = { aliases?: Alias[] } & Record<string, unknown>;

type Rostered = { id: string; name: string; team: string };

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

async function nbaRostered(): Promise<Rostered[]> {
  const json = await fetchJson<{
    resultSets?: Array<{ headers: string[]; rowSet: unknown[][] }>;
  }>(PLAYER_INDEX, NBA_HEADERS);
  const set = json.resultSets?.[0];
  if (!set) throw new Error("playerIndex has no result set");
  const col = (name: string) => set.headers.indexOf(name);
  const [id, first, last, team, status] = [
    col("PERSON_ID"),
    col("PLAYER_FIRST_NAME"),
    col("PLAYER_LAST_NAME"),
    col("TEAM_ABBREVIATION"),
    col("ROSTER_STATUS"),
  ];
  return set.rowSet
    .filter((row) => Number(row[status]) === 1 && row[team])
    .map((row) => ({
      id: String(row[id]),
      name: `${row[first] ?? ""} ${row[last] ?? ""}`.trim(),
      team: String(row[team]),
    }));
}

async function espnRostered(): Promise<{ rows: Rostered[]; teams: number }> {
  const rows: Rostered[] = [];
  let teams = 0;
  for (let teamId = 1; teamId <= 30; teamId += 1) {
    try {
      const json = await fetchJson<{
        team?: { abbreviation?: string };
        athletes?: Array<{ id?: string | number; displayName?: string }>;
      }>(ESPN_ROSTER(teamId));
      const abbr = String(json.team?.abbreviation ?? "").toUpperCase();
      if (!abbr) continue;
      const team = ESPN_TO_NBA_ABBR[abbr] ?? abbr;
      for (const a of json.athletes ?? []) {
        const id = String(a.id ?? "").trim();
        const name = String(a.displayName ?? "").trim();
        if (id && name) rows.push({ id, name, team });
      }
      teams += 1;
    } catch (error) {
      console.warn(
        `[new-aliases] espn roster ${teamId} skipped: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }
  return { rows, teams };
}

function byUniqueName(rows: Rostered[]): Map<string, Rostered> {
  const seen = new Map<string, Rostered | null>();
  for (const row of rows) {
    const key = normalizePlayerName(row.name);
    if (!key) continue;
    seen.set(key, seen.has(key) ? null : row);
  }
  const out = new Map<string, Rostered>();
  for (const [key, row] of seen) if (row) out.set(key, row);
  return out;
}

async function main() {
  const impact = JSON.parse(await readFile(IMPACT, "utf8")) as AliasFile;
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as AliasFile;
  const known = [...(impact.aliases ?? []), ...(snapshot.aliases ?? [])];
  const knownNba = new Set(known.map((a) => String(a.nbaPlayerId)));
  const knownEspn = new Set(known.map((a) => String(a.espnPlayerId)));

  const nba = await nbaRostered();
  const espn = await espnRostered();
  if (nba.length < 400) throw new Error(`playerIndex returned ${nba.length} rostered players`);
  if (espn.teams < 25) throw new Error(`only ${espn.teams} ESPN rosters loaded`);

  const espnByName = byUniqueName(espn.rows);
  const nbaByName = byUniqueName(nba);
  const added: Alias[] = [];
  const skipped = { noEspnMatch: 0, teamMismatch: 0, espnIdTaken: 0, ambiguous: 0 };

  for (const player of nba) {
    if (knownNba.has(player.id)) continue;
    const key = normalizePlayerName(player.name);
    if (!nbaByName.has(key)) {
      skipped.ambiguous += 1;
      continue;
    }
    const match = espnByName.get(key);
    if (!match) {
      skipped.noEspnMatch += 1;
      continue;
    }
    if (match.team !== player.team) {
      skipped.teamMismatch += 1;
      continue;
    }
    if (knownEspn.has(match.id)) {
      skipped.espnIdTaken += 1;
      continue;
    }
    added.push({
      espnPlayerId: match.id,
      nbaPlayerId: player.id,
      playerName: match.name,
      matchMethod: "unique_name_same_team_roster",
      confidence: "HIGH_CONFIDENCE_MULTI_FIELD",
      productionApproved: true,
    });
    knownEspn.add(match.id);
  }

  console.log(
    `[new-aliases] nba rostered=${nba.length} espn rostered=${espn.rows.length} added=${added.length} skipped=${JSON.stringify(skipped)}`
  );
  for (const a of added) console.log(`[new-aliases] + ${a.playerName} nba ${a.nbaPlayerId} espn ${a.espnPlayerId}`);
  if (!added.length || DRY_RUN) return;

  impact.aliases = [...(impact.aliases ?? []), ...added];
  await writeFile(IMPACT, `${JSON.stringify(impact, null, 2)}\n`, "utf8");
  snapshot.aliases = [...(snapshot.aliases ?? []), ...added];
  await writeFile(SNAPSHOT, JSON.stringify(snapshot), "utf8");
}

main().catch((error) => {
  console.error(`[new-aliases] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
