import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { fetchEspnLeagueRosterPlayers } from "@/data/providers/nba/espn-roster-client";
import { normalizePlayerName } from "@/data/providers/salaries/salary-store";
import type { PlayerSeason } from "@/data/types";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  aggregateObservationBatches,
  aggregateTeamObservationBatches,
  mergeProfileSeries,
  type SentimentObservationBatch,
} from "@/sentiment/aggregate-observations";
import type {
  CuratedSentimentLane,
  LeagueSentimentSnapshot,
  PlayerSentimentProfile,
  SentimentCuratedSnapshot,
  SentimentProfileProvenance,
  SentimentSourceSummary,
  SentimentTopicHeatRow,
  TeamSentimentProfile,
} from "@/sentiment/curated-types";
import { FAN_LEXICON_VERSION, HEADLINE_LEXICON_VERSION } from "@/sentiment/headline-lexicon";
import { HEADLINE_MODEL_VERSION } from "@/sentiment/headline-model";
import type { SentimentHistoryFile } from "@/sentiment/game-reaction";
import {
  buildIngestLane,
  dailyScoreSeries,
  groupByEntity,
  latestExemplars,
  type LaneBuildOptions,
  type ScoredIngestItem,
} from "@/sentiment/ingest-aggregate";
import { loadIngestRoster } from "@/sentiment/ingest-roster";
import {
  readIngestItems,
  type FanPostIngestItem,
  type HeadlineToneItem,
  type NewsIngestItem,
  type RedditDailyItem,
} from "@/sentiment/ingest-store";
import type { SentimentPlatform } from "@/sentiment/types";
import {
  expandPilotProfilesFromRoster,
  profileKey,
  type PilotRosterSeed,
} from "@/sentiment/generate-pilot-profile";
import {
  computeSentimentDivergences,
  computeSentimentTopicHeat,
} from "@/sentiment/insights";
import { hydrateLeagueNarrativeHygiene } from "@/sentiment/narrative-hygiene";
import { enrichProfilesWithMovementAssociations } from "@/sentiment/movement-associations";
import { computeSentimentMovers } from "@/sentiment/movers";
import {
  computeRosterTeamProfiles,
  mergeTeamProfiles,
} from "@/sentiment/team-profiles";

export type SentimentSeedManifest = {
  methodologyVersion: string;
  status: string;
  disclaimer: string;
  pilotWindow: string;
  moverLimit: number;
  moverLookbackDays: number;
  coverageFloor: {
    mentionVolume: number;
    coverageConfidence: number;
  };
  ingest?: {
    windowDays: number;
    seriesDays: number;
    headlineFloor: number;
    redditFloor: number;
    /** Items needed for a fan lane across every fan source. Defaults to redditFloor. */
    fanFloor?: number;
    leagueHeadlineLimit: number;
    profileHeadlineLimit: number;
  };
};

const DEFAULT_INGEST: NonNullable<SentimentSeedManifest["ingest"]> = {
  windowDays: 7,
  seriesDays: 30,
  headlineFloor: 3,
  redditFloor: 5,
  leagueHeadlineLimit: 16,
  profileHeadlineLimit: 4,
};

const SEEDS_DIR = path.join(process.cwd(), "data", "sentiment", "seeds", "v1");
const OBSERVATIONS_DIR = path.join(
  process.cwd(),
  "data",
  "sentiment",
  "observations",
  "v1"
);
const SNAPSHOT_PATH = path.join(
  process.cwd(),
  "data",
  "sentiment",
  "v1",
  "snapshot.json"
);
/** Cloudflare Workers import this path — keep in sync with data/ on every build. */
const RUNTIME_SNAPSHOT_PATH = path.join(
  process.cwd(),
  "src",
  "data",
  "runtime",
  "sentiment-snapshot.json"
);

/** Per-player daily tone for the game-by-game view. Served as static assets. */
const HISTORY_DIR = path.join(process.cwd(), "public", "runtime", "sentiment-history");
/** Covers a full season plus the prior playoffs. */
const HISTORY_DAYS = 400;

function buildPlayerHistoryFiles(
  profiles: PlayerSentimentProfile[],
  newsByPlayer: Map<string, ScoredIngestItem[]>,
  fanByPlayer: Map<string, ScoredIngestItem[]>,
  now: Date
): Map<string, SentimentHistoryFile> {
  const sinceMs = now.getTime() - HISTORY_DAYS * 86_400_000;
  const collect = (byPlayer: Map<string, ScoredIngestItem[]>, ids: string[]) => {
    const byId = new Map<string, ScoredIngestItem>();
    for (const id of ids) {
      for (const item of byPlayer.get(id) ?? []) byId.set(item.id, item);
    }
    return dailyScoreSeries([...byId.values()], sinceMs, now.getTime());
  };
  const files = new Map<string, SentimentHistoryFile>();
  for (const profile of profiles) {
    const fan = collect(fanByPlayer, profile.playerIds);
    const media = collect(newsByPlayer, profile.playerIds);
    if (!fan.length && !media.length) continue;
    const file: SentimentHistoryFile = {
      playerIds: profile.playerIds,
      builtAt: now.toISOString(),
      fan,
      media,
    };
    for (const id of profile.playerIds) files.set(id, file);
  }
  return files;
}

