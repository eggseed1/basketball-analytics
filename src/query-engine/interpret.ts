import { resolveMetric, metricById } from "./metrics";
import { resolveSeasonPhrases } from "./seasons";
import { detectUnsupportedClauses } from "./unsupported";
import { resolveTeamFromText, resolveTeamsFromText, PLAYER_ALIASES } from "./entities";
import { planPartialSupport } from "./partial";
import {
  detectVagueCompetitiveLanguage,
  possessivePlayerHintFromText,
} from "./interpret-helpers";
import type { BasketballQueryAst, QueryOperation } from "./types";

function possessivePlayerHint(text: string): string | null {
  return possessivePlayerHintFromText(text);
}

function stripNoise(text: string): string {
  return text
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic natural-language → BasketballQueryAst.
 * Does not call the network; entity ids may be empty pending resolveQueryEntities.
 */
export function interpretAskQuery(raw: string): BasketballQueryAst {
  const text = stripNoise(raw);
  const lower = text.toLowerCase();
  const unsupportedHits = detectUnsupportedClauses(text);
  const { seasons, notes } = resolveSeasonPhrases(text);
  const vague = detectVagueCompetitiveLanguage(text);

  const base = {
    version: 1 as const,
    rawQuery: text,
    seasonNotes: notes.length ? notes : undefined,
    interpretation: [] as string[],
  };

  // Vague competitive language without a documented methodology.
  if (vague && !unsupportedHits.length) {
    return {
      ...base,
      operation: "season_stat",
      entities: [],
      interpretation: ["Ambiguous competitive language"],
      unsupported: ["ambiguous competitive language"],
      unsupportedReason: vague,
    };
  }

  if (unsupportedHits.length) {
    const partial = planPartialSupport(text);
    if (partial?.supportedQuery) {
      return {
        ...base,
        operation: "season_stat",
        entities: [],
        interpretation: [
          "Partially supported",
          partial.supportedSummary ?? "Supported season-stat portion identified",
        ],
        unsupported: partial.unsupported.map((h) => h.clause),
        unsupportedReason: partial.reason,
        partialSupportedQuery: partial.supportedQuery,
        partialSupportedSummary: partial.supportedSummary ?? undefined,
      };
    }
    return {
      ...base,
      operation: "season_stat",
      entities: [],
      interpretation: ["Query includes dimensions ASK DRBL cannot execute yet."],
      unsupported: unsupportedHits.map((h) => h.clause),
      unsupportedReason: unsupportedHits[0]!.reason,
      when: seasons.length ? { seasons } : undefined,
    };
  }

  // --- Team / player season compare ---
  if (
    /\bcompare\b/i.test(text) ||
    /\bwhich\s+was\s+better\b/i.test(text) ||
    (/\bvs\.?\b/i.test(lower) && seasons.length >= 1)
  ) {
    const teams = resolveTeamsFromText(text);
    const a = seasons[0];
    const b = seasons[1];

    // Two teams → team vs team (default shared season).
    if (teams.length >= 2) {
      const seasonList =
        a && b ? [a, b] : a ? [a, a] : undefined;
      return {
        ...base,
        operation: "team_season_compare",
        entities: [
          { kind: "team", id: teams[0]!.id, name: teams[0]!.name },
          { kind: "team", id: teams[1]!.id, name: teams[1]!.name },
        ],
        when: seasonList ? { seasons: seasonList } : undefined,
        interpretation: [
          `${teams[0]!.name} vs ${teams[1]!.name}`,
          seasonList
            ? `Team compare ${seasonList[0]}${
                seasonList[0] !== seasonList[1] ? ` / ${seasonList[1]}` : ""
              }`
            : "Team compare (season unresolved)",
          "Existing team-season comparison methodology",
        ],
      };
    }

    // One team + two seasons → same-team season compare.
    if (teams.length === 1 && a && b) {
      return {
        ...base,
        operation: "team_season_compare",
        entities: [
          { kind: "team", id: teams[0]!.id, name: teams[0]!.name },
          { kind: "team", id: teams[0]!.id, name: teams[0]!.name },
        ],
        when: { seasons: [a, b] },
        interpretation: [
          teams[0]!.name,
          `Team season compare ${a} vs ${b}`,
          "Existing team-season comparison methodology",
        ],
      };
    }

    const playerHint = possessivePlayerHint(text) ?? extractPlayerNameLoose(text);
    if (playerHint && a && b) {
      const metric = resolveMetric(text, "player_season");
      return {
        ...base,
        operation: "season_compare",
        entities: [{ kind: "player", id: "", name: playerHint }],
        when: { seasons: [a, b] },
        metricId: metric?.id,
        interpretation: [
          playerHint,
          `Season compare ${a} vs ${b}`,
          metric
            ? `Includes ${metric.label} context · overall uses season-comparison methodology`
            : "Existing player season-comparison methodology",
        ],
      };
    }
  }

  // --- Peak production (Career Resume) before generic "best" ---
  if (
    /\bpeak\s+(production\s+)?season\b/i.test(text) ||
    /\bbest\s+production\s+season\b/i.test(text) ||
    /\bqualifying\s+seasons?\b/i.test(text) ||
    /\bcareer\s+resume\b/i.test(text) ||
    /\bhow\s+many\s+qualifying\b/i.test(text)
  ) {
    const playerHint = possessivePlayerHint(text) ?? extractPlayerNameLoose(text);
    if (playerHint) {
      const wantsCount = /\bhow\s+many\b/i.test(text);
      return {
        ...base,
        operation: "career_resume",
        entities: [{ kind: "player", id: "", name: playerHint }],
        metricId: wantsCount ? undefined : "cpi",
        interpretation: [
          playerHint,
          wantsCount
            ? "Qualifying season count"
            : "Peak production season under Career Resume CPI",
          "Existing Career Resume methodology",
        ],
      };
    }
  }

  // --- Team season game evidence (descriptive schedule games → Game Lab) ---
  if (
    /\b(biggest|largest)\s+wins?\b/i.test(text) ||
    /\bbest\s+games?\b/i.test(text) ||
    /\brepresentative\s+games?\b/i.test(text) ||
    /\bseason\s+evidence\b/i.test(text) ||
    /\bhighest[-\s]?scoring\s+games?\b/i.test(text) ||
    /\bbest\s+defensive\s+(games?|results?)\b/i.test(text) ||
    (/\bgames?\b/i.test(text) &&
      /\b(biggest|largest|highest|lowest)\b/i.test(text) &&
      !/\bdown\s+\d+\b/i.test(text) &&
      !/\bq[1-4]\b/i.test(text) &&
      !/\bcame\s+back\b/i.test(text))
  ) {
    const teams = resolveTeamsFromText(text);
    if (teams.length >= 1) {
      const team = teams[0]!;
      const season = seasons[0];
      return {
        ...base,
        operation: "team_season_game_evidence",
        entities: [{ kind: "team", id: team.id, name: team.name }],
        when: season ? { seasons: [season] } : seasons.length ? { seasons } : undefined,
        interpretation: [
          team.name,
          season
            ? `Season evidence for ${season}`
            : "Season evidence (default recent season)",
          "Descriptive schedule-score games — not “most important” or PBP filters",
        ],
      };
    }
  }

  // --- Season rank / "best season" (team preferred when franchise resolved) ---
  if (
    /\brank\b/i.test(text) ||
    /\bbest\s+seasons?\b/i.test(text) ||
    /\bbest\s+team\s+season\b/i.test(text) ||
    /\bbest\s+season\s+according\b/i.test(text) ||
    (/\bbest\s+season\b/i.test(text) && !/\bpeak\s+production\b/i.test(text))
  ) {
    const teams = resolveTeamsFromText(text);
    const playerHint = possessivePlayerHint(text) ?? extractPlayerNameLoose(text);
    const knownPlayer =
      playerHint != null &&
      Boolean(
        PLAYER_ALIASES[playerHint.toLowerCase()] ||
          Object.values(PLAYER_ALIASES).some(
            (a) => a.name.toLowerCase() === playerHint.toLowerCase()
          )
      );

    if (teams.length >= 1 && (!knownPlayer || /\bteam\b/i.test(text))) {
      const team = teams[0]!;
      return {
        ...base,
        operation: "team_season_rank",
        entities: [{ kind: "team", id: team.id, name: team.name }],
        when: seasons.length ? { seasons } : undefined,
        interpretation: [
          team.name,
          seasons.length
            ? `Rank team seasons (${seasons[0]} → ${seasons[seasons.length - 1]})`
            : "Rank recent team seasons (eligible set)",
          "I interpreted “best season” using DRBL's current Team Season Ranking methodology",
        ],
      };
    }

    if (playerHint) {
      return {
        ...base,
        operation: "season_rank",
        entities: [{ kind: "player", id: "", name: playerHint }],
        when: seasons.length ? { seasons } : undefined,
        interpretation: [
          playerHint,
          seasons.length
            ? `Rank seasons (${seasons[0]} → ${seasons[seasons.length - 1]})`
            : "Rank career seasons (eligible set)",
          "Under DRBL's Rank My Seasons (Copeland) methodology — not a universal “best” score",
        ],
      };
    }
  }

  // --- Leaderboard ---
  if (
    (/\bwho\s+(led|leads|had\s+the\s+(highest|best)|was\s+the\s+(leader|best))\b/i.test(
      text
    ) ||
      /\bled\s+the\s+(nba|league)\b/i.test(text)) &&
    !/\b(against|vs\.?|versus)\b/i.test(text)
  ) {
    const metric =
      resolveMetric(text, "player_season") ?? resolveMetric(text);
    const season = seasons[0];
    return {
      ...base,
      operation: "leaderboard",
      entities: [],
      metricId: metric?.id,
      when: season ? { seasons: [season] } : undefined,
      interpretation: [
        "NBA leaderboard",
        season ?? "season unresolved",
        metric?.label ?? "metric unresolved",
      ],
    };
  }

  // --- Trade package / consideration questions (no structured ledger yet) ---
  if (
    /\bwhat\s+did\b/i.test(text) &&
    /\b(receive|get|acquire|return)\b/i.test(text) &&
    /\bfor\b/i.test(text)
  ) {
    const team = resolveTeamFromText(text);
    return {
      ...base,
      operation: "offseason_summary",
      entities: team
        ? [{ kind: "team", id: team.id, name: team.name }]
        : [{ kind: "team", id: "", name: "league" }],
      interpretation: [
        team ? team.name : "Transaction question",
        "Related ESPN source events may exist — no verified structured trade ledger",
      ],
    };
  }

  // --- Offseason summary ---
  if (/\boffseason\b/i.test(text) || /\bthis\s+offseason\b/i.test(text)) {
    const team = resolveTeamFromText(text);
    return {
      ...base,
      operation: "offseason_summary",
      entities: team
        ? [{ kind: "team", id: team.id, name: team.name }]
        : [{ kind: "team", id: "", name: "league" }],
      interpretation: [
        team ? `${team.name} offseason` : "League offseason",
        "Factual ESPN transaction events only",
      ],
    };
  }

  // --- Game lab / scoring leader in a matchup ---
  if (
    /\b(against|vs\.?|versus)\b/i.test(text) &&
    (/\b(scored|scoring|points|efg|decided|game)\b/i.test(text) ||
      /\bled\b/i.test(text))
  ) {
    const teams: Array<{ id: string; name: string }> = [];
    // Try to find two team mentions by scanning known patterns twice
    const t1 = resolveTeamFromText(text);
    if (t1) teams.push({ id: t1.id, name: t1.name });
    // crude second team: strip first match words and retry
    if (t1) {
      const stripped = text.replace(
        new RegExp(t1.name, "ig"),
        " "
      );
      const t2 = resolveTeamFromText(stripped);
      if (t2 && t2.id !== t1.id) teams.push({ id: t2.id, name: t2.name });
    }
    // Boston's game against Brooklyn style
    const vs = /\b([A-Za-z .]+?)\s+(?:against|vs\.?|versus)\s+([A-Za-z .]+?)(?:\s|$|\?)/i.exec(
      text
    );
    if (vs) {
      const a = resolveTeamFromText(vs[1]!);
      const b = resolveTeamFromText(vs[2]!);
      if (a && b) {
        teams.length = 0;
        teams.push({ id: a.id, name: a.name }, { id: b.id, name: b.name });
      }
    }

    const metric = resolveMetric(text, "player_season");
    const operation: QueryOperation =
      /\bdecided\b/i.test(text) || /\bwhat\s+decided\b/i.test(text)
        ? "game_lab"
        : /\bunusual\b/i.test(text) || /\bvs\.?\s+season\b/i.test(text)
          ? "box_score_context"
          : "game_lab";

    return {
      ...base,
      operation,
      entities: teams.map((t) => ({
        kind: "team" as const,
        id: t.id,
        name: t.name,
      })),
      metricId: metric?.id ?? (/\bpoints|scor/i.test(text) ? "points" : undefined),
      when: seasons.length ? { seasons } : undefined,
      interpretation: [
        teams.map((t) => t.name).join(" vs ") || "Game",
        operation === "game_lab" ? "Game Lab summary" : "Box-score context",
      ],
    };
  }

  // --- Team season stat ---
  const teamHit = resolveTeamFromText(text);
  const teamMetricHints =
    /\b(point\s+differential|scoring\s+margin|team\s+|celtics'|boston's|okc's|thunder's|nuggets')/i.test(
      text
    ) ||
    (teamHit &&
      /\b(differential|efg|true shooting|ts%|ppg|turnovers|rebounds)\b/i.test(
        text
      ));

  if (teamHit && (teamMetricHints || !possessivePlayerHint(text))) {
    // Prefer team path when a team is named and no clear player possessive
    const playerHint = possessivePlayerHint(text);
    const looksLikePlayer =
      playerHint &&
      (PLAYER_ALIASES[playerHint.toLowerCase()] ||
        /\b(lebron|jokic|curry|giannis|tatum)\b/i.test(playerHint));

    if (!looksLikePlayer || teamMetricHints) {
      const metric =
        resolveMetric(text, "team_season") ??
        (/\bdifferential|margin\b/i.test(text)
          ? metricById("team_diff")
          : resolveMetric(text));
      const season = seasons[0];
      if (metric && (metric.scope === "team_season" || metric.scope === "either")) {
        const teamMetric =
          metric.scope === "either"
            ? metricById(
                metric.id === "ts_pct"
                  ? "team_ts"
                  : metric.id === "efg_pct"
                    ? "team_efg"
                    : metric.id === "fg3_pct"
                      ? "team_fg3"
                      : metric.id === "ppg"
                        ? "team_ppg"
                        : metric.id === "tov"
                          ? "team_tov"
                          : metric.id === "rpg"
                            ? "team_rpg"
                            : metric.id
              ) ?? metric
            : metric;

        return {
          ...base,
          operation: "team_season_stat",
          entities: [{ kind: "team", id: teamHit.id, name: teamHit.name }],
          metricId: teamMetric.id,
          when: season ? { seasons: [season] } : undefined,
          interpretation: [
            teamHit.name,
            season ?? "season unresolved",
            teamMetric.label,
          ],
        };
      }
      if (/\bdifferential|margin\b/i.test(text)) {
        return {
          ...base,
          operation: "team_season_stat",
          entities: [{ kind: "team", id: teamHit.id, name: teamHit.name }],
          metricId: "team_diff",
          when: season ? { seasons: [season] } : undefined,
          interpretation: [
            teamHit.name,
            season ?? "season unresolved",
            "Point differential",
          ],
        };
      }
    }
  }

  // --- Player season stat (default useful class) ---
  {
    const playerHint = possessivePlayerHint(text) ?? extractPlayerNameLoose(text);
    const metric = resolveMetric(text, "player_season") ?? resolveMetric(text);
    const season = seasons[0];
    if (playerHint && metric) {
      return {
        ...base,
        operation: "season_stat",
        entities: [{ kind: "player", id: "", name: playerHint }],
        metricId: metric.id,
        when: season ? { seasons: [season] } : undefined,
        interpretation: [
          playerHint,
          season ?? "season unresolved",
          metric.label,
        ],
      };
    }
    if (playerHint && !metric) {
      return {
        ...base,
        operation: "season_stat",
        entities: [{ kind: "player", id: "", name: playerHint }],
        when: season ? { seasons: [season] } : undefined,
        interpretation: [
          playerHint,
          season ?? "season unresolved",
          "metric unresolved",
        ],
      };
    }
  }

  return {
    ...base,
    operation: "season_stat",
    entities: [],
    when: seasons.length ? { seasons } : undefined,
    interpretation: [
      "Could not map this question to a supported ASK DRBL query class.",
    ],
    unsupported: ["unrecognized query shape"],
    unsupportedReason:
      "ASK DRBL v1 supports player/team season stats, leaderboards, season compare/rank, career resume, and limited game/offseason questions. Rephrase or pick an example prompt.",
  };
}

function extractPlayerNameLoose(text: string): string | null {
  // "What was LeBron James TS%" / "Rank LeBron's best"
  for (const key of Object.keys(PLAYER_ALIASES)) {
    if (new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`, "i").test(text)) {
      return PLAYER_ALIASES[key]!.name;
    }
  }
  const m = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/.exec(text);
  if (!m) return null;
  const skip = new Set([
    "What",
    "Who",
    "How",
    "Rank",
    "Compare",
    "Which",
    "Was",
    "The",
    "Nba",
    "True",
    "Shooting",
    "Usage",
    "Boston",
    "Oklahoma",
    "City",
    "Denver",
  ]);
  if (skip.has(m[1]!)) return null;
  return m[1]!;
}
