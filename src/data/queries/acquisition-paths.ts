/**
 * Server entry for "how did this team get him": wires the acquisition engine
 * to the ESPN transaction archive, the all-era player index, baked draft
 * lines and the current roster snapshot.
 */

import "server-only";

import { buildTransactionEventIndex } from "@/data/providers/transactions/transaction-event-index";
import { bundledRosterPlayerIds, getBundledCurrentTeamId } from "@/data/runtime/current-roster-snapshot";
import { bundledDraftPicks } from "@/data/runtime/draft-history-snapshot";
import { bundledPlayerDraftLines, getBundledPlayerBio } from "@/data/runtime/player-bio-snapshot";
import { findPlayerSearchRowByName, getPlayerSearchIndex } from "@/data/runtime/player-search-snapshot";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { ESPN_TEAM_NICKNAMES } from "@/sentiment/headline-entities";
import { createAcquisitionEngine, type AcquisitionEngine } from "@/trades/acquisition-engine";
import type {
  AcquisitionPayload,
  Arrival,
  DraftCandidate,
  DraftSlot,
  TeamAcquisitionEntry,
} from "@/trades/acquisition-types";

const OLD_ABBR_TEAM_IDS: Record<string, string> = {
  GS: "9",
  NY: "18",
  SA: "24",
  NO: "3",
  NOH: "3",
  NOK: "3",
  UTAH: "26",
  WSH: "27",
  WSB: "27",
  PHO: "21",
  SEA: "25",
  NJ: "17",
  NJN: "17",
  VAN: "29",
  // ESPN files the 1988–2002 Charlotte Hornets under the New Orleans id.
  CHH: "3",
  GOS: "9",
  PHL: "20",
  SAN: "24",
  UTH: "26",
};

function teamIdForAbbr(abbr: string): string | undefined {
  const upper = abbr.trim().toUpperCase();
  return OLD_ABBR_TEAM_IDS[upper] ?? resolveTeamBrand(upper)?.espnTeamId;
}

const DRAFT_LINE = /^(\d{4}): Rd (\d+), Pk (\d+)(?: \(([A-Z]+)\))?/;

function parseDraftLine(line: string | undefined): (DraftSlot & { teamId?: string }) | null {
  const m = line ? DRAFT_LINE.exec(line) : null;
  if (!m) return null;
  const teamId = m[4] ? teamIdForAbbr(m[4]) : undefined;
  return { year: Number(m[1]), round: Number(m[2]), pick: Number(m[3]), ...(teamId ? { teamId } : {}) };
}

function seasonOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function lastDraftYear(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

type DraftRecord = DraftSlot & { teamId?: string };

type DraftData = {
  byPlayer: Map<string, DraftRecord>;
  byTeam: Map<string, DraftCandidate[]>;
  draftees: Array<{ playerId: string; name: string }>;
};

let draftData: DraftData | null = null;

/**
 * Draft picks from the stats.nba.com bake (1990 on), with bio draft lines
 * filling older classes and players the bake could not match to an id.
 */
function loadDraftData(): DraftData {
  if (draftData) return draftData;
  const byPlayer = new Map<string, DraftRecord>();
  const byTeam = new Map<string, DraftCandidate[]>();
  const draftees: DraftData["draftees"] = [];
  const addCandidate = (teamId: string, slot: DraftSlot, candidate: DraftCandidate) => {
    const key = `${teamId}|${slot.year}|${slot.round}`;
    const list = byTeam.get(key) ?? [];
    const dup = list.some(
      (c) => c.pick === candidate.pick || (candidate.playerId && c.playerId === candidate.playerId)
    );
    if (!dup) byTeam.set(key, [...list, candidate]);
  };

  for (const pick of bundledDraftPicks()) {
    const teamId = teamIdForAbbr(pick.teamAbbr);
    const slot = { year: pick.year, round: pick.round, pick: pick.overall };
    const draftSeason = seasonOf(`${pick.year}-10-01`);
    const row = findPlayerSearchRowByName(pick.name, draftSeason);
    // A namesake whose career started before this draft is someone else.
    const match = row && (row.firstSeason ?? row.season) >= draftSeason ? row : null;
    if (match && !byPlayer.has(match.id)) {
      byPlayer.set(match.id, { ...slot, ...(teamId ? { teamId } : {}) });
      draftees.push({ playerId: match.id, name: match.name });
    }
    if (teamId) {
      addCandidate(teamId, slot, {
        label: match?.name ?? pick.name,
        ...(match ? { playerId: match.id } : {}),
        pick: slot.pick,
      });
    }
  }

  for (const row of bundledPlayerDraftLines()) {
    const slot = parseDraftLine(row.draft);
    if (!slot?.teamId) continue;
    const playerId = findPlayerSearchRowByName(row.name)?.id;
    addCandidate(slot.teamId, slot, { label: row.name, ...(playerId ? { playerId } : {}), pick: slot.pick });
  }
  for (const list of byTeam.values()) list.sort((a, b) => a.pick - b.pick);

  draftData = { byPlayer, byTeam, draftees };
  return draftData;
}

function draftOf(playerId: string): DraftRecord | null {
  return loadDraftData().byPlayer.get(playerId) ?? parseDraftLine(getBundledPlayerBio(playerId)?.draftInfo);
}

function draftedBy(teamId: string, year: number, round: number): DraftCandidate[] {
  return loadDraftData().byTeam.get(`${teamId}|${year}|${round}`) ?? [];
}

let cached: { builtAt: string; engine: AcquisitionEngine; ledgerThrough: string | null } | null = null;

async function getEngine() {
  const index = await buildTransactionEventIndex();
  if (cached?.builtAt === index.builtAt) return cached;
  const events = index.events
    .filter((e) => e.teamId && e.description)
    .map((e) => ({ id: e.id, date: e.date, teamId: e.teamId, description: e.description }));
  const engine = createAcquisitionEngine(events, {
    playerFor: (label, date) => {
      const row = findPlayerSearchRowByName(label, seasonOf(date));
      return row ? { playerId: row.id, name: row.name } : null;
    },
    draftOf,
    draftedBy,
    draftees: loadDraftData().draftees,
    currentTeamOf: (playerId) => getBundledCurrentTeamId(playerId),
    lastDraftYear: lastDraftYear(),
  });
  const ledgerThrough = events.reduce<string | null>((max, e) => (!max || e.date > max ? e.date : max), null);
  cached = { builtAt: index.builtAt, engine, ledgerThrough };
  return cached;
}

export function teamNicknames(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ESPN_TEAM_NICKNAMES).map(([id, names]) => [id, names[0] ?? id])
  );
}

