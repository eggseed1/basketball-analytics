import type { DrblActionType, DrblBoxPlayer, DrblBoxScore, DrblEvent } from "../types";

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parse NBA ISO-ish clock `PT11M43.00S` → seconds remaining in period. */
export function parseClockToSeconds(clock: string): number {
  const match = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(clock.trim());
  if (!match) return 0;
  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2] ?? 0);
  return minutes * 60 + seconds;
}

function mapActionType(raw: string, shotValue?: number | null): DrblActionType {
  const t = raw.toLowerCase().trim();
  const known: DrblActionType[] = [
    "2pt",
    "3pt",
    "freethrow",
    "rebound",
    "turnover",
    "steal",
    "block",
    "foul",
    "substitution",
    "jumpball",
    "period",
    "timeout",
    "game",
    "violation",
    "ejection",
    "instantreplay",
  ];
  if (known.includes(t as DrblActionType)) return t as DrblActionType;

  // Historical stats.nba.com playbyplayv3 labels (pre-CDN liveData schema).
  if (t === "made shot" || t === "missed shot") {
    return shotValue === 3 ? "3pt" : "2pt";
  }
  if (t === "free throw" || t.startsWith("free throw")) return "freethrow";
  if (t === "rebound") return "rebound";
  if (t === "turnover") return "turnover";
  if (t === "foul") return "foul";
  if (t === "substitution") return "substitution";
  if (t === "jump ball") return "jumpball";
  if (t === "timeout") return "timeout";
  if (t === "violation") return "violation";
  if (t === "ejection") return "ejection";
  if (t === "instant replay") return "instantreplay";
  return "unknown";
}

function pointsFromAction(
  actionType: DrblActionType,
  shotResult: string | null,
  subType: string,
  description: string,
  shotValue?: number | null
): number {
  if (shotResult !== "Made") return 0;
  if (actionType === "3pt") return 3;
  if (actionType === "2pt") return 2;
  if (actionType === "freethrow") return 1;
  if (shotValue === 3 || shotValue === 2 || shotValue === 1) return shotValue;
  // Fallback parse "(N PTS)" — cumulative in some descriptions; ignore.
  void subType;
  void description;
  return 0;
}

function inferShotResult(
  actionTypeRaw: string,
  shotResultRaw: string,
  description: string,
  mappedType: DrblActionType
): "Made" | "Missed" | null {
  if (shotResultRaw === "Made" || shotResultRaw === "Missed") return shotResultRaw;
  const t = actionTypeRaw.toLowerCase();
  if (t === "made shot") return "Made";
  if (t === "missed shot") return "Missed";
  if (mappedType === "freethrow") {
    if (/\bMISS\b/i.test(description)) return "Missed";
    // Made free throws include "(N PTS)" in the description.
    if (/\(\d+\s*PTS\)/i.test(description)) return "Made";
    return null;
  }
  return null;
}

/** Surnames a feed may still use after the player changed his name. */
const FORMER_SURNAMES: ReadonlyMap<string, string> = new Map([["kanter", "freedom"]]);

const NAME_SUFFIX = / (jr|sr|ii|iii|iv)$/;

function foldName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase, accents folded, punctuation and Jr./Sr./II–IV dropped, former surnames mapped. */
export function normalizePlayerKey(name: string): string {
  return foldName(name)
    .replace(NAME_SUFFIX, "")
    .split(" ")
    .map((part) => FORMER_SURNAMES.get(part) ?? part)
    .join(" ");
}

/** Last name plus suffix: "williams|iii" for Robert Williams III, "williams|" for Grant Williams. */
function surnameSuffixKey(name: string): string {
  const parts = normalizePlayerKey(name).split(" ");
  return `${parts[parts.length - 1]}|${NAME_SUFFIX.exec(foldName(name))?.[1] ?? ""}`;
}

export type NormalizePbpOptions = {
  /** Optional box roster for resolving historical "SUB: X FOR Y" names → IDs. */
  rosterPlayers?: Array<{ playerId: string; playerName: string; teamId?: string }>;
};

