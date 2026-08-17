/**
 * Convert stats.nba.com boxscoretraditionalv3 payload into CDN liveData
 * boxscore shape expected by normalizeBoxScore.
 */
export function statsBoxScoreV3ToCdnShape(raw: unknown): {
  game: Record<string, unknown>;
} | null {
  const root = raw as {
    boxScoreTraditional?: Record<string, unknown>;
    game?: Record<string, unknown>;
  };
  const box = root.boxScoreTraditional ?? root.game;
  if (!box) return null;
  const home = box.homeTeam as Record<string, unknown> | undefined;
  const away = box.awayTeam as Record<string, unknown> | undefined;
  if (!home || !away) return null;

  return {
    game: {
      gameId: String(box.gameId ?? ""),
      gameEt: box.gameEt ?? box.gameTimeUTC ?? "",
      homeTeam: convertTeam(home),
      awayTeam: convertTeam(away),
    },
  };
}

function convertTeam(team: Record<string, unknown>): Record<string, unknown> {
  const stats = (team.statistics ?? {}) as Record<string, unknown>;
  const players = Array.isArray(team.players)
    ? (team.players as Record<string, unknown>[])
    : [];

  const converted = players.map((p) => convertPlayer(p));

  // Cap starters to five: prefer players with a non-empty position, then
  // highest minutes. Historical START_POSITION / position fields are noisy.
  const withPos = converted
    .filter((p) => p._hasPosition)
    .sort((a, b) => Number(b._minutes) - Number(a._minutes));
  const starterIds = new Set(
    withPos.slice(0, 5).map((p) => String(p.personId))
  );
  for (const p of converted) {
    p.starter = starterIds.has(String(p.personId)) ? "1" : "0";
    delete p._hasPosition;
    delete p._minutes;
  }

  return {
    teamId: team.teamId,
    teamCity: team.teamCity,
    teamName: team.teamName,
    teamTricode: team.teamTricode,
    teamSlug: team.teamSlug,
    score: Number(stats.points ?? team.score ?? 0),
    players: converted,
    statistics: stats,
  };
}

function convertPlayer(p: Record<string, unknown>): Record<string, unknown> {
  const statistics = (p.statistics ?? {}) as Record<string, unknown>;
  const minutesRaw = statistics.minutes ?? statistics.minutesCalculated ?? "";
  const minutes = parseMinutesToNumber(minutesRaw);
  const hasPosition = Boolean(String(p.position ?? "").trim());
  const name =
    String(p.name ?? "").trim() ||
    `${String(p.firstName ?? "")} ${String(p.familyName ?? "")}`.trim() ||
    String(p.nameI ?? "");

  return {
    personId: p.personId,
    firstName: p.firstName,
    familyName: p.familyName,
    name,
    nameI: p.nameI,
    jerseyNum: p.jerseyNum,
    position: p.position,
    comment: p.comment,
    played: minutes > 0 ? "1" : "0",
    starter: "0",
    statistics: {
      ...statistics,
      minutes: minutesRaw,
      minutesCalculated: minutesRaw,
    },
    _hasPosition: hasPosition,
    _minutes: minutes,
  };
}

function parseMinutesToNumber(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "");
  const iso = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(s);
  if (iso) return Number(iso[1] ?? 0) + Number(iso[2] ?? 0) / 60;
  const colon = /^(\d+):(\d+)$/.exec(s);
  if (colon) return Number(colon[1]) + Number(colon[2]) / 60;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
