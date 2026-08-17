import type {
  Game,
  GameBoxScore,
  GamePlayByPlay,
  Player,
  PlayerGame,
  PlayerSeason,
  Shot,
  ShotFilters,
  Team,
  TeamSeason,
} from "@/data/types";
import {
  brefLookupKey,
  fetchBrefAdvancedSeason,
  normalizePlayerName,
  peekBrefAdvancedSeason,
  type BrefAdvancedRow,
} from "./nba/bref-scraper";
import {
  fetchDarkoSeason,
  peekDarkoSeason,
  type DarkoPlayerRow,
} from "./nba/darko-scraper";
import {
  fetchDrblSeason,
  peekDrblSeason,
  type DrblPlayerRow,
} from "./nba/drbl-loader";
import { fetchRawPlayByPlay } from "./nba/play-by-play-client";
import { transformNbaPlayByPlay } from "@/data/transformers/play-by-play";
import {
  BREF_CRITICAL_PATH_BUDGET_MS,
  CACHE_TTL_MS,
  DARKO_CRITICAL_PATH_BUDGET_MS,
  TtlPromiseCache,
  brefStaleMs,
  brefTtlMs,
  darkoStaleMs,
  darkoTtlMs,
  seasonStatsStaleMs,
  seasonStatsTtlMs,
} from "./nba/cache-policy";
import { NBA_TEAM_META, nbaTeamName } from "./nba/nba-team-meta";
import { defaultCanonicalSeasons, isModernLeagueDashSeason } from "./nba/season";
import {
  getResultSet,
  leagueDashParams,
  resultSetToObjects,
  statsNbaFetch,
} from "./nba/stats-nba-client";
import type { BasketballDataProvider } from "./types";
import {
  transformStatsNbaCareerTotalsRow,
  transformStatsNbaCommonPlayerInfo,
  transformStatsNbaPlayerSeason,
  transformStatsNbaTeamSeason,
} from "@/data/transformers/stats-nba";

/**
 * Live NBA data via stats.nba.com (most extensive free stats API),
 * supplemented with Basketball-Reference advanced metrics (PER, WS, BPM, VORP),
 * DARKO DPM (darko.app, from 1996-97), and DRBL-Core when precomputed.
 *
 * Caches expire on short TTLs for the current season so new games, box scores,
 * and rolling season totals appear without restarting the server.
 *
 * Set DATA_PROVIDER=nba to activate.
 */
export class NBADataProvider implements BasketballDataProvider {
  readonly name = "nba";

  private playerSeasonCache = new TtlPromiseCache<PlayerSeason[]>();
  private teamSeasonCache = new TtlPromiseCache<TeamSeason[]>();
  private gamesCache = new TtlPromiseCache<Game[]>();
  private boxScoreCache = new TtlPromiseCache<GameBoxScore | null>();
  private playByPlayCache = new TtlPromiseCache<GamePlayByPlay | null>();
  private careerCache = new TtlPromiseCache<PlayerSeason[]>();
  private playerInfoCache = new TtlPromiseCache<Player | null>();
  private gameLogCache = new TtlPromiseCache<PlayerGame[]>();
  private shotCache = new TtlPromiseCache<Shot[]>();
  private teamsPromise: Promise<Team[]> | null = null;