type RosterIndex = {
  byFull: Map<string, string>;
  byLastUnique: Map<string, string>;
  /** Namesakes the feed tells apart only by suffix ("Williams III" and "Williams"). */
  bySurnameSuffixUnique: Map<string, string>;
};

/** One index for the whole box plus one per team, keyed "*" and teamId. */
function buildRosterIndex(
  rosterPlayers: Array<{ playerId: string; playerName: string; teamId?: string }> | undefined
): Map<string, RosterIndex> {
  const out = new Map<string, RosterIndex>();
  if (!rosterPlayers) return out;
  const teams = new Map<string, typeof rosterPlayers>([["*", rosterPlayers]]);
  for (const p of rosterPlayers) {
    if (!p.teamId) continue;
    teams.set(p.teamId, [...(teams.get(p.teamId) ?? []), p]);
  }
  for (const [key, players] of teams) out.set(key, buildOneRosterIndex(players));
  return out;
}

function buildOneRosterIndex(
  rosterPlayers: Array<{ playerId: string; playerName: string }>
): RosterIndex {
  const byFull = new Map<string, string>();
  const lastCounts = new Map<string, string[]>();
  const abbreviatedCounts = new Map<string, string[]>();
  for (const p of rosterPlayers) {
    const full = normalizePlayerKey(p.playerName);
    if (full) byFull.set(full, p.playerId);
    const parts = full.split(" ");
    // Surnames of one or two words ("Silva", "da Silva").
    for (const n of [1, 2]) {
      if (n === 2 && parts.length < 3) continue;
      const last = parts.slice(-n).join(" ");
      const arr = lastCounts.get(last) ?? [];
      arr.push(p.playerId);
      lastCounts.set(last, arr);
    }
    // Abbreviated "C. Martin" and "Co. Martin" forms; namesakes share the first.
    if (parts.length >= 2) {
      for (const n of [1, 2]) {
        if (parts[0]!.length < n) continue;
        const abbreviated = `${parts[0]!.slice(0, n)} ${parts[parts.length - 1]}`;
        const arr = abbreviatedCounts.get(abbreviated) ?? [];
        arr.push(p.playerId);
        abbreviatedCounts.set(abbreviated, arr);
      }
    }
  }
  for (const [abbreviated, ids] of abbreviatedCounts) {
    const uniq = [...new Set(ids)];
    if (uniq.length === 1 && !byFull.has(abbreviated)) byFull.set(abbreviated, uniq[0]!);
  }
  const byLastUnique = new Map<string, string>();
  for (const [last, ids] of lastCounts) {
    const uniq = [...new Set(ids)];
    if (uniq.length === 1) byLastUnique.set(last, uniq[0]!);
  }
  const suffixCounts = new Map<string, string[]>();
  for (const p of rosterPlayers) {
    const k = surnameSuffixKey(p.playerName);
    suffixCounts.set(k, [...(suffixCounts.get(k) ?? []), p.playerId]);
  }
  const bySurnameSuffixUnique = new Map<string, string>();
  for (const [k, ids] of suffixCounts) {
    const uniq = [...new Set(ids)];
    if (uniq.length === 1) bySurnameSuffixUnique.set(k, uniq[0]!);
  }
  return { byFull, byLastUnique, bySurnameSuffixUnique };
}

function resolveRosterId(
  indexes: ReturnType<typeof buildRosterIndex>,
  name: string,
  teamId?: string | null
): string | null {
  const key = normalizePlayerKey(name);
  if (!key) return null;
  const surnameOnly = !key.includes(" ");
  for (const index of [teamId ? indexes.get(teamId) : undefined, indexes.get("*")]) {
    if (!index) continue;
    const id =
      index.byFull.get(key) ??
      index.byLastUnique.get(key) ??
      (surnameOnly ? index.bySurnameSuffixUnique.get(surnameSuffixKey(name)) : undefined);
    if (id) return id;
  }
  return null;
}

