import type { Game } from "@/data/types/game";
import type { TeamSeasonStats } from "@/data/types";
import type { LeagueStandings, StandingRow } from "@/data/types/standings";
import { isCurrentNbaSeason } from "@/lib/nba-season-status";

export type BracketTeam = {
  teamId: string;
  abbreviation: string;
  displayName: string;
  seed: number;
};

export type BracketSlot = {
  team: BracketTeam | null;
  label?: string;
  /** Series wins when postseason results are known (e.g. 4). */
  wins?: number;
  /** True when this team won the series. */
  winner?: boolean;
};

export type BracketMatchup = {
  id: string;
  top: BracketSlot;
  bottom: BracketSlot;
  round: "playin" | 1 | 2 | 3;
  /** e.g. "4-2" when known */
  result?: string;
};

export type ConferenceBracket = {
  conference: "East" | "West";
  playIn: [BracketMatchup, BracketMatchup];
  firstRound: BracketMatchup[];
  semifinals: [BracketMatchup, BracketMatchup];
  conferenceFinals: BracketMatchup;
};

export type PlayoffBracketMode = "projected" | "postseason" | "complete";

export type PlayoffBracketModel = {
  season: string;
  mode: PlayoffBracketMode;
  source: "standings" | "board" | "results";
  west: ConferenceBracket;
  east: ConferenceBracket;
  finals: BracketMatchup;
};

type SeriesResult = {
  teamAId: string;
  teamBId: string;
  wins: Map<string, number>;
  winnerId: string | null;
  result: string | null;
};

function teamFromStanding(row: StandingRow): BracketTeam {
  return {
    teamId: row.teamId,
    abbreviation: row.abbreviation,
    displayName: row.displayName,
    seed: row.playoffSeed && row.playoffSeed > 0 ? row.playoffSeed : row.rank,
  };
}

function teamFromBoard(row: TeamSeasonStats, seed: number): BracketTeam {
  return {
    teamId: row.teamId,
    abbreviation: row.abbreviation,
    displayName: row.fullName,
    seed,
  };
}

function slot(
  team: BracketTeam | null | undefined,
  label?: string,
  extra?: Pick<BracketSlot, "wins" | "winner">
): BracketSlot {
  if (!team) {
    return { team: null, label: label ?? "TBD", ...extra };
  }
  return { team, ...extra };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function isFinalGame(g: Game): boolean {
  if (g.status === "final") return true;
  return g.homeScore > 0 || g.awayScore > 0;
}

export function detectPlayoffSeries(games: Game[]): Map<string, SeriesResult> {
  const out = new Map<string, SeriesResult>();
  const playoff = games.filter(
    (g) => g.gameType === "playoff" || g.gameType === "play-in"
  );

  for (const g of playoff) {
    if (!isFinalGame(g)) continue;
    const key = pairKey(g.homeTeamId, g.awayTeamId);
    const row =
      out.get(key) ??
      ({
        teamAId: g.homeTeamId,
        teamBId: g.awayTeamId,
        wins: new Map<string, number>(),
        winnerId: null,
        result: null,
      } satisfies SeriesResult);
    const winnerId =
      g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
    row.wins.set(winnerId, (row.wins.get(winnerId) ?? 0) + 1);
    out.set(key, row);
  }

  for (const row of out.values()) {
    const entries = [...row.wins.entries()].sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    const second = entries[1];
    if (!top) continue;
    const winsNeeded = 4;
    if (top[1] >= winsNeeded) {
      row.winnerId = top[0];
      row.result = second ? `${top[1]}-${second[1]}` : `${top[1]}-0`;
    }
  }

  return out;
}

export function resolvePlayoffBracketMode(
  season: string,
  games: Game[],
  now = new Date()
): PlayoffBracketMode {
  const playoffGames = games.filter(
    (g) =>
      (g.gameType === "playoff" || g.gameType === "play-in") && isFinalGame(g)
  );
  if (!playoffGames.length) return "projected";

  if (!isCurrentNbaSeason(season, now) && playoffGames.length) return "complete";
  if (isCurrentNbaSeason(season, now) && playoffGames.length) return "postseason";
  return "projected";
}

function seedsFromStandings(
  standings: LeagueStandings | null,
  conference: "East" | "West"
): BracketTeam[] | null {
  const rows =
    standings?.conferences.find((c) => c.conference === conference)?.rows ?? [];
  if (!rows.length) return null;
  return rows.slice(0, 10).map(teamFromStanding);
}

function seedsFromBoard(
  teams: TeamSeasonStats[],
  conference: "East" | "West"
): BracketTeam[] {
  return [...teams]
    .filter((t) => t.conference === conference)
    .sort(
      (a, b) =>
        b.avgDiff - a.avgDiff ||
        b.ppg - a.ppg ||
        a.abbreviation.localeCompare(b.abbreviation)
    )
    .slice(0, 10)
    .map((t, i) => teamFromBoard(t, i + 1));
}

function seedMap(seeds: BracketTeam[]): Map<string, BracketTeam> {
  return new Map(seeds.map((t) => [t.teamId, t]));
}

function bySeed(seeds: BracketTeam[], n: number): BracketTeam | null {
  return seeds.find((t) => t.seed === n) ?? seeds[n - 1] ?? null;
}

function seriesBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  series: Map<string, SeriesResult>
): SeriesResult | null {
  if (!a || !b) return null;
  return series.get(pairKey(a, b)) ?? null;
}