/** Match key for a `player` query value: id, `p:` key or a typed name. */
export function acquisitionPlayerKey(value: string): string {
  const v = value.trim();
  if (/^(p|n|pick):/.test(v)) return v;
  if (/^\d+$/.test(v) || v.startsWith("bref:")) return `p:${v}`;
  const row = findPlayerSearchRowByName(v);
  if (row) return `p:${row.id}`;
  return `n:${v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

export async function getAcquisitionStory(options: {
  teamId: string;
  player: string;
  since?: string;
}): Promise<AcquisitionPayload> {
  const { engine, ledgerThrough } = await getEngine();
  return {
    story: engine.story(options.teamId, acquisitionPlayerKey(options.player), options.since),
    teamNames: teamNicknames(),
    ledgerThrough,
  };
}

export async function getTeamAcquisitionCatalog(teamId: string): Promise<TeamAcquisitionEntry[]> {
  const { engine } = await getEngine();
  return engine.teamCatalog(teamId);
}

let namesById: Map<string, string> | null = null;

/** Current roster: players with a logged arrival, and the rest by name. */
export async function getTeamRosterArrivals(teamId: string): Promise<{
  catalog: TeamAcquisitionEntry[];
  onRoster: TeamAcquisitionEntry[];
  notLogged: Array<{ playerId: string; name: string }>;
}> {
  const catalog = await getTeamAcquisitionCatalog(teamId);
  const onRoster = catalog.filter((e) => e.onRoster);
  const covered = new Set(onRoster.map((e) => e.playerId));
  namesById ??= new Map(getPlayerSearchIndex().map((r) => [r.id, r.name]));
  const notLogged = bundledRosterPlayerIds(teamId)
    .filter((id) => !covered.has(id))
    .flatMap((id) => {
      const name = namesById!.get(id);
      return name ? [{ playerId: id, name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { catalog, onRoster, notLogged };
}

/** Newest arrival with a team, trying each known id and then the name. */
export async function getPlayerArrival(options: {
  teamId: string;
  playerIds: Array<string | null | undefined>;
  name?: string | null;
}): Promise<{ arrival: Arrival; player: { label: string; playerId?: string } } | null> {
  const { engine } = await getEngine();
  const keys = [
    ...options.playerIds.filter((id): id is string => !!id).map((id) => `p:${id}`),
    ...(options.name ? [acquisitionPlayerKey(options.name)] : []),
  ];
  for (const key of new Set(keys)) {
    const story = engine.story(options.teamId, key);
    if (story && story.arrival.how !== "unknown") return { arrival: story.arrival, player: story.player };
  }
  return null;
}

export async function getLatestArrival(teamId: string, playerId: string): Promise<Arrival | null> {
  const { engine } = await getEngine();
  return engine.latestArrival(teamId, `p:${playerId}`);
}
