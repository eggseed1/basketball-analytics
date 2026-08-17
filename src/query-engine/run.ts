import { getPlayer } from "@/data/queries/players";
import { getPlayerCareerSeasons } from "@/data/queries/players";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { interpretAskQuery } from "./interpret";
import { resolveQueryEntities } from "./entities";
import { validateBasketballQuery } from "./validate";
import { executeBasketballQuery } from "./execute";
import { buildFollowUpLinks, buildQueryPlan } from "./followups";
import { applyAskContext, type AskContext } from "./ask-context";
import type { AskDrblResult, BasketballQueryAst } from "./types";
import { ASK_DRBL_VERSION } from "./types";

export type RunAskDrblOptions = {
  /** Continue after ambiguity — force-resolve the player entity. */
  playerId?: string;
  /** Force-resolve the team entity (e.g. deep link from a team page). */
  teamId?: string;
  /**
   * Historical / shareable season context (Time Machine).
   * Never overrides an explicit season in the query text.
   */
  context?: AskContext | null;
};

async function enrichAmbiguousCandidates(
  ast: BasketballQueryAst
): Promise<BasketballQueryAst> {
  if (!ast.ambiguous?.length) return ast;
  const next = {
    ...ast,
    ambiguous: await Promise.all(
      ast.ambiguous.map(async (group) => {
        if (group.kind !== "player") return group;
        const candidates = await Promise.all(
          group.candidates.map(async (c) => {
            try {
              const [player, career] = await Promise.all([
                getPlayer(c.id),
                getPlayerCareerSeasons(c.id),
              ]);
              const teamId = player?.currentTeamId ?? career[0]?.teamId;
              const brand = teamId ? resolveTeamBrand(teamId) : null;
              const seasons = career
                .map((r) => r.season)
                .filter(Boolean)
                .sort();
              const years =
                seasons.length > 0
                  ? `${seasons[0]}–${seasons[seasons.length - 1]}`
                  : undefined;
              const bits = [
                brand?.abbr,
                player?.position,
                years,
              ].filter(Boolean);
              return {
                ...c,
                name: player?.fullName ?? c.name,
                subtitle: bits.length ? bits.join(" · ") : c.subtitle,
              };
            } catch {
              return c;
            }
          })
        );
        return { ...group, candidates };
      })
    ),
  };
  return next;
}

function applyPlayerIdOverride(
  ast: BasketballQueryAst,
  playerId: string
): BasketballQueryAst {
  const entities = ast.entities.map((e) => {
    if (e.kind !== "player") return e;
    return { ...e, id: playerId, name: e.name };
  });
  // If no player entity yet, inject one
  const hasPlayer = entities.some((e) => e.kind === "player");
  return {
    ...ast,
    entities: hasPlayer
      ? entities
      : [{ kind: "player", id: playerId }, ...entities],
    ambiguous: undefined,
  };
}

function applyTeamIdOverride(
  ast: BasketballQueryAst,
  teamId: string
): BasketballQueryAst {
  const resolved = resolveCanonicalTeam(teamId);
  const canonicalId =
    resolved.status === "resolved"
      ? resolved.team.canonicalTeamId
      : teamId.trim();
  const displayName =
    resolved.status === "resolved"
      ? resolved.team.abbr
      : (resolveTeamBrand(teamId)?.abbr ?? teamId);
  const entities = ast.entities.map((e) => {
    if (e.kind !== "team") return e;
    // Keep a distinct second team in cross-team compares.
    if (e.id && e.id !== canonicalId) return e;
    return { ...e, id: canonicalId, name: displayName };
  });
  const hasTeam = entities.some((e) => e.kind === "team");
  return {
    ...ast,
    entities: hasTeam
      ? entities
      : [{ kind: "team", id: canonicalId, name: displayName }, ...entities],
    ambiguous: undefined,
  };
}

function withPlanAndFollowUps(result: AskDrblResult): AskDrblResult {
  const queryPlan = result.queryPlan ?? buildQueryPlan(result.ast);
  const links = buildFollowUpLinks(result.ast, result.links);
  return { ...result, queryPlan, links };
}

/**
 * Full ASK DRBL pipeline:
 * language → AST → entity resolve → validate → trusted execute.
 */
