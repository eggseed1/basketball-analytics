import type { Game } from "@/data/types/game";
import type { TeamSeasonStats } from "@/data/types";
import type { LeagueStandings, StandingRow } from "@/data/types/standings";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
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
  /** e.g. "4-2" when known; also "2-1" while a series is in progress */
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
  /** Earliest final game date in this series (YYYY-MM-DD). */
  startDate: string | null;
  gameCount: number;
  playInOnly: boolean;
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

function conferenceOf(teamId: string): "East" | "West" | null {
  return ESPN_TEAM_META[String(teamId ?? "").trim()]?.conference ?? null;
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
        startDate: null,
        gameCount: 0,
        playInOnly: true,
      } satisfies SeriesResult);
    const winnerId =
      g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
    row.wins.set(winnerId, (row.wins.get(winnerId) ?? 0) + 1);
    row.gameCount += 1;
    if (g.gameType !== "play-in") row.playInOnly = false;
    if (!row.startDate || g.gameDate < row.startDate) {
      row.startDate = g.gameDate;
    }
    out.set(key, row);
  }

  for (const row of out.values()) {
    const entries = [...row.wins.entries()].sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    const second = entries[1];
    if (!top) continue;
    const winsNeeded = row.playInOnly ? 1 : 4;
    if (top[1] >= winsNeeded) {
      row.winnerId = top[0];
      row.result = second ? `${top[1]}-${second[1]}` : `${top[1]}-0`;
    } else if (second) {
      // In-progress series — still surface the running tally.
      row.result = `${top[1]}-${second[1]}`;
    } else if (top[1] > 0) {
      row.result = `${top[1]}-0`;
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

/** Ensure every playoff participant has a BracketTeam (play-in / seed gaps). */
function enrichSeedsFromGames(
  seeds: BracketTeam[],
  games: Game[],
  conference: "East" | "West"
): BracketTeam[] {
  const byId = seedMap(seeds);
  let nextSeed = Math.max(0, ...seeds.map((s) => s.seed)) + 1;
  for (const g of games) {
    if (g.gameType !== "playoff" && g.gameType !== "play-in") continue;
    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? g.homeTeamId : g.awayTeamId;
      if (conferenceOf(teamId) !== conference) continue;
      if (byId.has(teamId)) continue;
      const team: BracketTeam = {
        teamId,
        abbreviation:
          (side === "home" ? g.homeTeamAbbr : g.awayTeamAbbr) ?? teamId,
        displayName:
          (side === "home" ? g.homeTeamName : g.awayTeamName) ?? teamId,
        seed: nextSeed++,
      };
      byId.set(teamId, team);
      seeds.push(team);
    }
  }
  return seeds;
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

function matchupFromResolved(
  id: string,
  round: BracketMatchup["round"],
  top: BracketTeam | null,
  bottom: BracketTeam | null,
  bottomLabel: string,
  series: Map<string, SeriesResult>
): BracketMatchup {
  const s = seriesBetween(top?.teamId, bottom?.teamId, series);
  const topWins = top ? s?.wins.get(top.teamId) : undefined;
  const botWins = bottom ? s?.wins.get(bottom.teamId) : undefined;

  return {
    id,
    round,
    top: slot(top, undefined, {
      wins: topWins,
      winner: Boolean(top && s?.winnerId === top.teamId),
    }),
    bottom: bottom
      ? slot(bottom, undefined, {
          wins: botWins,
          winner: Boolean(s?.winnerId === bottom.teamId),
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

function conferenceSeries(
  conference: "East" | "West",
  series: Map<string, SeriesResult>
): SeriesResult[] {
  return [...series.values()].filter((s) => {
    const ca = conferenceOf(s.teamAId);
    const cb = conferenceOf(s.teamBId);
    return ca === conference && cb === conference;
  });
}

/** Earliest series start date per team (conference playoff/play-in only). */
function earliestSeriesByTeam(
  confSeries: SeriesResult[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of confSeries) {
    if (!s.startDate) continue;
    for (const id of [s.teamAId, s.teamBId]) {
      const prev = out.get(id);
      if (!prev || s.startDate < prev) out.set(id, s.startDate);
    }
  }
  return out;
}

/**
 * First-round series = both teams' earliest conference series is this one
 * (excludes later rounds where a winner already played).
 */
function firstRoundSeriesList(confSeries: SeriesResult[]): SeriesResult[] {
  const earliest = earliestSeriesByTeam(confSeries);
  return confSeries
    .filter((s) => {
      if (!s.startDate) return false;
      return (
        earliest.get(s.teamAId) === s.startDate &&
        earliest.get(s.teamBId) === s.startDate
      );
    })
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
}

function teamFromSeriesSide(
  teamId: string,
  seeds: Map<string, BracketTeam>
): BracketTeam | null {
  return seeds.get(teamId) ?? null;
}

/**
 * When results exist, place real first-round series into 1/4/3/2 slots.
 * Falls back to projected seed pairings when a slot has no series yet.
 */
function buildFirstRoundFromResults(
  prefix: string,
  seeds: BracketTeam[],
  series: Map<string, SeriesResult>,
  conference: "East" | "West",
  mode: PlayoffBracketMode
): BracketMatchup[] {
  const seedById = seedMap(seeds);
  const confSeries = conferenceSeries(conference, series);
  const firstRound = firstRoundSeriesList(confSeries).filter((s) => !s.playInOnly);

  const byHighSeed = new Map<
    number,
    { high: BracketTeam; low: BracketTeam; series: SeriesResult }
  >();

  for (const s of firstRound) {
    const a = teamFromSeriesSide(s.teamAId, seedById);
    const b = teamFromSeriesSide(s.teamBId, seedById);
    if (!a || !b) continue;
    const high = a.seed <= b.seed ? a : b;
    const low = a.seed <= b.seed ? b : a;
    // Prefer lower high-seed if a team somehow appears twice.
    const existing = byHighSeed.get(high.seed);
    if (!existing || (s.startDate ?? "") < (existing.series.startDate ?? "")) {
      byHighSeed.set(high.seed, { high, low, series: s });
    }
  }

  const s1 = bySeed(seeds, 1);
  const s2 = bySeed(seeds, 2);
  const s3 = bySeed(seeds, 3);
  const s4 = bySeed(seeds, 4);
  const s5 = bySeed(seeds, 5);
  const s6 = bySeed(seeds, 6);
  const s7 = bySeed(seeds, 7);
  const s8 = bySeed(seeds, 8);

  const slotDefs: Array<{
    id: string;
    highSeed: number;
    fallbackTop: BracketTeam | null;
    fallbackBottom: BracketTeam | null;
    fallbackLabel: string;
  }> = [
    {
      id: `${prefix}-r1-1-8`,
      highSeed: 1,
      fallbackTop: s1,
      fallbackBottom: mode === "projected" ? null : s8,
      fallbackLabel: "9/10",
    },
    {
      id: `${prefix}-r1-4-5`,
      highSeed: 4,
      fallbackTop: s4,
      fallbackBottom: s5,
      fallbackLabel: "5",
    },
    {
      id: `${prefix}-r1-3-6`,
      highSeed: 3,
      fallbackTop: s3,
      fallbackBottom: s6,
      fallbackLabel: "6",
    },
    {
      id: `${prefix}-r1-2-7`,
      highSeed: 2,
      fallbackTop: s2,
      fallbackBottom: mode === "projected" ? null : s7,
      fallbackLabel: "7/8",
    },
  ];

  return slotDefs.map((def) => {
    const hit = byHighSeed.get(def.highSeed);
    if (hit) {
      return matchupFromResolved(
        def.id,
        1,
        hit.high,
        hit.low,
        def.fallbackLabel,
        series
      );
    }
    return matchupFromResolved(
      def.id,
      1,
      def.fallbackTop,
      def.fallbackBottom,
      def.fallbackLabel,
      series
    );
  });
}

function buildPlayIn(
  prefix: string,
  seeds: BracketTeam[],
  series: Map<string, SeriesResult>,
  conference: "East" | "West"
): [BracketMatchup, BracketMatchup] {
  const s7 = bySeed(seeds, 7);
  const s8 = bySeed(seeds, 8);
  const s9 = bySeed(seeds, 9);
  const s10 = bySeed(seeds, 10);
  const seedById = seedMap(seeds);

  // Prefer explicit play-in series; otherwise leave projected 9/10 and 7/8.
  const confSeries = conferenceSeries(conference, series);
  const playInSeries = confSeries.filter((s) => s.playInOnly);

  let nineTen = matchupFromResolved(
    `${prefix}-pi-9-10`,
    "playin",
    s9,
    s10,
    "10",
    series
  );
  let sevenEight = matchupFromResolved(
    `${prefix}-pi-7-8`,
    "playin",
    s7,
    s8,
    "8",
    series
  );

  for (const s of playInSeries) {
    const a = seedById.get(s.teamAId);
    const b = seedById.get(s.teamBId);
    if (!a || !b) continue;
    const seedsInvolved = [a.seed, b.seed].sort((x, y) => x - y);
    if (seedsInvolved[0] === 9 || seedsInvolved[1] === 10) {
      nineTen = matchupFromResolved(
        `${prefix}-pi-9-10`,
        "playin",
        a.seed <= b.seed ? a : b,
        a.seed <= b.seed ? b : a,
        "10",
        series
      );
    }
    if (
      (seedsInvolved[0] === 7 || seedsInvolved[0] === 8) &&
      (seedsInvolved[1] === 8 || seedsInvolved[1] === 7)
    ) {
      sevenEight = matchupFromResolved(
        `${prefix}-pi-7-8`,
        "playin",
        a.seed <= b.seed ? a : b,
        a.seed <= b.seed ? b : a,
        "8",
        series
      );
    }
  }

  return [nineTen, sevenEight];
}

/**
 * Later rounds: find real series among prior-round winners (avoids wrong
 * pairings when archive W-L seeds ≠ official playoff seeds).
 */
function matchupsFromWinnerPool(
  idPrefix: string,
  round: 2 | 3,
  winners: Array<BracketTeam | null>,
  series: Map<string, SeriesResult>,
  conference: "East" | "West",
  expectedCount: 1 | 2,
  emptyLabels: [string, string]
): BracketMatchup[] {
  const present = winners.filter((t): t is BracketTeam => Boolean(t));
  const idSet = new Set(present.map((t) => t.teamId));
  const poolSeries = conferenceSeries(conference, series)
    .filter(
      (s) => idSet.has(s.teamAId) && idSet.has(s.teamBId) && Boolean(s.winnerId)
    )
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  const seedById = new Map(present.map((t) => [t.teamId, t] as const));
  const used = new Set<string>();
  const out: BracketMatchup[] = [];

  for (const s of poolSeries) {
    if (out.length >= expectedCount) break;
    const key = pairKey(s.teamAId, s.teamBId);
    if (used.has(key)) continue;
    used.add(key);
    const a = seedById.get(s.teamAId)!;
    const b = seedById.get(s.teamBId)!;
    const high = a.seed <= b.seed ? a : b;
    const low = a.seed <= b.seed ? b : a;
    out.push(
      matchupFromResolved(
        `${idPrefix}-${out.length}`,
        round,
        high,
        low,
        emptyLabels[1],
        series
      )
    );
  }

  while (out.length < expectedCount) {
    const leftover = present.filter(
      (t) =>
        !out.some(
          (m) =>
            m.top.team?.teamId === t.teamId ||
            m.bottom.team?.teamId === t.teamId
        )
    );
    out.push(
      matchupFromResolved(
        `${idPrefix}-${out.length}`,
        round,
        leftover[0] ?? null,
        leftover[1] ?? null,
        emptyLabels[1],
        series
      )
    );
  }

  return out;
}

function buildConferenceBracket(
  conference: "East" | "West",
  seedsIn: BracketTeam[],
  series: Map<string, SeriesResult>,
  mode: PlayoffBracketMode,
  games: Game[]
): ConferenceBracket {
  const prefix = conference.toLowerCase();
  const seeds = enrichSeedsFromGames(seedsIn, games, conference);
  const seedById = seedMap(seeds);

  const playIn = buildPlayIn(prefix, seeds, series, conference);

  const firstRound =
    mode === "projected"
      ? [
          matchupFromResolved(
            `${prefix}-r1-1-8`,
            1,
            bySeed(seeds, 1),
            null,
            "9/10",
            series
          ),
          matchupFromResolved(
            `${prefix}-r1-4-5`,
            1,
            bySeed(seeds, 4),
            bySeed(seeds, 5),
            "5",
            series
          ),
          matchupFromResolved(
            `${prefix}-r1-3-6`,
            1,
            bySeed(seeds, 3),
            bySeed(seeds, 6),
            "6",
            series
          ),
          matchupFromResolved(
            `${prefix}-r1-2-7`,
            1,
            bySeed(seeds, 2),
            null,
            "7/8",
            series
          ),
        ]
      : buildFirstRoundFromResults(prefix, seeds, series, conference, mode);

  const w1 = winnerTeam(firstRound[0]!, seedById);
  const w2 = winnerTeam(firstRound[1]!, seedById);
  const w3 = winnerTeam(firstRound[2]!, seedById);
  const w4 = winnerTeam(firstRound[3]!, seedById);

  let semifinals: [BracketMatchup, BracketMatchup];
  if (mode === "projected") {
    semifinals = [
      matchupFromResolved(`${prefix}-r2-a`, 2, null, null, "4/5", series),
      matchupFromResolved(`${prefix}-r2-b`, 2, null, null, "2/7", series),
    ];
    if (!semifinals[0].top.team) semifinals[0].top = slot(null, "1/8");
    if (!semifinals[0].bottom.team) semifinals[0].bottom = slot(null, "4/5");
    if (!semifinals[1].top.team) semifinals[1].top = slot(null, "3/6");
    if (!semifinals[1].bottom.team) semifinals[1].bottom = slot(null, "2/7");
  } else {
    const semis = matchupsFromWinnerPool(
      `${prefix}-r2`,
      2,
      [w1, w2, w3, w4],
      series,
      conference,
      2,
      ["TBD", "TBD"]
    );
    semifinals = [semis[0]!, semis[1]!];
  }

  const w5 = winnerTeam(semifinals[0]!, seedById);
  const w6 = winnerTeam(semifinals[1]!, seedById);

  let conferenceFinals: BracketMatchup;
  if (mode === "projected") {
    conferenceFinals = matchupFromResolved(
      `${prefix}-r3`,
      3,
      null,
      null,
      "TBD",
      series
    );
    if (!conferenceFinals.top.team) conferenceFinals.top = slot(null, "TBD");
    if (!conferenceFinals.bottom.team) {
      conferenceFinals.bottom = slot(null, "TBD");
    }
  } else {
    conferenceFinals = matchupsFromWinnerPool(
      `${prefix}-r3`,
      3,
      [w5, w6],
      series,
      conference,
      1,
      ["TBD", "TBD"]
    )[0]!;
  }

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

  const west = buildConferenceBracket(
    "West",
    westSeeds,
    series,
    mode,
    games
  );
  const east = buildConferenceBracket(
    "East",
    eastSeeds,
    series,
    mode,
    games
  );

  const westChamp = winnerTeam(west.conferenceFinals, seedMap(
    enrichSeedsFromGames([...westSeeds], games, "West")
  ));
  const eastChamp = winnerTeam(east.conferenceFinals, seedMap(
    enrichSeedsFromGames([...eastSeeds], games, "East")
  ));

  let finalsSeries = seriesBetween(
    westChamp?.teamId,
    eastChamp?.teamId,
    series
  );
  let finalsTop = westChamp;
  let finalsBottom = eastChamp;

  if (!finalsSeries) {
    // Cross-conference series (Finals) when champ pointers are incomplete.
    const cross = [...series.values()]
      .filter((s) => {
        const ca = conferenceOf(s.teamAId);
        const cb = conferenceOf(s.teamBId);
        return Boolean(ca && cb && ca !== cb);
      })
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    finalsSeries = cross[0] ?? null;
  }

  if (finalsSeries) {
    const allSeeds = seedMap([
      ...enrichSeedsFromGames([...westSeeds], games, "West"),
      ...enrichSeedsFromGames([...eastSeeds], games, "East"),
    ]);
    const a = allSeeds.get(finalsSeries.teamAId);
    const b = allSeeds.get(finalsSeries.teamBId);
    if (a && b) {
      if (conferenceOf(a.teamId) === "West") {
        finalsTop = a;
        finalsBottom = b;
      } else {
        finalsTop = b;
        finalsBottom = a;
      }
    }
  }

  const finals: BracketMatchup = {
    id: "finals",
    round: 3,
    top: slot(finalsTop, mode === "projected" ? "West" : "TBD", {
      wins: finalsTop ? finalsSeries?.wins.get(finalsTop.teamId) : undefined,
      winner: Boolean(
        finalsTop && finalsSeries?.winnerId === finalsTop.teamId
      ),
    }),
    bottom: slot(finalsBottom, mode === "projected" ? "East" : "TBD", {
      wins: finalsBottom
        ? finalsSeries?.wins.get(finalsBottom.teamId)
        : undefined,
      winner: Boolean(
        finalsBottom && finalsSeries?.winnerId === finalsBottom.teamId
      ),
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
