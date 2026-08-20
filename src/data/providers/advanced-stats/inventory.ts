import { probeBallDontLieAdvancedAccess } from "@/data/providers/advanced-stats/probe-bdl";
import type { AdvancedSourceInventoryEntry } from "@/data/types/advanced-season-stats";
import { loadPlayerIdAliases } from "@/data/providers/impact/player-id-aliases";

export type BuildInventoryOptions = {
  bdlLiveAccess?: "ok" | "unauthorized" | "untested" | "n/a";
  skipNetwork?: boolean;
};

/**
 * Static + lightly probed inventory of candidate advanced-stat sources.
 * Does not invent metric values.
 */
export async function buildAdvancedSourceInventory(
  options: BuildInventoryOptions = {}
): Promise<AdvancedSourceInventoryEntry[]> {
  const aliases = await loadPlayerIdAliases();
  const aliasCount = aliases.byEspn.size;

  let bdlAccess = options.bdlLiveAccess ?? "untested";
  let bdlSeasonAccess = options.bdlLiveAccess ?? "untested";
  if (options.bdlLiveAccess == null && options.skipNetwork !== true) {
    const probe = await probeBallDontLieAdvancedAccess({
      skipNetwork: options.skipNetwork,
    });
    bdlAccess =
      probe.gameAdvanced === "ok"
        ? "ok"
        : probe.gameAdvanced === "unauthorized"
          ? "unauthorized"
          : probe.gameAdvanced === "skipped"
            ? "untested"
            : "unauthorized";
    bdlSeasonAccess =
      probe.seasonAveragesAdvanced === "ok"
        ? "ok"
        : probe.seasonAveragesAdvanced === "unauthorized"
          ? "unauthorized"
          : probe.seasonAveragesAdvanced === "skipped"
            ? "untested"
            : "unauthorized";
  }

  const aliasConcern =
    aliasCount === 0
      ? "ESPN↔NBA/BDL alias file is empty (data/impact/player-id-aliases.json)."
      : `Alias file has ${aliasCount} ESPN mappings (still may not cover full league).`;

  return [
    {
      source: "espn_approx",
      label: "ESPN athlete season board (production provider)",
      metricsClaimed: ["ortg", "usg_pct", "ts_pct", "efg_pct"],
      grain: "player_season",
      semantics: "derived_approx",
      seasonRangeClaimed: { earliest: "current-board", latest: "current-board" },
      playerIdentitySystem: "ESPN athlete id",
      seasonTrue: true,
      regularSeasonOnly: "unknown",
      playerLevel: true,
      provenanceAvailable: true,
      historicalCoverageContinuous: false,
      reliabilityConcerns: [
        "Individual DRtg is not published on the athlete season board - correctly omitted (null).",
        "NET is not published - correctly omitted (null). Never reconstruct as ORtg − 110.",
        "ORtg is approximate pts / (FGA + 0.44*FTA + TOV) * 100 when possessions > 0 - not provider ORtg.",
        "USG%/TS%/eFG% only when inputs support derivation.",
      ],
      wiredInRepo: true,
      liveAccess: "ok",
    },
    {
      source: "bdl_game_advanced",
      label: "BallDontLie GOAT /nba/v2/stats/advanced (per-game)",
      metricsClaimed: ["ortg", "drtg", "net", "usg_pct", "ts_pct", "efg_pct"],
      grain: "player_game",
      semantics: "on_court_team",
      seasonRangeClaimed: { earliest: "1996-97", latest: "present" },
      playerIdentitySystem: "BDL numeric player id (≠ ESPN athlete id)",
      seasonTrue: false,
      regularSeasonOnly: "unknown",
      playerLevel: true,
      provenanceAvailable: true,
      historicalCoverageContinuous: "unknown",
      reliabilityConcerns: [
        "Docs: offensive/defensive/net rating are on-court team points per 100 while the player is on the floor - not individual Dean Oliver ORtg.",
        "Not season-true: aggregating games into a season metric would be a new methodology (out of scope for this audit).",
        "Requires GOAT tier; configured production key currently returns 401 on probe.",
        aliasConcern,
        "Wired transform maps BDL player id into AdvancedPlayerGameStats.playerId - not ESPN id.",
      ],
      wiredInRepo: true,
      liveAccess: bdlAccess,
    },
    {
      source: "bdl_season_averages_advanced",
      label:
        "BallDontLie GOAT /nba/v1/season_averages/general?type=advanced",
      metricsClaimed: ["ortg", "drtg", "net", "usg_pct", "ts_pct", "efg_pct"],
      grain: "player_season",
      semantics: "unknown",
      seasonRangeClaimed: { earliest: null, latest: null },
      playerIdentitySystem: "BDL numeric player id",
      seasonTrue: true,
      regularSeasonOnly: true,
      playerLevel: true,
      provenanceAvailable: true,
      historicalCoverageContinuous: "unknown",
      reliabilityConcerns: [
        "Client method BallDontLieClient.getSeasonAverages is wired (read-only diagnostic).",
        "Live field dictionary for type=advanced not verified until a successful GOAT response.",
        "Whether stats.offensive_rating / defensive_rating / net_rating are individual vs on-court remains unverified - do not transplant game-advanced definitions.",
        "OpenAPI NBAPlayer has no ESPN/NBA person id - only BDL id; full-league join needs mapping layer.",
        "Small diagnostic identity fixture exists; full-league aliases still empty.",
        aliasConcern,
      ],
      wiredInRepo: true,
      liveAccess: bdlSeasonAccess,
    },
    {
      source: "nba_stats_placeholder",
      label: "NBA Stats transformer (OFF_RATING / DEF_RATING / NET_RATING)",
      metricsClaimed: ["ortg", "drtg", "net", "usg_pct"],
      grain: "player_season",
      semantics: "individual",
      seasonRangeClaimed: { earliest: null, latest: null },
      playerIdentitySystem: "NBA person id (when wired)",
      seasonTrue: true,
      regularSeasonOnly: "unknown",
      playerLevel: true,
      provenanceAvailable: false,
      historicalCoverageContinuous: "unknown",
      reliabilityConcerns: [
        "transformers/nba.ts is a placeholder mapping only - production provider is ESPN, not live NBA Stats.",
        "stats.nba.com is intentionally not used (blocking / ToS concerns noted in NBADataProvider).",
        "No coverage crawl or provenance pipeline exists.",
      ],
      wiredInRepo: false,
      liveAccess: "n/a",
    },
    {
      source: "local_sample",
      label: "Local sample provider (dev only)",
      metricsClaimed: ["ortg", "drtg", "net", "usg_pct", "ts_pct", "efg_pct"],
      grain: "player_season",
      semantics: "unknown",
      seasonRangeClaimed: { earliest: null, latest: null },
      playerIdentitySystem: "sample ids",
      seasonTrue: false,
      regularSeasonOnly: "unknown",
      playerLevel: true,
      provenanceAvailable: false,
      historicalCoverageContinuous: false,
      reliabilityConcerns: [
        "Sample/demo data - never production.",
        "Production provider guard requires DATA_PROVIDER=nba.",
      ],
      wiredInRepo: true,
      liveAccess: "n/a",
    },
  ];
}
