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

function normalizePlayerKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type NormalizePbpOptions = {
  /** Optional box roster for resolving historical "SUB: X FOR Y" names → IDs. */
  rosterPlayers?: Array<{ playerId: string; playerName: string }>;
};

function buildRosterIndex(
  rosterPlayers: Array<{ playerId: string; playerName: string; teamId?: string }> | undefined
): {
  byFull: Map<string, string>;
  byLastUnique: Map<string, string>;
} {
  const byFull = new Map<string, string>();
  const lastCounts = new Map<string, string[]>();
  if (!rosterPlayers) return { byFull, byLastUnique: new Map() };
  for (const p of rosterPlayers) {
    const full = normalizePlayerKey(p.playerName);
    if (full) byFull.set(full, p.playerId);
    const parts = full.split(" ");
    if (parts.length >= 1) {
      const last = parts[parts.length - 1]!;
      const arr = lastCounts.get(last) ?? [];
      arr.push(p.playerId);
      lastCounts.set(last, arr);
    }
    // Also index abbreviated "X. Last" style from nameI-like forms.
    if (parts.length >= 2) {
      const abbreviated = normalizePlayerKey(
        `${parts[0]![0]}. ${parts[parts.length - 1]}`
      );
      if (abbreviated) byFull.set(abbreviated, p.playerId);
    }
  }
  const byLastUnique = new Map<string, string>();
  for (const [last, ids] of lastCounts) {
    const uniq = [...new Set(ids)];
    if (uniq.length === 1) byLastUnique.set(last, uniq[0]!);
  }
  return { byFull, byLastUnique };
}

function resolveRosterId(
  index: ReturnType<typeof buildRosterIndex>,
  name: string
): string | null {
  const key = normalizePlayerKey(name);
  if (!key) return null;
  return index.byFull.get(key) ?? index.byLastUnique.get(key) ?? null;
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

  for (const action of actions) {
    const actionTypeRaw = asString(action.actionType);
    const shotValue = asNullableNumber(action.shotValue);
    const actionType = mapActionType(actionTypeRaw, shotValue);
    const subType = asString(action.subType);
    const description = asString(action.description);
    const shotResult = inferShotResult(
      actionTypeRaw,
      asString(action.shotResult),
      description,
      actionType
    );
    const playerIdNum = asNumber(action.personId);
    const teamIdNum = asNumber(action.teamId);
    const possessionNum = asNumber(action.possession);
    const clockRaw = asString(action.clock);
    const actionNumber = asNumber(action.actionNumber);
    const orderNumber =
      asNumber(action.orderNumber) || actionNumber;

    // Historical substitutions are a single "SUB: In FOR Out" row.
    if (actionType === "substitution") {
      const subMatch = /^SUB:\s*(.+?)\s+FOR\s+(.+)$/i.exec(description);
      if (subMatch) {
        const inName = subMatch[1]!.trim();
        const outName = subMatch[2]!.trim();
        const outId =
          (playerIdNum ? String(playerIdNum) : null) ||
          resolveRosterId(rosterIndex, outName);
        const inId = resolveRosterId(rosterIndex, inName);
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
        events.push({
          ...base,
          actionNumber,
          orderNumber: orderNumber * 10,
          playerId: outId,
          playerName: outName,
          substitutionSide: "out",
        });
        events.push({
          ...base,
          actionNumber,
          orderNumber: orderNumber * 10 + 1,
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
          ? resolveRosterId(rosterIndex, assistFromDesc)
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