function matchupFromTeams(
  id: string,
  round: BracketMatchup["round"],
  top: BracketTeam | null,
  bottom: BracketTeam | null,
  bottomLabel: string,
  series: Map<string, SeriesResult>
): BracketMatchup {
  const resolvedBottom =
    bottom ??
    (top && series.size
      ? null
      : null);
  const s = seriesBetween(top?.teamId, resolvedBottom?.teamId, series);
  const topWins = top ? s?.wins.get(top.teamId) : undefined;
  const botWins = resolvedBottom ? s?.wins.get(resolvedBottom.teamId) : undefined;

  return {
    id,
    round,
    top: slot(top, undefined, {
      wins: topWins,
      winner: Boolean(top && s?.winnerId === top.teamId),
    }),
    bottom: resolvedBottom
      ? slot(resolvedBottom, undefined, {
          wins: botWins,
          winner: Boolean(s?.winnerId === resolvedBottom.teamId),
        })
      : slot(null, bottomLabel),
    result: s?.result ?? undefined,
  };
}

function winnerTeam(
  m: BracketMatchup,
  seeds: Map<string, BracketTeam>
): BracketTeam | null {
  if (m.top.winner && m.top.team) return m.top.team;
  if (m.bottom.winner && m.bottom.team) return m.bottom.team;
  const topId = m.top.team?.teamId;
  const botId = m.bottom.team?.teamId;
  if (topId && m.top.winner) return seeds.get(topId) ?? m.top.team;
  if (botId && m.bottom.winner) return seeds.get(botId) ?? m.bottom.team;
  return null;
}