function isNbaTeamId(id: number): boolean {
  return id >= 1610612700 && id < 1610612800;
}

/**
 * playbyplayv3 rebounds carry no offensive/defensive subType; a rebound by
 * the team that missed the last shot or free throw is offensive. Events must
 * be in feed order.
 */
function labelReboundsByLastMiss(events: DrblEvent[]): void {
  let missTeamId: string | null = null;
  let period = 0;
  for (const e of events) {
    if (e.period !== period) {
      period = e.period;
      missTeamId = null;
    }
    const shot = e.actionType === "2pt" || e.actionType === "3pt" || e.actionType === "freethrow";
    if (shot && e.shotResult === "Missed") missTeamId = e.teamId;
    else if (e.actionType === "rebound" && e.teamId && missTeamId) {
      e.subType = e.teamId === missTeamId ? "offensive" : "defensive";
    }
  }
}

/**
 * False for stats.nba.com playbyplayv3, which has no orderNumber, numbers
 * actions out of chronological order and skips substitutions made between
 * periods.
 */
export function hasFeedOrderNumbers(raw: unknown): boolean {
  const actions = (raw as { game?: { actions?: Array<Record<string, unknown>> } }).game?.actions;
  return Array.isArray(actions) && actions.some((a) => a.orderNumber != null);
}

/**
 * Normalize CDN / playbyplayv3 liveData actions into DrblEvent[].
 * Also accepts historical stats.nba.com action labels (Made Shot, Free Throw, …).
 */
