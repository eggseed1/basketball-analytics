import { metricById } from "./metrics";
import type { BasketballQueryAst, QueryValidation } from "./types";

const PBP_FIELDS_PRESENT = (ast: BasketballQueryAst): string[] => {
  const bad: string[] = [];
  if (ast.where) bad.push("shot-zone / where filter");
  if (ast.when?.quarter != null) bad.push("quarter filter");
  if (ast.when?.clockMaxSeconds != null) bad.push("game-clock filter");
  if (ast.situation?.clutch || ast.situation?.transition) {
    bad.push("situation filter");
  }
  if (ast.event === "possession") bad.push("possession event");
  return bad;
};

/** Capability-aware validator — refuses unsupported / ambiguous / incomplete ASTs. */
export function validateBasketballQuery(
  ast: BasketballQueryAst
): QueryValidation {
  // Partial before unsupported: supported clause disclosed, never auto-answered.
  if (ast.partialSupportedQuery && ast.unsupported?.length) {
    return {
      ok: false,
      status: "partial",
      errors: [
        ast.unsupportedReason ??
          "Part of this question is supported; other clauses are not.",
      ],
      ast,
    };
  }

  if (ast.unsupported?.length) {
    const vague =
      ast.unsupported.includes("ambiguous competitive language") ||
      /ambiguous/i.test(ast.unsupportedReason ?? "");
    return {
      ok: false,
      status: vague ? "ambiguous" : "unsupported",
      errors: [
        ast.unsupportedReason ??
          `Not supported yet: ${ast.unsupported.join(", ")}.`,
      ],
      ast,
    };
  }

  const pbpLeak = PBP_FIELDS_PRESENT(ast);
  if (pbpLeak.length) {
    return {
      ok: false,
      status: "unsupported",
      errors: [
        `This AST includes executable PBP fields ASK DRBL cannot run yet: ${pbpLeak.join(", ")}.`,
      ],
      ast,
    };
  }

  if (ast.ambiguous?.length) {
    return {
      ok: false,
      status: "ambiguous",
      errors: ast.ambiguous.map(
        (a) =>
          `Multiple possible ${a.kind}s for “${a.query}”. Which one did you mean?`
      ),
      ast,
    };
  }

  const needsEntity =
    ast.operation !== "leaderboard" &&
    !(
      ast.operation === "offseason_summary" &&
      ast.entities.some((e) => e.kind === "team" && e.name === "league")
    );

  if (needsEntity && !ast.entities.length) {
    return {
      ok: false,
      status: "invalid",
      errors: ["Query needs a player or team."],
      ast,
    };
  }

  for (const ent of ast.entities) {
    if (ent.kind === "lineup") continue;
    if (!ent.id) {
      return {
        ok: false,
        status: "no_result",
        errors: [
          `Could not resolve ${ent.kind}${ent.name ? ` “${ent.name}”` : ""}.`,
        ],
        ast,
      };
    }
  }

  const needsMetric = (
    [
      "season_stat",
      "team_season_stat",
      "leaderboard",
    ] as BasketballQueryAst["operation"][]
  ).includes(ast.operation);

  if (needsMetric && !ast.metricId) {
    return {
      ok: false,
      status: "invalid",
      errors: ["This metric cannot be calculated — no supported metric matched."],
      ast,
    };
  }

  if (ast.metricId && !metricById(ast.metricId)) {
    return {
      ok: false,
      status: "invalid",
      errors: [`Unknown metric “${ast.metricId}”.`],
      ast,
    };
  }

  if (
    (ast.operation === "season_stat" ||
      ast.operation === "team_season_stat" ||
      ast.operation === "leaderboard") &&
    !ast.when?.seasons?.length
  ) {
    return {
      ok: false,
      status: "invalid",
      errors: ["A season is required for this query."],
      ast,
    };
  }

  if (
    ast.operation === "season_compare" &&
    (ast.when?.seasons?.length ?? 0) < 2
  ) {
    return {
      ok: false,
      status: "invalid",
      errors: ["Season compare needs two seasons."],
      ast,
    };
  }

  if (
    ast.operation === "game_lab" &&
    ast.entities.filter((e) => e.kind === "team").length < 1
  ) {
    return {
      ok: false,
      status: "invalid",
      errors: ["Game questions need at least one team."],
      ast,
    };
  }

  return { ok: true, ast };
}