function buildConferenceBracket(
  conference: "East" | "West",
  seeds: BracketTeam[],
  series: Map<string, SeriesResult>,
  mode: PlayoffBracketMode
): ConferenceBracket {
  const prefix = conference.toLowerCase();
  const s1 = bySeed(seeds, 1);
  const s2 = bySeed(seeds, 2);
  const s3 = bySeed(seeds, 3);
  const s4 = bySeed(seeds, 4);
  const s5 = bySeed(seeds, 5);
  const s6 = bySeed(seeds, 6);
  const s7 = bySeed(seeds, 7);
  const s8 = bySeed(seeds, 8);
  const s9 = bySeed(seeds, 9);
  const s10 = bySeed(seeds, 10);
  const seedById = seedMap(seeds);

  const playIn: [BracketMatchup, BracketMatchup] = [
    matchupFromTeams(`${prefix}-pi-9-10`, "playin", s9, s10, "10", series),
    matchupFromTeams(`${prefix}-pi-7-8`, "playin", s7, s8, "8", series),
  ];

  let eight: BracketTeam | null = s8;
  let seven: BracketTeam | null = s7;
  if (mode === "projected") {
    eight = null;
    seven = null;
  } else {
    const pi78 = winnerTeam(playIn[1]!, seedById);
    const pi910 = winnerTeam(playIn[0]!, seedById);
    if (pi78) seven = pi78;
    if (pi910) eight = pi910;
  }

  const firstRound: BracketMatchup[] = [
    matchupFromTeams(`${prefix}-r1-1-8`, 1, s1, eight, "9/10", series),
    matchupFromTeams(`${prefix}-r1-4-5`, 1, s4, s5, "5", series),
    matchupFromTeams(`${prefix}-r1-3-6`, 1, s3, s6, "6", series),
    matchupFromTeams(`${prefix}-r1-2-7`, 1, s2, seven, "7/8", series),
  ];

  const w1 = winnerTeam(firstRound[0]!, seedById);
  const w2 = winnerTeam(firstRound[1]!, seedById);
  const w3 = winnerTeam(firstRound[2]!, seedById);
  const w4 = winnerTeam(firstRound[3]!, seedById);

  const semifinals: [BracketMatchup, BracketMatchup] = [
    matchupFromTeams(
      `${prefix}-r2-a`,
      2,
      w1,
      w2,
      mode === "projected" ? "1/8" : "TBD",
      series
    ),
    matchupFromTeams(
      `${prefix}-r2-b`,
      2,
      w3,
      w4,
      mode === "projected" ? "3/6" : "TBD",
      series
    ),
  ];

  const w5 = winnerTeam(semifinals[0]!, seedById);
  const w6 = winnerTeam(semifinals[1]!, seedById);

  const conferenceFinals = matchupFromTeams(
    `${prefix}-r3`,
    3,
    w5,
    w6,
    mode === "projected" ? "Semis" : "TBD",
    series
  );

  return {
    conference,
    playIn,
    firstRound,
    semifinals,
    conferenceFinals,
  };
}

export function buildPlayoffBracket(input: {
  season: string;
  standings?: LeagueStandings | null;
  teams?: TeamSeasonStats[];
  games?: Game[];
  now?: Date;
}): PlayoffBracketModel {
  const games = input.games ?? [];
  const series = detectPlayoffSeries(games);
  const mode = resolvePlayoffBracketMode(
    input.season,
    games,
    input.now ?? new Date()
  );
  const hasResults = mode !== "projected";

  const westFromStandings = seedsFromStandings(input.standings ?? null, "West");
  const eastFromStandings = seedsFromStandings(input.standings ?? null, "East");
  const source = hasResults
    ? "results"
    : westFromStandings?.length && eastFromStandings?.length
      ? "standings"
      : "board";

  const westSeeds =
    westFromStandings?.length
      ? westFromStandings
      : seedsFromBoard(input.teams ?? [], "West");
  const eastSeeds =
    eastFromStandings?.length
      ? eastFromStandings
      : seedsFromBoard(input.teams ?? [], "East");

  const west = buildConferenceBracket("West", westSeeds, series, mode);
  const east = buildConferenceBracket("East", eastSeeds, series, mode);

  const westChamp = winnerTeam(west.conferenceFinals, seedMap(westSeeds));
  const eastChamp = winnerTeam(east.conferenceFinals, seedMap(eastSeeds));

  const finalsSeries = seriesBetween(
    westChamp?.teamId,
    eastChamp?.teamId,
    series
  );

  const finals: BracketMatchup = {
    id: "finals",
    round: 3,
    top: slot(westChamp, mode === "projected" ? "West" : "TBD", {
      wins: westChamp ? finalsSeries?.wins.get(westChamp.teamId) : undefined,
      winner: Boolean(westChamp && finalsSeries?.winnerId === westChamp.teamId),
    }),
    bottom: slot(eastChamp, mode === "projected" ? "East" : "TBD", {
      wins: eastChamp ? finalsSeries?.wins.get(eastChamp.teamId) : undefined,
      winner: Boolean(eastChamp && finalsSeries?.winnerId === eastChamp.teamId),
    }),
    result: finalsSeries?.result ?? undefined,
  };

  return {
    season: input.season,
    mode,
    source,
    west,
    east,
    finals,
  };
}

/** @deprecated Use buildPlayoffBracket */
export function buildProjectedPlayoffBracket(input: {
  season: string;
  standings?: LeagueStandings | null;
  teams?: TeamSeasonStats[];
}): PlayoffBracketModel {
  return buildPlayoffBracket(input);
}