export function normalizePlayByPlay(
  gameId: string,
  raw: unknown,
  options: NormalizePbpOptions = {}
): DrblEvent[] {
  const root = raw as {
    game?: { actions?: Array<Record<string, unknown>> };
  };
  const actions = root.game?.actions;
  if (!Array.isArray(actions)) return [];
  const rosterIndex = buildRosterIndex(options.rosterPlayers);

  const events: DrblEvent[] = [];
  // Lineup lookups need chronological action numbers; without orderNumber
  // only the feed's own order is chronological.
  const numberByPosition = !hasFeedOrderNumbers(raw);

  for (const [position, action] of actions.entries()) {
    const actionTypeRaw = asString(action.actionType);
    const shotValue = asNullableNumber(action.shotValue);
    let actionType = mapActionType(actionTypeRaw, shotValue);
    const subType = asString(action.subType);
    const description = asString(action.description);
    // playbyplayv3 logs steals and blocks as untyped "X STEAL (1 STL)" rows.
    if (numberByPosition && actionType === "unknown") {
      if (/\bSTEAL\b/.test(description)) actionType = "steal";
      else if (/\bBLOCK\b/.test(description)) actionType = "block";
    }
    const shotResult = inferShotResult(
      actionTypeRaw,
      asString(action.shotResult),
      description,
      actionType
    );
    let playerIdNum = asNumber(action.personId);
    let teamIdNum = asNumber(action.teamId);
    // ...and team rows ("Nets Rebound") with the team id as personId.
    if (numberByPosition && !teamIdNum && isNbaTeamId(playerIdNum)) {
      teamIdNum = playerIdNum;
      playerIdNum = 0;
    }
    const possessionNum = asNumber(action.possession);
    const clockRaw = asString(action.clock);
    const actionNumber = numberByPosition ? position + 1 : asNumber(action.actionNumber);
    const orderNumber =
      asNumber(action.orderNumber) || actionNumber;

    // Historical substitutions are a single "SUB: In FOR Out" row.
    if (actionType === "substitution") {
      const subMatch = /^SUB:\s*(.+?)\s+FOR\s+(.+)$/i.exec(description);
      if (subMatch) {
        const inName = subMatch[1]!.trim();
        const outName = subMatch[2]!.trim();
        const subTeamId = teamIdNum ? String(teamIdNum) : null;
        const outId =
          (playerIdNum ? String(playerIdNum) : null) ||
          resolveRosterId(rosterIndex, outName, subTeamId);
        const inId = resolveRosterId(rosterIndex, inName, subTeamId);
        const base = {
          gameId,
          period: asNumber(action.period),
          clockSeconds: parseClockToSeconds(clockRaw),
          clockRaw,
          actionType: "substitution" as const,
          subType,
          teamId: teamIdNum ? String(teamIdNum) : null,
          possessionTeamId: possessionNum ? String(possessionNum) : null,
          description,
          shotResult: null,
          isFieldGoal: false,
          pointsOnAction: 0,
          scoreHome: asNumber(action.scoreHome),
          scoreAway: asNumber(action.scoreAway),
          x: asNullableNumber(action.xLegacy ?? action.x),
          y: asNullableNumber(action.yLegacy ?? action.y),
          qualifiers: Array.isArray(action.qualifiers)
            ? action.qualifiers.map(String)
            : [],
          assistPlayerId: null,
          assistPlayerName: null,
          stealPlayerId: null,
          blockPlayerId: null,
          assistSource: null as "cdn" | "description" | null,
        };
        // Out then in, both at this row's place in the feed's order.
        events.push({
          ...base,
          actionNumber,
          orderNumber,
          playerId: outId,
          playerName: outName,
          substitutionSide: "out",
        });
        events.push({
          ...base,
          actionNumber,
          orderNumber: orderNumber + 0.5,
          playerId: inId,
          playerName: inName,
          substitutionSide: "in",
        });
        continue;
      }
    }

    let substitutionSide: "in" | "out" | null = null;
    if (actionType === "substitution") {
      const st = subType.toLowerCase();
      if (st === "in") substitutionSide = "in";
      if (st === "out") substitutionSide = "out";
    }

    const assistIdNum = asNumber(
      action.assistPersonId ?? action.assistPlayerId
    );
    const stealIdNum = asNumber(action.stealPersonId ?? action.stealPlayerId);
    const blockIdNum = asNumber(action.blockPersonId ?? action.blockPlayerId);
    const assistName =
      asString(action.assistPlayerNameI) ||
      asString(action.assistPlayerName) ||
      null;

    // Assist from description: "(Name N AST)"
    let assistFromDesc: string | null = null;
    if (!assistIdNum) {
      const am = /\(([^)]+?)\s+\d+\s+AST\)/i.exec(description);
      if (am) assistFromDesc = am[1]!.trim();
    }

    events.push({
      gameId,
      actionNumber,
      orderNumber,
      period: asNumber(action.period),
      clockSeconds: parseClockToSeconds(clockRaw),
      clockRaw,
      actionType,
      subType,
      teamId: teamIdNum ? String(teamIdNum) : null,
      playerId: playerIdNum ? String(playerIdNum) : null,
      playerName:
        asString(action.playerNameI) || asString(action.playerName) || null,
      possessionTeamId: possessionNum ? String(possessionNum) : null,
      description,
      shotResult,
      isFieldGoal:
        asNumber(action.isFieldGoal) === 1 ||
        actionType === "2pt" ||
        actionType === "3pt",
      pointsOnAction: pointsFromAction(
        actionType,
        shotResult,
        subType,
        description,
        shotValue
      ),
      scoreHome: asNumber(action.scoreHome),
      scoreAway: asNumber(action.scoreAway),
      x: asNullableNumber(action.xLegacy ?? action.x),
      y: asNullableNumber(action.yLegacy ?? action.y),
      qualifiers: Array.isArray(action.qualifiers)
        ? action.qualifiers.map(String)
        : [],
      substitutionSide,
      assistPlayerId: assistIdNum
        ? String(assistIdNum)
        : assistFromDesc
          ? resolveRosterId(rosterIndex, assistFromDesc, teamIdNum ? String(teamIdNum) : null)
          : null,
      assistPlayerName: assistName || assistFromDesc,
      stealPlayerId: stealIdNum ? String(stealIdNum) : null,
      blockPlayerId: blockIdNum ? String(blockIdNum) : null,
      assistSource: assistIdNum
        ? "cdn"
        : assistFromDesc
          ? "description"
          : null,
    });
  }

  if (numberByPosition) labelReboundsByLastMiss(events);
  return events.sort(
    (a, b) =>
      a.period - b.period ||
      a.orderNumber - b.orderNumber ||
      a.actionNumber - b.actionNumber
  );
}