  async getPlayers(season?: string): Promise<Player[]> {
    const target = season ?? defaultCanonicalSeasons(1)[0];
    const seasons = await this.getPlayerSeasons(target);
    const byId = new Map<string, Player>();
    for (const row of seasons) {
      if (byId.has(row.playerId)) continue;
      byId.set(row.playerId, playerFromSeason(row));
    }
    return [...byId.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }

  async getPlayer(playerId: string, season?: string): Promise<Player | null> {
    if (season) {
      const row = await this.getPlayerSeason(playerId, season);
      if (row) return playerFromSeason(row);
    }

    const info = await this.loadCommonPlayerInfo(playerId);
    if (info) return info;

    const recent = defaultCanonicalSeasons(2);
    for (const s of recent) {
      if (s === season) continue;
      const row = await this.getPlayerSeason(playerId, s);
      if (row) return playerFromSeason(row);
    }

    const career = await this.getPlayerCareerSeasons(playerId);
    if (career[0]) return playerFromSeason(career[0]);
    return null;
  }

  async getTeams(): Promise<Team[]> {
    if (!this.teamsPromise) {
      this.teamsPromise = Promise.resolve(
        Object.entries(NBA_TEAM_META).map(([id, meta]) => ({
          id,
          abbreviation: meta.abbreviation,
          fullName: meta.fullName,
          city: meta.city,
          nickname: meta.nickname,
          conference: meta.conference,
          division: meta.division,
        }))
      );
    }
    return this.teamsPromise;
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const teams = await this.getTeams();
    return teams.find((t) => t.id === teamId) ?? null;
  }

  async getTeamSeasons(season?: string): Promise<TeamSeason[]> {
    const seasons = season ? [season] : defaultCanonicalSeasons(1);
    const chunks = await Promise.all(
      seasons.map((s) => this.loadTeamSeasonsForSeason(s))
    );
    return chunks.flat();
  }

  async getTeamSeason(
    teamId: string,
    season: string
  ): Promise<TeamSeason | null> {
    const rows = await this.loadTeamSeasonsForSeason(season);
    return rows.find((row) => row.teamId === teamId) ?? null;
  }

  async getPlayerSeasons(season?: string): Promise<PlayerSeason[]> {
    const seasons = season ? [season] : defaultCanonicalSeasons(2);
    const chunks = await Promise.all(
      seasons.map((s) => this.loadPlayerSeasonsForSeason(s))
    );
    return chunks.flat();
  }

  async getPlayerSeason(
    playerId: string,
    season: string
  ): Promise<PlayerSeason | null> {
    const rows = await this.loadPlayerSeasonsForSeason(season);
    return rows.find((row) => row.playerId === playerId) ?? null;
  }

  /** Full career counting + advanced where available. */
  async getPlayerCareerSeasons(playerId: string): Promise<PlayerSeason[]> {
    return this.careerCache.getOrSet(
      playerId,
      CACHE_TTL_MS.career,
      () => this.fetchPlayerCareer(playerId)
    );
  }

  async getPlayerGameLog(
    playerId: string,
    season: string
  ): Promise<PlayerGame[]> {
    return this.gameLogCache.getOrSet(
      `${playerId}:${season}`,
      CACHE_TTL_MS.gameLog,
      async () => {
        const [regular, playoffs] = await Promise.all([
          this.fetchGameLog(playerId, season, "Regular Season"),
          this.fetchGameLog(playerId, season, "Playoffs"),
        ]);
        return [...regular, ...playoffs].sort((a, b) =>
          b.gameDate.localeCompare(a.gameDate)
        );
      }
    );
  }

  async getGames(season?: string): Promise<Game[]> {
    const canonical = season ?? defaultCanonicalSeasons(1)[0];
    return this.loadGamesForSeason(canonical);
  }

  async getGame(gameId: string): Promise<Game | null> {
    const seasons = defaultCanonicalSeasons(3);
    for (const season of seasons) {
      const games = await this.loadGamesForSeason(season);
      const hit = games.find((g) => g.id === gameId);
      if (hit) return hit;
    }
    const box = await this.getGameBoxScore(gameId);
    return box?.game ?? null;
  }

  async getGameBoxScore(gameId: string): Promise<GameBoxScore | null> {
    return this.boxScoreCache.getOrSet(
      gameId,
      CACHE_TTL_MS.boxScore,
      () => this.fetchGameBoxScore(gameId)
    );
  }

  async getGamePlayByPlay(gameId: string): Promise<GamePlayByPlay | null> {
    return this.playByPlayCache.getOrSet(
      gameId,
      CACHE_TTL_MS.boxScore,
      () => this.fetchGamePlayByPlay(gameId)
    );
  }

  async getShots(filters: ShotFilters = {}): Promise<Shot[]> {
    if (filters.gameId) {
      return this.fetchShotsForGame(filters.gameId, filters);
    }
    if (filters.player && filters.season) {
      const key = `shots:${filters.player}:${filters.season}`;
      return this.shotCache.getOrSet(key, CACHE_TTL_MS.shots, async () => {
        const [regular, playoffs] = await Promise.all([
          this.fetchShotChart(filters.player!, filters.season!, "Regular Season"),
          this.fetchShotChart(filters.player!, filters.season!, "Playoffs"),
        ]);
        return [...regular, ...playoffs];
      }).then((shots) => shots.filter((shot) => matchesShotFilters(shot, filters)));
    }
    return [];
  }

  private loadPlayerSeasonsForSeason(season: string): Promise<PlayerSeason[]> {
    return this.playerSeasonCache.getOrSet(
      season,
      seasonStatsTtlMs(season),
      () => this.fetchPlayerSeasons(season),
      { staleMs: seasonStatsStaleMs(season) }
    );
  }

  private loadTeamSeasonsForSeason(season: string): Promise<TeamSeason[]> {
    return this.teamSeasonCache.getOrSet(
      season,
      seasonStatsTtlMs(season),
      () => this.fetchTeamSeasons(season),
      { staleMs: seasonStatsStaleMs(season) }
    );
  }

  private async fetchTeamSeasons(season: string): Promise<TeamSeason[]> {
    if (!isModernLeagueDashSeason(season)) {
      return this.fetchTeamSeasonsHistorical(season);
    }

    const statsTtl = seasonStatsTtlMs(season);
    const [baseRes, advRes] = await Promise.all([
      statsNbaFetch(
        "leaguedashteamstats",
        leagueDashParams(season, "Base", "Regular Season", "PerGame"),
        { ttlMs: statsTtl, staleMs: seasonStatsStaleMs(season) }
      ),
      statsNbaFetch(
        "leaguedashteamstats",
        leagueDashParams(season, "Advanced", "Regular Season", "PerGame"),
        { ttlMs: statsTtl, staleMs: seasonStatsStaleMs(season) }
      ),
    ]);

    const baseRows = resultSetToObjects(getResultSet(baseRes)!);
    const advRows = resultSetToObjects(getResultSet(advRes)!);
    const advById = new Map(
      advRows.map((row) => [String(row.TEAM_ID), row] as const)
    );

    return baseRows
      .filter((row) => row.TEAM_ID != null && n(row, "GP") > 0)
      .map((base) =>
        transformStatsNbaTeamSeason(
          base,
          advById.get(String(base.TEAM_ID)),
          season
        )
      )
      .sort((a, b) => b.winPct - a.winPct || b.netRating - a.netRating);
  }

  /**
   * Pre-1996 team tables aren't on league-dash; build from standings +
   * player season rollups (points / assists / rebounds).
   */
  private async fetchTeamSeasonsHistorical(
    season: string
  ): Promise<TeamSeason[]> {
    const statsTtl = seasonStatsTtlMs(season);
    const [standingsRes, players] = await Promise.all([
      statsNbaFetch(
        "leaguestandingsv3",
        {
          LeagueID: "00",
          Season: season,
          SeasonType: "Regular Season",
        },
        { ttlMs: statsTtl, staleMs: seasonStatsStaleMs(season) }
      ),
      this.loadPlayerSeasonsForSeason(season),
    ]);

    const standingsSet = getResultSet(standingsRes);
    const standings = standingsSet ? resultSetToObjects(standingsSet) : [];

    const byTeam = new Map<
      string,
      { pts: number; ast: number; reb: number; gp: number; min: number }
    >();
    for (const p of players) {
      const cur = byTeam.get(p.teamId) ?? {
        pts: 0,
        ast: 0,
        reb: 0,
        gp: 0,
        min: 0,
      };
      cur.pts += p.points;
      cur.ast += p.assists;
      cur.reb += p.rebounds;
      cur.gp = Math.max(cur.gp, p.gamesPlayed);
      cur.min += p.minutes;
      byTeam.set(p.teamId, cur);
    }

    if (standings.length === 0) {
      // No standings — synthesize bare team rows from player aggregates.
      return [...byTeam.entries()]
        .map(([teamId, agg]) => {
          const games = Math.max(1, agg.gp);
          return historicalTeamSeason({
            teamId,
            season,
            gamesPlayed: games,
            wins: 0,
            losses: 0,
            winPct: 0,
            pointsPerGame: agg.pts / games,
            assistsPerGame: agg.ast / games,
            reboundsPerGame: agg.reb / games,
          });
        })
        .sort((a, b) => b.pointsPerGame - a.pointsPerGame);
    }

    return standings
      .map((row) => {
        const teamId = String(row.TeamID ?? row.TEAM_ID ?? "");
        const wins = n(row, "WINS") || n(row, "W");
        const losses = n(row, "LOSSES") || n(row, "L");
        const games = wins + losses || n(row, "GP") || 1;
        const agg = byTeam.get(teamId);
        const winPct =
          n(row, "WinPCT") ||
          n(row, "W_PCT") ||
          (games > 0 ? wins / games : 0);
        const confRaw = String(row.Conference ?? "");
        const conference =
          confRaw.toLowerCase().startsWith("e")
            ? ("East" as const)
            : confRaw.toLowerCase().startsWith("w")
              ? ("West" as const)
              : NBA_TEAM_META[teamId]?.conference;
        return historicalTeamSeason({
          teamId,
          teamAbbreviation:
            String(row.TeamTricode ?? row.TEAM_ABBREVIATION ?? "") ||
            NBA_TEAM_META[teamId]?.abbreviation ||
            "",
          teamName:
            [String(row.TeamCity ?? ""), String(row.TeamName ?? "")]
              .filter(Boolean)
              .join(" ")
              .trim() || nbaTeamName(teamId),
          season,
          conference,
          division: String(row.Division ?? "") || NBA_TEAM_META[teamId]?.division,
          gamesPlayed: games,
          wins,
          losses,
          winPct,
          pointsPerGame: agg ? agg.pts / games : 0,
          assistsPerGame: agg ? agg.ast / games : 0,
          reboundsPerGame: agg ? agg.reb / games : 0,
        });
      })
      .filter((row) => row.teamId)
      .sort((a, b) => b.winPct - a.winPct || b.pointsPerGame - a.pointsPerGame);
  }

  /**
   * Wait for BRef at most `BREF_CRITICAL_PATH_BUDGET_MS`. On timeout, use any
   * previously cached scrape (even stale) so PER/WS/BPM still populate when
   * possible without blocking the page on a ~2MB HTML download.
   */
  private async loadBrefForSeason(season: string): Promise<BrefAdvancedRow[]> {
    const fetchPromise = fetchBrefAdvancedSeason(season, {
      ttlMs: brefTtlMs(season),
      staleMs: brefStaleMs(season),
    }).catch(() => [] as BrefAdvancedRow[]);

    const budget = new Promise<BrefAdvancedRow[] | null>((resolve) => {
      setTimeout(() => resolve(null), BREF_CRITICAL_PATH_BUDGET_MS);
    });

    const raced = await Promise.race([fetchPromise, budget]);
    if (raced !== null) return raced;

    // Timed out — keep warming cache; drop season cache once BRef arrives
    // so the next request (or SWR refresh) merges advanced metrics.
    void fetchPromise.then((rows) => {
      if (rows.length > 0) this.playerSeasonCache.delete(season);
    });
    return peekBrefAdvancedSeason(season) ?? [];
  }

  /**
   * Wait for DARKO at most `DARKO_CRITICAL_PATH_BUDGET_MS`. On timeout, use
   * any previously cached scrape so DPM still populates when possible.
   */
  private async loadDarkoForSeason(season: string): Promise<DarkoPlayerRow[]> {
    const fetchPromise = fetchDarkoSeason(season, {
      ttlMs: darkoTtlMs(season),
      staleMs: darkoStaleMs(season),
    }).catch(() => [] as DarkoPlayerRow[]);

    const budget = new Promise<DarkoPlayerRow[] | null>((resolve) => {
      setTimeout(() => resolve(null), DARKO_CRITICAL_PATH_BUDGET_MS);
    });

    const raced = await Promise.race([fetchPromise, budget]);
    if (raced !== null) return raced;

    void fetchPromise.then((rows) => {
      if (rows.length > 0) this.playerSeasonCache.delete(season);
    });
    return peekDarkoSeason(season) ?? [];
  }

  private async loadDrblForSeason(season: string): Promise<DrblPlayerRow[]> {
    try {
      return await fetchDrblSeason(season);
    } catch {
      return peekDrblSeason(season) ?? [];
    }
  }

  private async fetchPlayerSeasons(season: string): Promise<PlayerSeason[]> {
    if (!isModernLeagueDashSeason(season)) {
      return this.fetchPlayerSeasonsHistorical(season);
    }

    const statsTtl = seasonStatsTtlMs(season);
    const [baseRes, advRes, brefRows, darkoRows, drblRows] = await Promise.all([
      statsNbaFetch(
        "leaguedashplayerstats",
        leagueDashParams(season, "Base", "Regular Season", "Totals"),
        { ttlMs: statsTtl, staleMs: seasonStatsStaleMs(season) }
      ),
      statsNbaFetch(
        "leaguedashplayerstats",
        leagueDashParams(season, "Advanced", "Regular Season", "PerGame"),
        { ttlMs: statsTtl, staleMs: seasonStatsStaleMs(season) }
      ),
      this.loadBrefForSeason(season),
      this.loadDarkoForSeason(season),
      this.loadDrblForSeason(season),
    ]);

    const baseSet = getResultSet(baseRes);
    if (!baseSet) return [];
    const baseRows = resultSetToObjects(baseSet);
    const advRows = resultSetToObjects(getResultSet(advRes) ?? { name: "", headers: [], rowSet: [] });
    const advById = new Map(
      advRows.map((row) => [String(row.PLAYER_ID), row] as const)
    );
    const { brefByKey, brefByName } = indexBrefRows(brefRows);
    const darkoById = new Map(
      darkoRows.map((row) => [row.nbaId, row] as const)
    );
    const drblById = new Map(
      drblRows.map((row) => [row.playerId, row] as const)
    );

    return baseRows
      .filter((row) => n(row, "GP") > 0 && row.PLAYER_ID != null)
      .map((base) => {
        const playerId = String(base.PLAYER_ID);
        const abbr = String(base.TEAM_ABBREVIATION ?? "");
        const name = String(base.PLAYER_NAME ?? "");
        const bref =
          brefByKey.get(brefLookupKey(name, abbr)) ??
          brefByName.get(normalizePlayerName(name));
        const seasonRow = transformStatsNbaPlayerSeason(
          base,
          advById.get(playerId),
          season,
          bref,
          darkoById.get(playerId),
          drblById.get(playerId)
        );
        return {
          ...seasonRow,
          teamName: nbaTeamName(seasonRow.teamId, abbr),
          position: seasonRow.position ?? undefined,
        };
      });
  }

  /**
   * Pre-1996: league-dash player tables are empty. Use leagueleaders totals
   * (full-season scope) and merge Basketball-Reference advanced when available.
   * DARKO starts in 1996-97, so historical seasons here typically have no DPM.
   */
  private async fetchPlayerSeasonsHistorical(
    season: string
  ): Promise<PlayerSeason[]> {
    const statsTtl = seasonStatsTtlMs(season);
    const [leadersRes, brefRows, darkoRows, drblRows] = await Promise.all([
      statsNbaFetch(
        "leagueleaders",
        {
          LeagueID: "00",
          PerMode: "Totals",
          Scope: "S",
          Season: season,
          SeasonType: "Regular Season",
          StatCategory: "PTS",
        },
        { ttlMs: statsTtl, staleMs: seasonStatsStaleMs(season) }
      ),
      this.loadBrefForSeason(season),
      this.loadDarkoForSeason(season),
      this.loadDrblForSeason(season),
    ]);

    const set = getResultSet(leadersRes);
    if (!set?.rowSet?.length) return [];
    const { brefByKey, brefByName } = indexBrefRows(brefRows);
    const darkoById = new Map(
      darkoRows.map((row) => [row.nbaId, row] as const)
    );
    const drblById = new Map(
      drblRows.map((row) => [row.playerId, row] as const)
    );

    return resultSetToObjects(set)
      .filter((row) => n(row, "GP") > 0 && row.PLAYER_ID != null)
      .map((row) => {
        const base = normalizeLeagueLeaderRow(row);
        const playerId = String(base.PLAYER_ID);
        const abbr = String(base.TEAM_ABBREVIATION ?? "");
        const name = String(base.PLAYER_NAME ?? "");
        const bref =
          brefByKey.get(brefLookupKey(name, abbr)) ??
          brefByName.get(normalizePlayerName(name));
        const seasonRow = transformStatsNbaPlayerSeason(
          base,
          undefined,
          season,
          bref,
          darkoById.get(playerId),
          drblById.get(playerId)
        );
        return {
          ...seasonRow,
          teamName: nbaTeamName(seasonRow.teamId, abbr),
          position: seasonRow.position ?? mapBrefPosition(bref?.position),
        };
      });
  }

  private async loadCommonPlayerInfo(
    playerId: string
  ): Promise<Player | null> {
    return this.playerInfoCache.getOrSet(
      playerId,
      CACHE_TTL_MS.career,
      async () => {
        try {
          const response = await statsNbaFetch(
            "commonplayerinfo",
            { PlayerID: playerId },
            { ttlMs: CACHE_TTL_MS.career }
          );
          const set = getResultSet(response, "CommonPlayerInfo");
          if (!set) return null;
          const [row] = resultSetToObjects(set);
          return row ? transformStatsNbaCommonPlayerInfo(row) : null;
        } catch {
          return null;
        }
      }
    );
  }

  private async fetchPlayerCareer(playerId: string): Promise<PlayerSeason[]> {
    const response = await statsNbaFetch("playercareerstats", {
      PlayerID: playerId,
      PerMode: "Totals",
      LeagueID: "00",
    });
    const set = getResultSet(response, "SeasonTotalsRegularSeason");
    if (!set) return [];
    const rows = resultSetToObjects(set);
    const info = await this.loadCommonPlayerInfo(playerId);
    const fromRow = rows[0] ? String(rows[0].PLAYER_NAME ?? "").trim() : "";
    const playerName = info?.fullName || fromRow || `Player ${playerId}`;

    const richSeasons = new Set(defaultCanonicalSeasons(2));
    const seasons = await Promise.all(
      rows.map(async (row) => {
        const seasonId = String(row.SEASON_ID ?? "");
        // SEASON_ID is usually "2024-25"; older dumps may use "22024".
        const season = /^\d{4}-\d{2}$/.test(seasonId)
          ? seasonId
          : (() => {
              const endYear = Number(seasonId.slice(-4));
              return endYear > 1900
                ? `${endYear - 1}-${String(endYear).slice(-2)}`
                : seasonId;
            })();
        const displayName =
          String(row.PLAYER_NAME ?? "").trim() || playerName;
        const rich = richSeasons.has(season)
          ? await this.getPlayerSeason(playerId, season).catch(() => null)
          : null;
        if (rich) {
          return rich.playerName.startsWith("Player ")
            ? { ...rich, playerName: displayName }
            : rich;
        }
        const basic = transformStatsNbaCareerTotalsRow(
          row,
          displayName,
          season
        );
        return {
          ...basic,
          teamName: nbaTeamName(basic.teamId, basic.teamAbbreviation),
        };
      })
    );

    return seasons
      .filter((row) => row.teamAbbreviation !== "TOT")
      .sort((a, b) => b.season.localeCompare(a.season));
  }

  private async fetchGameLog(
    playerId: string,
    season: string,
    seasonType: string
  ): Promise<PlayerGame[]> {
    try {
      const response = await statsNbaFetch(
        "playergamelog",
        {
          PlayerID: playerId,
          Season: season,
          SeasonType: seasonType,
        },
        { ttlMs: CACHE_TTL_MS.gameLog }
      );
      const set = getResultSet(response, "PlayerGameLog");
      if (!set) return [];
      const seasonRow = await this.getPlayerSeason(playerId, season);
      const teamId = seasonRow?.teamId ?? "";

      return resultSetToObjects(set).map((row) => {
        const matchup = String(row.MATCHUP ?? "");
        const isHome = matchup.includes(" vs.");
        const opponent = matchup.split(/\s+(?:vs\.|@)\s+/)[1] ?? "";
        return {
          id: `${playerId}-${row.Game_ID}`,
          gameId: String(row.Game_ID ?? ""),
          playerId,
          playerName: seasonRow?.playerName,
          teamId,
          season,
          gameDate: parseNbaGameDate(String(row.GAME_DATE ?? "")),
          opponentTeamId: opponent,
          isHome,
          minutes: n(row, "MIN"),
          points: n(row, "PTS"),
          assists: n(row, "AST"),
          rebounds: n(row, "REB"),
          steals: n(row, "STL"),
          blocks: n(row, "BLK"),
          turnovers: n(row, "TOV"),
          fieldGoalsMade: n(row, "FGM"),
          fieldGoalsAttempted: n(row, "FGA"),
          threePointersMade: n(row, "FG3M"),
          threePointersAttempted: n(row, "FG3A"),
          freeThrowsMade: n(row, "FTM"),
          freeThrowsAttempted: n(row, "FTA"),
          plusMinus: n(row, "PLUS_MINUS"),
        } satisfies PlayerGame;
      });
    } catch {
      return [];
    }
  }

  private loadGamesForSeason(season: string): Promise<Game[]> {
    return this.gamesCache.getOrSet(
      season,
      CACHE_TTL_MS.games,
      () => this.fetchSeasonGames(season)
    );
  }

  private async fetchSeasonGames(season: string): Promise<Game[]> {
    const byId = new Map<string, Game>();
    for (const seasonType of ["Regular Season", "Playoffs"] as const) {
      const response = await statsNbaFetch(
        "leaguegamelog",
        {
          Counter: 0,
          DateFrom: "",
          DateTo: "",
          Direction: "DESC",
          LeagueID: "00",
          PlayerOrTeam: "T",
          Season: season,
          SeasonType: seasonType,
          Sorter: "DATE",
        },
        { ttlMs: CACHE_TTL_MS.games }
      );
      const set = getResultSet(response);
      if (!set) continue;
      for (const row of resultSetToObjects(set)) {
        const gameId = String(row.GAME_ID ?? "");
        if (!gameId) continue;
        const teamId = String(row.TEAM_ID ?? "");
        const matchup = String(row.MATCHUP ?? "");
        const isHome = matchup.includes(" vs.");
        const existing = byId.get(gameId);
        const score = n(row, "PTS");
        const gameDate = parseNbaGameDate(String(row.GAME_DATE ?? ""));
        const abbr = String(row.TEAM_ABBREVIATION ?? "");

        if (!existing) {
          byId.set(gameId, {
            id: gameId,
            season,
            gameDate,
            homeTeamId: isHome ? teamId : "",
            awayTeamId: isHome ? "" : teamId,
            homeTeamAbbr: isHome ? abbr : undefined,
            awayTeamAbbr: isHome ? undefined : abbr,
            homeTeamName: isHome ? nbaTeamName(teamId, abbr) : undefined,
            awayTeamName: isHome ? undefined : nbaTeamName(teamId, abbr),
            homeScore: isHome ? score : 0,
            awayScore: isHome ? 0 : score,
            gameType: seasonType === "Playoffs" ? "playoff" : "regular",
            status: "final",
          });
        } else {
          if (isHome) {
            existing.homeTeamId = teamId;
            existing.homeTeamAbbr = abbr;
            existing.homeTeamName = nbaTeamName(teamId, abbr);
            existing.homeScore = score;
          } else {
            existing.awayTeamId = teamId;
            existing.awayTeamAbbr = abbr;
            existing.awayTeamName = nbaTeamName(teamId, abbr);
            existing.awayScore = score;
          }
        }
      }
    }

    return [...byId.values()]
      .filter((g) => g.homeTeamId && g.awayTeamId)
      .sort((a, b) =>
        a.gameDate === b.gameDate
          ? a.id.localeCompare(b.id)
          : a.gameDate.localeCompare(b.gameDate)
      );
  }

  private async fetchGameBoxScore(
    gameId: string
  ): Promise<GameBoxScore | null> {
    const response = await statsNbaFetch(
      "boxscoretraditionalv2",
      {
        GameID: gameId,
        StartPeriod: 0,
        EndPeriod: 10,
        StartRange: 0,
        EndRange: 0,
        RangeType: 0,
      },
      { ttlMs: CACHE_TTL_MS.boxScore }
    );
    const playerSet = getResultSet(response, "PlayerStats");
    const teamSet = getResultSet(response, "TeamStats");
    if (!playerSet || !teamSet) return null;

    const teamRows = resultSetToObjects(teamSet);
    // TeamStats usually lists away then home or by scoreboard order; use game cache.
    const known = await this.findCachedGame(gameId);
    const season = known?.season ?? defaultCanonicalSeasons(1)[0];

    let homeTeamId = known?.homeTeamId ?? "";
    let awayTeamId = known?.awayTeamId ?? "";
    let homeScore = known?.homeScore ?? 0;
    let awayScore = known?.awayScore ?? 0;

    if (teamRows.length >= 2) {
      const a = teamRows[0];
      const b = teamRows[1];
      if (!homeTeamId) {
        // Prefer known; else treat first as home (NBA often home last — swap if known).
        awayTeamId = String(a.TEAM_ID);
        homeTeamId = String(b.TEAM_ID);
        awayScore = n(a, "PTS");
        homeScore = n(b, "PTS");
      } else {
        for (const row of teamRows) {
          const id = String(row.TEAM_ID);
          if (id === homeTeamId) homeScore = n(row, "PTS");
          if (id === awayTeamId) awayScore = n(row, "PTS");
        }
      }
    }

    const game: Game = {
      id: gameId,
      season,
      gameDate: known?.gameDate ?? "",
      homeTeamId,
      awayTeamId,
      homeTeamAbbr: known?.homeTeamAbbr,
      awayTeamAbbr: known?.awayTeamAbbr,
      homeTeamName: known?.homeTeamName ?? nbaTeamName(homeTeamId),
      awayTeamName: known?.awayTeamName ?? nbaTeamName(awayTeamId),
      homeScore,
      awayScore,
      gameType: known?.gameType ?? "regular",
      status: "final",
    };

    const players: PlayerGame[] = resultSetToObjects(playerSet)
      .filter((row) => row.PLAYER_ID != null && String(row.COMMENT ?? "") === "")
      .map((row) => {
        const teamId = String(row.TEAM_ID ?? "");
        const isHome = teamId === homeTeamId;
        return {
          id: `${row.PLAYER_ID}-${gameId}`,
          gameId,
          playerId: String(row.PLAYER_ID),
          playerName: String(row.PLAYER_NAME ?? ""),
          teamId,
          season,
          gameDate: game.gameDate,
          opponentTeamId: isHome ? awayTeamId : homeTeamId,
          isHome,
          startPosition: String(row.START_POSITION ?? "").trim() || undefined,
          minutes: parseMinutes(row.MIN),
          points: n(row, "PTS"),
          assists: n(row, "AST"),
          rebounds: n(row, "REB"),
          steals: n(row, "STL"),
          blocks: n(row, "BLK"),
          turnovers: n(row, "TO"),
          fieldGoalsMade: n(row, "FGM"),
          fieldGoalsAttempted: n(row, "FGA"),
          threePointersMade: n(row, "FG3M"),
          threePointersAttempted: n(row, "FG3A"),
          freeThrowsMade: n(row, "FTM"),
          freeThrowsAttempted: n(row, "FTA"),
          plusMinus: n(row, "PLUS_MINUS"),
        };
      });

    return { game, players };
  }

  private async fetchGamePlayByPlay(
    gameId: string
  ): Promise<GamePlayByPlay | null> {
    const payload = await fetchRawPlayByPlay(gameId);
    if (!payload) return null;
    const playByPlay = transformNbaPlayByPlay(
      gameId,
      payload.raw,
      payload.source
    );
    return playByPlay.events.length > 0 ? playByPlay : null;
  }

  private async fetchShotChart(
    playerId: string,
    season: string,
    seasonType: string
  ): Promise<Shot[]> {
    try {
      const response = await statsNbaFetch(
        "shotchartdetail",
        {
        AheadBehind: "",
        ClutchTime: "",
        ContextMeasure: "FGA",
        DateFrom: "",
        DateTo: "",
        EndPeriod: 10,
        EndRange: 28800,
        GameID: "",
        GameSegment: "",
        LastNGames: 0,
        LeagueID: "00",
        Location: "",
        Month: 0,
        OpponentTeamID: 0,
        Outcome: "",
        Period: 0,
        PlayerID: playerId,
        PlayerPosition: "",
        PointDiff: "",
        Position: "",
        RangeType: 0,
        Season: season,
        SeasonSegment: "",
        SeasonType: seasonType,
        ShotClockRange: "",
        StartPeriod: 1,
        StartRange: 0,
        TeamID: 0,
        VsConference: "",
        VsDivision: "",
        },
        { ttlMs: CACHE_TTL_MS.shots }
      );
      const set = getResultSet(response, "Shot_Chart_Detail");
      if (!set) return [];
      return resultSetToObjects(set).map((row) => {
        // NBA locX/locY are in tenths of a foot; basket at (0,0).
        const locX = n(row, "LOC_X") / 10;
        const locY = n(row, "LOC_Y") / 10;
        const made = String(row.SHOT_MADE_FLAG) === "1" || n(row, "SHOT_MADE_FLAG") === 1;
        const zone = String(row.SHOT_ZONE_BASIC ?? "");
        const isThree =
          zone.toLowerCase().includes("three") ||
          String(row.SHOT_TYPE ?? "").includes("3");
        return {
          id: `${row.GAME_ID}-${row.GAME_EVENT_ID}-${row.PLAYER_ID}`,
          gameId: String(row.GAME_ID ?? ""),
          playerId: String(row.PLAYER_ID ?? playerId),
          teamId: String(row.TEAM_ID ?? ""),
          season,
          gameDate: "",
          period: n(row, "PERIOD"),
          secondsRemaining:
            n(row, "MINUTES_REMAINING") * 60 + n(row, "SECONDS_REMAINING"),
          shotDistance: n(row, "SHOT_DISTANCE"),
          locX,
          locY,
          made,
          shotType: isThree ? "3PT" : "2PT",
          shotZoneBasic: zone || undefined,
          shotZoneArea: String(row.SHOT_ZONE_AREA ?? "") || undefined,
          assisted: false,
        } satisfies Shot;
      });
    } catch {
      return [];
    }
  }

  private async fetchShotsForGame(
    gameId: string,
    filters: ShotFilters
  ): Promise<Shot[]> {
    // Pull box to learn players, then shot charts are heavy; use one chart detail with GameID.
    try {
      const response = await statsNbaFetch(
        "shotchartdetail",
        {
        ContextMeasure: "FGA",
        EndPeriod: 10,
        EndRange: 28800,
        GameID: gameId,
        LastNGames: 0,
        LeagueID: "00",
        Month: 0,
        OpponentTeamID: 0,
        Period: 0,
        PlayerID: 0,
        RangeType: 0,
        Season: filters.season ?? defaultCanonicalSeasons(1)[0],
        SeasonType: "Regular Season",
        StartPeriod: 1,
        StartRange: 0,
        TeamID: 0,
        },
        { ttlMs: CACHE_TTL_MS.shots }
      );
      const set = getResultSet(response, "Shot_Chart_Detail");
      if (!set) return [];
      return resultSetToObjects(set)
        .map((row) => {
          const locX = n(row, "LOC_X") / 10;
          const locY = n(row, "LOC_Y") / 10;
          const made =
            String(row.SHOT_MADE_FLAG) === "1" || n(row, "SHOT_MADE_FLAG") === 1;
          const zone = String(row.SHOT_ZONE_BASIC ?? "");
          const isThree = zone.toLowerCase().includes("three");
          return {
            id: `${row.GAME_ID}-${row.GAME_EVENT_ID}-${row.PLAYER_ID}`,
            gameId: String(row.GAME_ID ?? gameId),
            playerId: String(row.PLAYER_ID ?? ""),
            teamId: String(row.TEAM_ID ?? ""),
            season: filters.season ?? defaultCanonicalSeasons(1)[0],
            gameDate: "",
            period: n(row, "PERIOD"),
            secondsRemaining:
              n(row, "MINUTES_REMAINING") * 60 + n(row, "SECONDS_REMAINING"),
            shotDistance: n(row, "SHOT_DISTANCE"),
            locX,
            locY,
            made,
            shotType: (isThree ? "3PT" : "2PT") as Shot["shotType"],
            shotZoneBasic: zone || undefined,
            assisted: false,
          };
        })
        .filter((shot) => matchesShotFilters(shot, filters));
    } catch {
      return [];
    }
  }

  private async findCachedGame(gameId: string): Promise<Game | undefined> {
    for (const promise of this.gamesCache.liveValues()) {
      const games = await promise;
      const hit = games.find((g) => g.id === gameId);
      if (hit) return hit;
    }
    return undefined;
  }
}

function playerFromSeason(row: PlayerSeason): Player {
  return {
    id: row.playerId,
    fullName: row.playerName,
    firstName: row.playerName.split(" ")[0] ?? row.playerName,
    lastName: row.playerName.split(" ").slice(1).join(" ") || row.playerName,
    position: row.position,
    currentTeamId: row.teamId,
  };
}

function indexBrefRows(brefRows: BrefAdvancedRow[]) {
  const brefByKey = new Map<string, BrefAdvancedRow>();
  const brefByName = new Map<string, BrefAdvancedRow>();
  for (const row of brefRows) {
    const key = brefLookupKey(row.playerName, row.teamAbbr);
    const prev = brefByKey.get(key);
    if (!prev || row.minutes > prev.minutes || row.gamesPlayed > prev.gamesPlayed) {
      brefByKey.set(key, row);
    }
    const nameKey = normalizePlayerName(row.playerName);
    const prevName = brefByName.get(nameKey);
    if (
      !prevName ||
      row.minutes > prevName.minutes ||
      row.gamesPlayed > prevName.gamesPlayed
    ) {
      brefByName.set(nameKey, row);
    }
  }
  return { brefByKey, brefByName };
}

/** Map leagueleaders columns onto the leaguedash field names our transformer expects. */
function normalizeLeagueLeaderRow(
  row: Record<string, string | number | null>
): Record<string, string | number | null> {
  return {
    ...row,
    PLAYER_NAME: row.PLAYER_NAME ?? row.PLAYER ?? null,
    TEAM_ABBREVIATION: row.TEAM_ABBREVIATION ?? row.TEAM ?? null,
  };
}

function mapBrefPosition(raw?: string): Player["position"] {
  if (!raw) return undefined;
  const key = raw.toUpperCase();
  if (key === "PG" || key === "SG" || key === "SF" || key === "PF" || key === "C") {
    return key;
  }
  if (key.includes("G") && key.includes("F")) return "SF";
  if (key.startsWith("G")) return "SG";
  if (key.startsWith("F")) return "SF";
  if (key.startsWith("C")) return "C";
  return undefined;
}

function historicalTeamSeason(
  partial: Partial<TeamSeason> &
    Pick<
      TeamSeason,
      | "teamId"
      | "season"
      | "gamesPlayed"
      | "wins"
      | "losses"
      | "winPct"
      | "pointsPerGame"
      | "assistsPerGame"
      | "reboundsPerGame"
    >
): TeamSeason {
  const meta = NBA_TEAM_META[partial.teamId];
  return {
    teamId: partial.teamId,
    teamName: partial.teamName || nbaTeamName(partial.teamId),
    teamAbbreviation:
      partial.teamAbbreviation || meta?.abbreviation || "",
    season: partial.season,
    conference: partial.conference ?? meta?.conference,
    division: partial.division ?? meta?.division,
    gamesPlayed: partial.gamesPlayed,
    wins: partial.wins,
    losses: partial.losses,
    winPct: partial.winPct,
    pointsPerGame: partial.pointsPerGame,
    assistsPerGame: partial.assistsPerGame,
    reboundsPerGame: partial.reboundsPerGame,
    offensiveReboundsPerGame: 0,
    defensiveReboundsPerGame: 0,
    stealsPerGame: 0,
    blocksPerGame: 0,
    turnoversPerGame: 0,
    fieldGoalsMadePerGame: 0,
    fieldGoalsAttemptedPerGame: 0,
    threePointersMadePerGame: 0,
    threePointersAttemptedPerGame: 0,
    freeThrowsMadePerGame: 0,
    freeThrowsAttemptedPerGame: 0,
    fieldGoalPct: 0,
    threePointPct: 0,
    freeThrowPct: 0,
    effectiveFieldGoalPct: 0,
    trueShootingPct: 0,
    offensiveRating: 0,
    defensiveRating: 0,
    netRating: 0,
    pace: 0,
    assistPct: 0,
    turnoverPct: 0,
    offensiveReboundPct: 0,
    defensiveReboundPct: 0,
    reboundPct: 0,
    pie: 0,
    plusMinus: 0,
  };
}

function n(
  row: Record<string, string | number | null>,
  key: string
): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseNbaGameDate(raw: string): string {
  // "OCT 22, 2024" or "2024-10-22"
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function parseMinutes(value: string | number | null): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  if (value.includes(":")) {
    const [m, s] = value.split(":").map((p) => Number(p) || 0);
    return m + s / 60;
  }
  return Number(value) || 0;
}

function matchesShotFilters(shot: Shot, filters: ShotFilters): boolean {
  if (filters.season && shot.season !== filters.season) return false;
  if (filters.team && shot.teamId !== filters.team) return false;
  if (filters.player && shot.playerId !== filters.player) return false;
  if (filters.gameId && shot.gameId !== filters.gameId) return false;
  if (filters.made !== undefined && shot.made !== filters.made) return false;
  if (filters.shotType && shot.shotType !== filters.shotType) return false;
  return true;
}

export { defaultCanonicalSeasons } from "./nba/season";