export async function runAskDrbl(
  rawQuery: string,
  options: RunAskDrblOptions = {}
): Promise<AskDrblResult> {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    const ast: BasketballQueryAst = {
      version: 1,
      operation: "season_stat",
      entities: [],
      interpretation: ["Empty query"],
      rawQuery: "",
    };
    return {
      status: "invalid",
      version: ASK_DRBL_VERSION,
      rawQuery: "",
      ast,
      interpretation: ["Empty query"],
      errors: ["Enter a basketball question to ask DRBL."],
      queryPlan: buildQueryPlan(ast),
    };
  }

  let ast = interpretAskQuery(trimmed);
  ast = applyAskContext(ast, options.context);

  const forcedEntity = Boolean(
    (options.playerId || options.teamId) && !ast.unsupported?.length
  );

  if (options.playerId && !ast.unsupported?.length) {
    ast = applyPlayerIdOverride(ast, options.playerId);
    // Resolve name for the forced id
    try {
      const player = await getPlayer(options.playerId);
      if (player) {
        ast = {
          ...ast,
          entities: ast.entities.map((e) =>
            e.kind === "player"
              ? { ...e, id: options.playerId!, name: player.fullName }
              : e
          ),
          interpretation: [
            player.fullName,
            ...ast.interpretation.filter(
              (line) =>
                !/player/i.test(line) ||
                line.toLowerCase() === player.fullName.toLowerCase()
            ),
          ],
        };
      }
    } catch {
      /* keep id */
    }
  }

  if (options.teamId && !ast.unsupported?.length) {
    ast = applyTeamIdOverride(ast, options.teamId);
    const brand = resolveTeamBrand(options.teamId);
    if (brand) {
      const canonicalId = brand.espnTeamId;
      ast = {
        ...ast,
        entities: ast.entities.map((e) => {
          if (e.kind !== "team") return e;
          if (e.id && e.id !== canonicalId) return e;
          return { ...e, id: canonicalId, name: brand.abbr };
        }),
        interpretation: [
          brand.abbr,
          ...ast.interpretation.filter(
            (line) => line.toLowerCase() !== brand.abbr.toLowerCase()
          ),
        ],
      };
    }
  }

  if (
    !forcedEntity &&
    !ast.unsupported?.length &&
    !ast.partialSupportedQuery
  ) {
    ast = await resolveQueryEntities(ast);
  }

  const validation = validateBasketballQuery(ast);
  if (!validation.ok) {
    let failedAst = validation.ast;
    if (validation.status === "ambiguous" && failedAst.ambiguous?.length) {
      failedAst = await enrichAmbiguousCandidates(failedAst);
    }

    const base: AskDrblResult = {
      status: validation.status,
      version: ASK_DRBL_VERSION,
      rawQuery: trimmed,
      ast: failedAst,
      interpretation: [
        ...failedAst.interpretation,
        ...(failedAst.seasonNotes ?? []),
      ],
      errors: validation.errors,
      limitations: failedAst.unsupportedReason
        ? [failedAst.unsupportedReason]
        : undefined,
      queryPlan: buildQueryPlan(failedAst),
      payload:
        validation.status === "ambiguous"
          ? { ambiguous: failedAst.ambiguous }
          : validation.status === "partial"
            ? {
                partialSupportedQuery: failedAst.partialSupportedQuery,
                partialSupportedSummary: failedAst.partialSupportedSummary,
                unsupported: failedAst.unsupported,
              }
            : undefined,
    };

    if (validation.status === "partial" && failedAst.partialSupportedQuery) {
      const partialHref = `/ask?q=${encodeURIComponent(failedAst.partialSupportedQuery)}`;
      const withCtx =
        options.context?.season
          ? (() => {
              const p = new URLSearchParams();
              p.set("q", failedAst.partialSupportedQuery!);
              p.set("season", options.context!.season!);
              if (options.context!.date) p.set("date", options.context!.date);
              if (options.context!.source === "time_machine") {
                p.set("from", "history");
              }
              return `/ask?${p.toString()}`;
            })()
          : partialHref;
      base.headline = "Partially supported";
      base.detailLines = [
        failedAst.partialSupportedSummary
          ? `Supported portion: ${failedAst.partialSupportedSummary}`
          : null,
        "The following require possession-level PBP and are not answered here:",
        ...(failedAst.unsupported ?? []).map((c) => `• ${c}`),
      ].filter(Boolean) as string[];
      base.links = [
        {
          label: "Answer the supported portion →",
          href: withCtx,
        },
        {
          label: "Why the rest is unavailable →",
          href: "/learn",
        },
      ];
      base.methodology = [
        "ASK DRBL does not silently simplify unsupported clauses.",
        "Run the supported rewrite explicitly if you want that answer.",
      ];
      base.source = "ASK DRBL partial decomposition";
    }

    return withPlanAndFollowUps(base);
  }

  const executed = await executeBasketballQuery(validation.ast);
  return withPlanAndFollowUps(executed);
}