function writePlayerHistoryFiles(files: Map<string, SentimentHistoryFile>) {
  mkdirSync(HISTORY_DIR, { recursive: true });
  for (const name of readdirSync(HISTORY_DIR)) {
    if (name.endsWith(".json") && !files.has(name.slice(0, -5))) {
      rmSync(path.join(HISTORY_DIR, name));
    }
  }
  for (const [id, file] of files) {
    writeFileSync(path.join(HISTORY_DIR, `${id}.json`), `${JSON.stringify(file)}\n`);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function buildRosterIndex(roster: PlayerSeason[]): {
  byId: Map<string, PlayerSeason>;
  byName: Map<string, PlayerSeason>;
} {
  const byId = new Map<string, PlayerSeason>();
  const byName = new Map<string, PlayerSeason>();
  for (const row of roster) {
    byId.set(row.playerId, row);
    const key = normalizePlayerName(row.playerName);
    if (key && !byName.has(key)) byName.set(key, row);
  }
  return { byId, byName };
}

function playerIdSet(
  playerIds: string[],
  identity: Awaited<ReturnType<typeof resolvePlayerIdentity>> | null
): Set<string> {
  const ids = new Set(playerIds);
  if (identity?.nbaId) ids.add(identity.nbaId);
  if (identity?.espnId) ids.add(identity.espnId);
  if (identity?.routeId) ids.add(identity.routeId);
  return ids;
}

async function findRosterRow(
  profile: PlayerSentimentProfile,
  rosterIndex: ReturnType<typeof buildRosterIndex>
): Promise<PlayerSeason | null> {
  for (const id of profile.playerIds) {
    const identity = await resolvePlayerIdentity(id);
    const ids = playerIdSet(profile.playerIds, identity);
    for (const candidate of ids) {
      const hit = rosterIndex.byId.get(candidate);
      if (hit) return hit;
    }
    if (identity?.displayName) {
      const byName = rosterIndex.byName.get(
        normalizePlayerName(identity.displayName)
      );
      if (byName) return byName;
    }
  }
  if (profile.displayName) {
    return rosterIndex.byName.get(normalizePlayerName(profile.displayName)) ?? null;
  }
  return null;
}

function syncProfileTeamFromRoster(
  profile: PlayerSentimentProfile,
  rosterRow: PlayerSeason
): PlayerSentimentProfile {
  // Prefer ESPN roster id first so home/movers/team links hit /players/{espnId}.
  const playerIds = [
    rosterRow.playerId,
    ...profile.playerIds.filter((id) => id !== rosterRow.playerId),
  ];
  return {
    ...profile,
    playerIds,
    displayName: rosterRow.playerName || profile.displayName,
    teamKey: rosterRow.teamId,
  };
}

function curatedLanePasses(
  lane: CuratedSentimentLane | undefined,
  floor: SentimentSeedManifest["coverageFloor"]
): boolean {
  return Boolean(
    lane &&
      lane.mentionVolume >= floor.mentionVolume &&
      lane.coverageConfidence >= floor.coverageConfidence
  );
}

/**
 * Automated lanes are floored when built. Curated lanes use the manifest
 * floor. A lane below its floor is removed (blank, not neutral).
 */
function applyLaneFloors<T extends { fan?: CuratedSentimentLane; media?: CuratedSentimentLane }>(
  profile: T,
  floor: SentimentSeedManifest["coverageFloor"]
): T | null {
  const keep = (lane?: CuratedSentimentLane) =>
    lane && (lane.origin !== "curated" || curatedLanePasses(lane, floor)) ? lane : undefined;
  const fan = keep(profile.fan);
  const media = keep(profile.media);
  if (!fan && !media) return null;
  return { ...profile, fan, media };
}

function lastSeriesDate(points?: { date: string }[]): string | undefined {
  return points?.length ? points[points.length - 1]!.date : undefined;
}

function tagCuratedLanes<
  T extends {
    fan?: CuratedSentimentLane;
    media?: CuratedSentimentLane;
    series?: { fan: { date: string }[]; media: { date: string }[] };
  },
>(profile: T, fallbackAsOf: string | undefined): T {
  const tag = (lane: CuratedSentimentLane | undefined, points?: { date: string }[]) =>
    lane && !lane.origin
      ? { ...lane, origin: "curated" as const, asOf: lastSeriesDate(points) ?? fallbackAsOf }
      : lane;
  return {
    ...profile,
    fan: tag(profile.fan, profile.series?.fan),
    media: tag(profile.media, profile.series?.media),
  };
}

type DrblOverlayRow = [string, string, string, number | null, number | null, number];

/** Raw overlay rows so a null DRBL/100 stays blank instead of becoming 0. */
function attachPerformance(
  profiles: PlayerSentimentProfile[],
  season: string,
  minPossessions = 1000
): PlayerSentimentProfile[] {
  const overlayPath = path.join(process.cwd(), "src", "data", "runtime", "drbl-overlay-snapshot.json");
  if (!existsSync(overlayPath)) return profiles;
  const overlay = readJson<{ seasons?: Record<string, unknown[][]> }>(overlayPath);
  const byName = new Map<string, { drbl100: number; possessions: number }>();
  for (const raw of overlay.seasons?.[season] ?? []) {
    const row = raw as unknown as DrblOverlayRow;
    if (typeof row[1] !== "string" || typeof row[3] !== "number") continue;
    if (row[5] < minPossessions) continue;
    const key = normalizePlayerName(row[1]);
    const prev = byName.get(key);
    if (!prev || row[5] > prev.possessions) {
      byName.set(key, { drbl100: row[3], possessions: row[5] });
    }
  }
  return profiles.map((profile) => {
    const hit = profile.displayName ? byName.get(normalizePlayerName(profile.displayName)) : undefined;
    return hit ? { ...profile, performance: { season, ...hit } } : profile;
  });
}

/** Model ratings keyed by `${store}:${rowId}`, then player id. */
type HeadlineTones = Map<string, Record<string, -1 | 0 | 1>>;

function loadHeadlineTones(): HeadlineTones {
  const out: HeadlineTones = new Map();
  for (const row of readIngestItems<HeadlineToneItem>("headline-tones")) {
    const key = `${row.store}:${row.rowId}`;
    out.set(key, { ...out.get(key), [row.playerId]: row.tone });
  }
  return out;
}

function newsToScored(
  rows: NewsIngestItem[],
  store: "news" | "fanblogs",
  tones: HeadlineTones,
  platform?: SentimentPlatform
): ScoredIngestItem[] {
  return rows.map((row) => {
    const playerScores = tones.get(`${store}:${row.id}`);
    return {
      id: row.id,
      date: row.publishedAt,
      score: row.score,
      topics: row.topics,
      playerIds: row.playerIds,
      teamIds: row.teamIds,
      ...(platform ? { platform } : {}),
      ...(playerScores ? { playerScores } : {}),
    };
  });
}

function headlineRatingSummary(
  items: ScoredIngestItem[],
  now: Date,
  windowDays: number
): { toneModel?: string; ratedShare?: number } {
  const since = now.getTime() - windowDays * 86_400_000;
  let mentions = 0;
  let rated = 0;
  for (const item of items) {
    if (Date.parse(item.date) <= since) continue;
    mentions += item.playerIds.length;
    rated += item.playerIds.filter((id) => item.playerScores?.[id] !== undefined).length;
  }
  if (!rated) return {};
  return { toneModel: HEADLINE_MODEL_VERSION, ratedShare: Math.round((rated / mentions) * 100) / 100 };
}

/** The model rating for a news headline that names exactly one player. */
function singlePlayerRating(
  row: NewsIngestItem,
  tones: HeadlineTones
): { rating?: -1 | 0 | 1 } {
  if (row.playerIds.length !== 1) return {};
  const rating = tones.get(`news:${row.id}`)?.[row.playerIds[0]!];
  return rating !== undefined ? { rating } : {};
}

/** Which scorer produced a player's headline lane over the current window. */
function playerHeadlineModelVersion(
  items: ScoredIngestItem[],
  playerId: string,
  now: Date,
  windowDays: number
): string {
  const since = now.getTime() - windowDays * 86_400_000;
  const current = items.filter((item) => Date.parse(item.date) > since);
  const rated = current.filter((item) => item.playerScores?.[playerId] !== undefined).length;
  if (!rated) return HEADLINE_LEXICON_VERSION;
  if (rated === current.length) return HEADLINE_MODEL_VERSION;
  return `${HEADLINE_MODEL_VERSION}+${HEADLINE_LEXICON_VERSION}`;
}

/**
 * Reddit is stored as daily averages, so each row becomes `posts` items at
 * its mean score. Counts, floors, means and daily series match what per-post
 * rows would give; topic counts are spread across the items.
 */
function redditDailyToScored(rows: RedditDailyItem[]): ScoredIngestItem[] {
  const out: ScoredIngestItem[] = [];
  for (const row of rows) {
    const topics = Object.entries(row.topicCounts).flatMap(([topic, n]) =>
      Array.from({ length: n }, () => topic)
    );
    for (let i = 0; i < row.posts; i += 1) {
      out.push({
        id: `reddit:${row.id}:${i}`,
        date: `${row.date}T12:00:00.000Z`,
        score: row.meanScore,
        topics: topics.filter((_, t) => t % row.posts === i),
        playerIds: row.scope === "player" ? [row.entityId] : [],
        teamIds: row.scope === "team" ? [row.entityId] : [],
        platform: "reddit",
      });
    }
  }
  return out;
}

function fanPostsToScored(
  rows: FanPostIngestItem[],
  platform: SentimentPlatform
): ScoredIngestItem[] {
  return rows.map((row) => ({
    id: `${platform}:${row.id}`,
    date: row.createdAt,
    score: row.score,
    topics: row.topics,
    playerIds: row.playerIds,
    teamIds: row.teamIds,
    platform,
    // Rows from before video ids were kept fall back to channel + day.
    ...(row.platform === "youtube"
      ? { conversation: row.thread ?? `${row.source}|${row.createdAt.slice(0, 10)}` }
      : {}),
  }));
}

function headlineExemplars(
  ids: string[],
  byId: Map<string, NewsIngestItem>,
  limit: number,
  ratingFor?: (rowId: string) => -1 | 0 | 1 | undefined
) {
  return latestExemplars(
    ids
      .map((id) => byId.get(id))
      .filter((row): row is NewsIngestItem => Boolean(row))
      .map((row) => {
        const rating = ratingFor?.(row.id);
        return {
          title: row.title,
          url: row.url,
          outlet: row.outlet,
          publishedAt: row.publishedAt,
          score: row.score,
          ...(rating !== undefined ? { rating } : {}),
        };
      }),
    limit
  );
}

function headlineTopicHeat(
  items: ScoredIngestItem[],
  now: Date,
  windowDays: number,
  limit: number
): SentimentTopicHeatRow[] {
  const since = now.getTime() - windowDays * 86_400_000;
  const acc = new Map<string, { count: number; players: Set<string> }>();
  let total = 0;
  for (const item of items) {
    const t = Date.parse(item.date);
    if (t <= since || t > now.getTime()) continue;
    for (const topic of item.topics) {
      if (topic === "general") continue;
      const hit = acc.get(topic) ?? { count: 0, players: new Set<string>() };
      hit.count += 1;
      for (const id of item.playerIds) hit.players.add(id);
      acc.set(topic, hit);
      total += 1;
    }
  }
  if (!total) return [];
  return [...acc.entries()]
    .map(([topic, row]) => ({
      topic,
      weight: Math.round((row.count / total) * 1000) / 1000,
      playerCount: row.players.size,
      mentionVolume: row.count,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

function loadObservationBatches(): SentimentObservationBatch[] {
  if (!existsSync(OBSERVATIONS_DIR)) return [];
  const files = readdirSync(OBSERVATIONS_DIR).filter(
    (name) =>
      name.endsWith(".json") &&
      !name.startsWith("_") &&
      !name.includes(".example.")
  );
  const batches: SentimentObservationBatch[] = [];
  for (const file of files) {
    try {
      batches.push(
        readJson<SentimentObservationBatch>(path.join(OBSERVATIONS_DIR, file))
      );
    } catch {
      // skip malformed batch files during scaffold phase
    }
  }
  return batches;
}

function mergeObservationProfiles(
  seedProfiles: PlayerSentimentProfile[],
  observationProfiles: PlayerSentimentProfile[],
  floor: SentimentSeedManifest["coverageFloor"]
): { profiles: PlayerSentimentProfile[]; observationKeys: Set<string> } {
  const observationKeys = new Set<string>();
  if (!observationProfiles.length) {
    return { profiles: seedProfiles, observationKeys };
  }
  const byId = new Map<string, PlayerSentimentProfile>();
  for (const profile of seedProfiles) {
    for (const id of profile.playerIds) byId.set(id, profile);
  }

  const lanePasses = (lane: PlayerSentimentProfile["fan"]) => curatedLanePasses(lane, floor);

  const profileDedupeKey = (profile: PlayerSentimentProfile) =>
    profile.playerIds.slice().sort().join("|");

  for (const profile of observationProfiles) {
    for (const id of profile.playerIds) {
      const existing = byId.get(id);
      if (existing) {
        const fanFromObs = lanePasses(profile.fan);
        const mediaFromObs = lanePasses(profile.media);
        const merged = {
          ...existing,
          fan: fanFromObs ? profile.fan : existing.fan,
          media: mediaFromObs ? profile.media : existing.media,
          series: mergeProfileSeries(existing.series, profile.series),
        };
        if (fanFromObs || mediaFromObs) {
          observationKeys.add(profileDedupeKey(merged));
        }
        for (const aliasId of existing.playerIds) byId.set(aliasId, merged);
        for (const aliasId of profile.playerIds) byId.set(aliasId, merged);
      } else if (lanePasses(profile.fan) && lanePasses(profile.media)) {
        byId.set(id, profile);
        observationKeys.add(profileDedupeKey(profile));
      }
    }
  }
  const merged = new Map<string, PlayerSentimentProfile>();
  for (const profile of byId.values()) {
    const key = profileDedupeKey(profile);
    if (!merged.has(key)) merged.set(key, profile);
  }
  return { profiles: [...merged.values()], observationKeys };
}

function tagProfileProvenance(
  profiles: PlayerSentimentProfile[],
  handCraftedKeys: Set<string>,
  observationKeys: Set<string>
): PlayerSentimentProfile[] {
  return profiles.map((profile) => {
    const key = profileKey(profile);
    const dedupeKey = profile.playerIds.slice().sort().join("|");
    let provenance: SentimentProfileProvenance;
    if (observationKeys.has(dedupeKey)) {
      provenance = "observation";
    } else if (handCraftedKeys.has(key)) {
      provenance = "hand_crafted";
    } else {
      provenance = "generated";
    }
    return { ...profile, provenance };
  });
}

export type BuildSentimentSnapshotOptions = {
  now?: Date;
  dryRun?: boolean;
  verbose?: boolean;
};

export type BuildSentimentSnapshotResult = {
  snapshot: SentimentCuratedSnapshot;
  rosterPlayerCount: number;
  syncedTeamCount: number;
  droppedBelowFloor: number;
  observationBatchCount: number;
  generatedProfileCount: number;
  outputPath: string;
};

export async function buildSentimentSnapshot(
  options: BuildSentimentSnapshotOptions = {}
): Promise<BuildSentimentSnapshotResult> {
  const now = options.now ?? new Date();
  const manifest = readJson<SentimentSeedManifest>(
    path.join(SEEDS_DIR, "manifest.json")
  );
  const seedProfiles = readJson<PlayerSentimentProfile[]>(
    path.join(SEEDS_DIR, "pilot-profiles.json")
  );
  const pilotRosterPath = path.join(SEEDS_DIR, "pilot-roster.json");
  const pilotRoster = existsSync(pilotRosterPath)
    ? readJson<PilotRosterSeed>(pilotRosterPath)
    : null;
  const leagueSeed = readJson<LeagueSentimentSnapshot>(
    path.join(SEEDS_DIR, "league.json")
  );
  const league = await hydrateLeagueNarrativeHygiene(leagueSeed);

  const season = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const snapshotDate = now.toISOString().slice(0, 10);

  const roster = await fetchEspnLeagueRosterPlayers(season).catch(() => []);
  const rosterIndex = buildRosterIndex(roster);

  const handCraftedKeys = new Set(seedProfiles.map((profile) => profileKey(profile)));

  let generatedProfileCount = 0;
  let baseProfiles = seedProfiles;
  if (pilotRoster) {
    const expanded = await expandPilotProfilesFromRoster({
      pilotRoster,
      handCrafted: seedProfiles,
      rosterIndex,
    });
    baseProfiles = expanded.profiles;
    generatedProfileCount = expanded.generated;
  }

  const observationBatches = loadObservationBatches();
  const observationProfiles = aggregateObservationBatches(
    observationBatches,
    manifest.pilotWindow
  );
  const merged = mergeObservationProfiles(
    baseProfiles,
    observationProfiles,
    manifest.coverageFloor
  );
  let profiles = tagProfileProvenance(
    merged.profiles,
    handCraftedKeys,
    merged.observationKeys
  );

  const curatedAsOf = pilotRoster?.endDate;
  let syncedTeamCount = 0;
  const synced: PlayerSentimentProfile[] = [];
  for (const profile of profiles) {
    const rosterRow = await findRosterRow(profile, rosterIndex);
    const next = rosterRow
      ? syncProfileTeamFromRoster(profile, rosterRow)
      : profile;
    if (rosterRow) syncedTeamCount += 1;
    synced.push(tagCuratedLanes(next, curatedAsOf));
  }
  profiles = synced;

  // Automated lanes: national headlines → media; fan blogs, Bluesky, YouTube
  // comments and Reddit → fan. Each replaces the curated lane only when it
  // clears its own floor.
  const ingestConfig = { ...DEFAULT_INGEST, ...manifest.ingest };
  const fanFloor = ingestConfig.fanFloor ?? ingestConfig.redditFloor;
  const newsRows = readIngestItems<NewsIngestItem>("news").filter((row) => row.nba);
  const redditRows = readIngestItems<RedditDailyItem>("reddit");
  const redditLeagueRows = redditRows.filter((row) => row.scope === "league");
  const redditPostCount = redditLeagueRows.reduce((sum, row) => sum + row.posts, 0);
  const fanBlogRows = readIngestItems<NewsIngestItem>("fanblogs").filter((row) => row.nba);
  const blueskyRows = readIngestItems<FanPostIngestItem>("bluesky");
  const youtubeRows = readIngestItems<FanPostIngestItem>("youtube");
  const newsById = new Map(newsRows.map((row) => [row.id, row]));
  const headlineTones = loadHeadlineTones();
  const newsScored = newsToScored(newsRows, "news", headlineTones);
  const fanPostScored = [
    ...newsToScored(fanBlogRows, "fanblogs", headlineTones, "fan_blog"),
    ...fanPostsToScored(blueskyRows, "bluesky"),
    ...fanPostsToScored(youtubeRows, "youtube"),
  ];
  // Player and team lanes read Reddit's per-entity rows; league mood and
  // source counts read its league rows, so no post is counted twice.
  const fanScored = [
    ...redditDailyToScored(redditRows.filter((row) => row.scope !== "league")),
    ...fanPostScored,
  ];
  const fanScoredLeague = [...redditDailyToScored(redditLeagueRows), ...fanPostScored];
  const laneOptions = (
    origin: "headlines" | "fans",
    floor: number
  ): LaneBuildOptions => ({
    origin,
    platform: origin === "headlines" ? "news" : "other",
    modelVersion: origin === "headlines" ? HEADLINE_LEXICON_VERSION : FAN_LEXICON_VERSION,
    now,
    windowDays: ingestConfig.windowDays,
    seriesDays: ingestConfig.seriesDays,
    floor,
  });
  const headlineOpts = laneOptions("headlines", ingestConfig.headlineFloor);
  const fanOpts = laneOptions("fans", fanFloor);

  const ingestRoster = new Map(loadIngestRoster().map((row) => [row.playerId, row]));
  const profileById = new Map<string, PlayerSentimentProfile>();
  for (const profile of profiles) {
    for (const id of profile.playerIds) profileById.set(id, profile);
  }
  const upsertPlayer = (
    playerId: string,
    patch: (profile: PlayerSentimentProfile) => PlayerSentimentProfile
  ) => {
    const existing = profileById.get(playerId);
    const rosterRow = rosterIndex.byId.get(playerId);
    const ingestRow = ingestRoster.get(playerId);
    const base: PlayerSentimentProfile = existing ?? {
      playerIds: [playerId],
      displayName: rosterRow?.playerName ?? ingestRow?.name ?? playerId,
      teamKey: rosterRow?.teamId ?? ingestRow?.teamId,
      window: `${ingestConfig.windowDays}d`,
      provenance: "ingest",
      series: { fan: [], media: [] },
    };
    const next = patch(base);
    for (const id of next.playerIds) profileById.set(id, next);
  };

  const newsByPlayer = groupByEntity(newsScored, "playerIds");
  const fanByPlayer = groupByEntity(fanScored, "playerIds");
  let headlineLaneCount = 0;
  for (const [playerId, items] of newsByPlayer) {
    const built = buildIngestLane(items, {
      ...headlineOpts,
      modelVersion: playerHeadlineModelVersion(items, playerId, now, ingestConfig.windowDays),
    });
    if (!built) continue;
    headlineLaneCount += 1;
    upsertPlayer(playerId, (profile) => ({
      ...profile,
      media: built.lane,
      series: { fan: profile.series?.fan ?? [], media: built.series },
      headlines: headlineExemplars(
        items.map((item) => item.id),
        newsById,
        ingestConfig.profileHeadlineLimit,
        (rowId) => headlineTones.get(`news:${rowId}`)?.[playerId]
      ),
    }));
  }
  let fanLaneCount = 0;
  for (const [playerId, items] of fanByPlayer) {
    const built = buildIngestLane(items, fanOpts);
    if (!built) continue;
    fanLaneCount += 1;
    upsertPlayer(playerId, (profile) => ({
      ...profile,
      fan: built.lane,
      series: { fan: built.series, media: profile.series?.media ?? [] },
    }));
  }

  const uniqueProfiles = new Map<string, PlayerSentimentProfile>();
  for (const profile of profileById.values()) {
    uniqueProfiles.set(profile.playerIds.slice().sort().join("|"), profile);
  }
  const idOwner = new Map<string, string>();
  for (const profile of uniqueProfiles.values()) {
    for (const id of profile.playerIds) {
      const owner = idOwner.get(id);
      if (owner && owner !== profile.displayName) {
        throw new Error(
          `Sentiment player id ${id} is claimed by both ${owner} and ${profile.displayName}. Fix the seed ids.`
        );
      }
      idOwner.set(id, profile.displayName ?? id);
    }
  }
  const beforeFloor = uniqueProfiles.size;
  profiles = [...uniqueProfiles.values()]
    .map((profile) => applyLaneFloors(profile, manifest.coverageFloor))
    .filter((profile): profile is PlayerSentimentProfile => profile != null);
  const droppedBelowFloor = beforeFloor - profiles.length;

  profiles = attachPerformance(
    profiles,
    canonicalSeasonFromStartYear(currentNbaStartYear(now) - 1)
  );
  profiles = await enrichProfilesWithMovementAssociations(profiles);
  const historyFiles = buildPlayerHistoryFiles(profiles, newsByPlayer, fanByPlayer, now);

  const movers = computeSentimentMovers(profiles, {
    limit: manifest.moverLimit,
    lookbackDays: manifest.moverLookbackDays,
  });
  const divergences = computeSentimentDivergences(profiles, {
    limit: 8,
    minAbsGap: 0.12,
  });
  const headlineWindowCount = newsScored.filter(
    (item) => Date.parse(item.date) > now.getTime() - ingestConfig.windowDays * 86_400_000
  ).length;
  const topicHeat =
    headlineWindowCount >= 20
      ? headlineTopicHeat(newsScored, now, ingestConfig.windowDays, 12)
      : computeSentimentTopicHeat(profiles, { limit: 12 });
  const topicHeatOrigin = headlineWindowCount >= 20 ? "headlines" : "curated";

  const teamObservationProfiles = aggregateTeamObservationBatches(
    observationBatches,
    manifest.pilotWindow
  ).map((team) => tagCuratedLanes(team, curatedAsOf));
  const rosterTeamProfiles = computeRosterTeamProfiles(
    profiles,
    manifest.pilotWindow
  );
  const teamByKey = new Map<string, TeamSentimentProfile>();
  for (const team of mergeTeamProfiles(rosterTeamProfiles, teamObservationProfiles)) {
    teamByKey.set(team.teamKey ?? team.teamIds[0]!, team);
  }
  const upsertTeam = (
    teamId: string,
    patch: (team: TeamSentimentProfile) => TeamSentimentProfile
  ) => {
    const brandAbbr = resolveTeamBrand(teamId)?.abbr ?? teamId;
    const base: TeamSentimentProfile = teamByKey.get(teamId) ?? {
      teamIds: [teamId],
      teamKey: teamId,
      displayName: brandAbbr,
      window: `${ingestConfig.windowDays}d`,
      source: "headlines",
      provenance: "ingest",
      series: { fan: [], media: [] },
    };
    teamByKey.set(teamId, patch(base));
  };
  for (const [teamId, items] of groupByEntity(newsScored, "teamIds")) {
    const built = buildIngestLane(items, headlineOpts);
    if (!built) continue;
    upsertTeam(teamId, (team) => ({
      ...team,
      media: built.lane,
      series: { fan: team.series?.fan ?? [], media: built.series },
      headlines: headlineExemplars(
        items.map((item) => item.id),
        newsById,
        ingestConfig.profileHeadlineLimit
      ),
    }));
  }
  for (const [teamId, items] of groupByEntity(fanScored, "teamIds")) {
    const built = buildIngestLane(items, fanOpts);
    if (!built) continue;
    upsertTeam(teamId, (team) => ({
      ...team,
      fan: built.lane,
      series: { fan: built.series, media: team.series?.media ?? [] },
    }));
  }
  const teams = [...teamByKey.values()]
    .map((team) => applyLaneFloors(team, manifest.coverageFloor))
    .filter((team): team is TeamSentimentProfile => team != null)
    .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));

  const canonicalName = new Map<string, { name: string; teamKey?: string }>();
  for (const profile of profiles) {
    for (const id of profile.playerIds) {
      if (profile.displayName) canonicalName.set(id, { name: profile.displayName, teamKey: profile.teamKey });
    }
  }
  const byFoldedName = new Map(
    profiles
      .filter((profile) => profile.displayName)
      .map((profile) => [normalizePlayerName(profile.displayName!), profile])
  );
  league.narratives = league.narratives.map((narrative) => ({
    ...narrative,
    players: narrative.players.map((player) => {
      const hit =
        canonicalName.get(player.playerId) ??
        (() => {
          const profile = byFoldedName.get(normalizePlayerName(player.displayName));
          return profile ? { name: profile.displayName!, teamKey: profile.teamKey } : undefined;
        })();
      return hit
        ? { ...player, displayName: hit.name, teamKey: hit.teamKey ?? player.teamKey }
        : player;
    }),
  }));

  const leagueHeadlineLane = buildIngestLane(newsScored, { ...headlineOpts, floor: 1 });
  const leagueFanLane = buildIngestLane(fanScoredLeague, { ...fanOpts, floor: 1 });
  league.headlineMood = leagueHeadlineLane ?? undefined;
  league.fanMood = leagueFanLane ?? undefined;
  delete league.redditMood;
  league.mood = {
    fan: tagCuratedLanes({ fan: league.mood.fan }, lastSeriesDate(league.moodSeries?.fan)).fan!,
    media: tagCuratedLanes({ media: league.mood.media }, lastSeriesDate(league.moodSeries?.media))
      .media!,
  };
  league.latestHeadlines = latestExemplars(
    newsRows.map((row) => ({
      title: row.title,
      url: row.url,
      outlet: row.outlet,
      publishedAt: row.publishedAt,
      score: row.score,
      ...singlePlayerRating(row, headlineTones),
      players: row.playerIds.map((id) => ({
        id,
        name:
          canonicalName.get(id)?.name ??
          rosterIndex.byId.get(id)?.playerName ??
          ingestRoster.get(id)?.name ??
          id,
      })),
      teamIds: row.teamIds,
      topics: row.topics,
    })),
    ingestConfig.leagueHeadlineLimit
  );

  const newsDates = newsRows.map((row) => row.publishedAt.slice(0, 10)).sort();
  const redditDates = redditLeagueRows.map((row) => row.date).sort();
  const fanDates = fanScoredLeague.map((item) => item.date.slice(0, 10)).sort();
  const fanPlatformCounts: Partial<Record<SentimentPlatform, number>> = {};
  for (const item of fanScoredLeague) {
    if (item.platform) fanPlatformCounts[item.platform] = (fanPlatformCounts[item.platform] ?? 0) + 1;
  }
  const curatedLaneCount = profiles.reduce(
    (sum, p) => sum + (p.fan?.origin === "curated" ? 1 : 0) + (p.media?.origin === "curated" ? 1 : 0),
    0
  );
  const sources: SentimentSourceSummary = {
    curated: { asOf: curatedAsOf ?? null, laneCount: curatedLaneCount },
    headlines: {
      asOf: newsDates[newsDates.length - 1] ?? null,
      firstDate: newsDates[0] ?? null,
      itemCount: newsRows.length,
      windowItemCount: headlineWindowCount,
      outlets: [...new Set(newsRows.map((row) => row.outlet))].sort(),
      modelVersion: HEADLINE_LEXICON_VERSION,
      floor: ingestConfig.headlineFloor,
      laneCount: headlineLaneCount,
      ...headlineRatingSummary(newsScored, now, ingestConfig.windowDays),
    },
    reddit: {
      configured: redditPostCount > 0,
      asOf: redditDates[redditDates.length - 1] ?? null,
      itemCount: redditPostCount,
      floor: ingestConfig.redditFloor,
      laneCount: redditPostCount ? fanLaneCount : 0,
    },
    fans: {
      asOf: fanDates[fanDates.length - 1] ?? null,
      firstDate: fanDates[0] ?? null,
      itemCount: fanScoredLeague.length,
      windowItemCount: fanScoredLeague.filter(
        (item) => Date.parse(item.date) > now.getTime() - ingestConfig.windowDays * 86_400_000
      ).length,
      platforms: fanPlatformCounts,
      blogCount: new Set(fanBlogRows.map((row) => row.feedId)).size,
      floor: fanFloor,
      laneCount: fanLaneCount,
    },
  };

  const snapshot: SentimentCuratedSnapshot = {
    meta: {
      methodologyVersion: manifest.methodologyVersion,
      status: manifest.status,
      season,
      disclaimer: manifest.disclaimer,
      snapshotDate,
      builtAt: now.toISOString(),
      rosterPlayerCount: roster.length,
      pilotProfileCount: profiles.length,
      observationBatchCount: observationBatches.length,
      observationBatchIds: observationBatches.map((batch) => batch.batchId),
      teamProfileCount: teams.length,
      movers: {
        window: manifest.pilotWindow,
        lookbackDays: manifest.moverLookbackDays,
        risers: movers.risers,
        fallers: movers.fallers,
      },
      divergences: {
        window: manifest.pilotWindow,
        minAbsGap: 0.12,
        rows: divergences,
      },
      topicHeat,
      topicHeatOrigin,
      sources,
    },
    players: profiles,
    teams,
    league,
  };

  if (!options.dryRun) {
    const body = `${JSON.stringify(snapshot, null, 2)}\n`;
    writeFileSync(SNAPSHOT_PATH, body);
    writeFileSync(RUNTIME_SNAPSHOT_PATH, body);
    writePlayerHistoryFiles(historyFiles);
  }

  if (options.verbose) {
    console.log(
      `sentiment:build season=${season} profiles=${profiles.length} generated=${generatedProfileCount} roster=${roster.length} synced=${syncedTeamCount} dropped=${droppedBelowFloor} observations=${observationBatches.length} headlines=${newsRows.length} (window ${headlineWindowCount}, lanes ${headlineLaneCount}) fans=${fanScoredLeague.length} (reddit ${redditPostCount}, blogs ${fanBlogRows.length}, bluesky ${blueskyRows.length}, youtube ${youtubeRows.length}; lanes ${fanLaneCount}) teams=${teams.length}`
    );
    if (!options.dryRun) {
      console.log(`  → ${SNAPSHOT_PATH}`);
      console.log(`  → ${RUNTIME_SNAPSHOT_PATH}`);
      console.log(`  → ${HISTORY_DIR} (${historyFiles.size} files)`);
    }
  }

  return {
    snapshot,
    rosterPlayerCount: roster.length,
    syncedTeamCount,
    droppedBelowFloor,
    observationBatchCount: observationBatches.length,
    generatedProfileCount,
    outputPath: SNAPSHOT_PATH,
  };
}