function parseMinutes(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = asString(raw);
  // "PT32M12.00S" or "32:12"
  const iso = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(s);
  if (iso) {
    return Number(iso[1] ?? 0) + Number(iso[2] ?? 0) / 60;
  }
  const colon = /^(\d+):(\d+)$/.exec(s);
  if (colon) {
    return Number(colon[1]) + Number(colon[2]) / 60;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTeamPlayers(
  team: Record<string, unknown>,
  teamId: string
): DrblBoxPlayer[] {
  const players = Array.isArray(team.players) ? team.players : [];
  return players
    .map((p) => {
      const row = p as Record<string, unknown>;
      const stats = (row.statistics ?? {}) as Record<string, unknown>;
      const starterRaw = row.starter;
      const starter =
        starterRaw === true ||
        starterRaw === 1 ||
        starterRaw === "1";
      const playerId = String(row.personId ?? "");
      if (!playerId || playerId === "0") return null;
      const played = row.played === true || row.played === "1" || row.played === 1;
      if (!played && asNumber(stats.minutes) === 0 && parseMinutes(stats.minutes) === 0) {
        // Keep DNP rows out of reconciliation totals.
        if (parseMinutes(stats.minutesCalculated ?? stats.minutes) <= 0) {
          return null;
        }
      }
      return {
        playerId,
        playerName:
          asString(row.name) ||
          `${asString(row.firstName)} ${asString(row.familyName)}`.trim(),
        teamId,
        starter,
        minutes: parseMinutes(stats.minutesCalculated ?? stats.minutes),
        points: asNumber(stats.points),
        fieldGoalsMade: asNumber(stats.fieldGoalsMade),
        fieldGoalsAttempted: asNumber(stats.fieldGoalsAttempted),
        threePointersMade: asNumber(stats.threePointersMade),
        threePointersAttempted: asNumber(stats.threePointersAttempted),
        freeThrowsMade: asNumber(stats.freeThrowsMade),
        freeThrowsAttempted: asNumber(stats.freeThrowsAttempted),
        offensiveRebounds: asNumber(stats.reboundsOffensive),
        defensiveRebounds: asNumber(stats.reboundsDefensive),
        rebounds: asNumber(stats.reboundsTotal),
        assists: asNumber(stats.assists),
        steals: asNumber(stats.steals),
        blocks: asNumber(stats.blocks),
        turnovers: asNumber(stats.turnovers),
        personalFouls: asNumber(stats.foulsPersonal),
      } satisfies DrblBoxPlayer;
    })
    .filter((p): p is DrblBoxPlayer => p != null);
}

export function normalizeBoxScore(
  season: string,
  raw: unknown
): DrblBoxScore | null {
  const game = (raw as { game?: Record<string, unknown> }).game;
  if (!game) return null;
  const home = game.homeTeam as Record<string, unknown>;
  const away = game.awayTeam as Record<string, unknown>;
  if (!home || !away) return null;

  const homeTeamId = String(home.teamId ?? "");
  const awayTeamId = String(away.teamId ?? "");
  const gameId = String(game.gameId ?? "");
  const gameEt = asString(game.gameEt || game.gameTimeUTC).slice(0, 10);

  return {
    gameId,
    season,
    gameDate: gameEt,
    homeTeamId,
    awayTeamId,
    homeTeamTricode: asString(home.teamTricode),
    awayTeamTricode: asString(away.teamTricode),
    homeScore: asNumber(home.score),
    awayScore: asNumber(away.score),
    players: [
      ...normalizeTeamPlayers(home, homeTeamId),
      ...normalizeTeamPlayers(away, awayTeamId),
    ],
  };
}
