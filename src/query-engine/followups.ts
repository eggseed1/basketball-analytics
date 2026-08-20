import { metricById } from "./metrics";
import type { AskDrblResult, BasketballQueryAst, QueryOperation } from "./types";
import { askContextSourceLabel } from "./ask-context";

export type QueryPlanRow = { label: string; value: string };

/** Human-readable query plan from a validated (or partial) AST. */
export function buildQueryPlan(ast: BasketballQueryAst): QueryPlanRow[] {
  const rows: QueryPlanRow[] = [];
  const player = ast.entities.find((e) => e.kind === "player");
  const teams = ast.entities.filter((e) => e.kind === "team");
  if (player) {
    rows.push({ label: "Player", value: player.name ?? player.id });
  }
  if (teams.length === 1) {
    rows.push({ label: "Team", value: teams[0]!.name ?? teams[0]!.id });
  } else if (teams.length >= 2) {
    rows.push({
      label: "Teams",
      value: teams
        .slice(0, 2)
        .map((t) => t.name ?? t.id)
        .join(" vs "),
    });
  }
  if (ast.when?.seasons?.length) {
    rows.push({
      label: ast.when.seasons.length > 1 ? "Seasons" : "Season",
      value: ast.when.seasons.join(" · "),
    });
  }
  if (ast.seasonSource) {
    rows.push({
      label: "Source of context",
      value: askContextSourceLabel(ast.seasonSource),
    });
  }
  if (ast.contextDate) {
    rows.push({
      label: "Date context",
      value: ast.contextDateApplied
        ? ast.contextDate
        : `${ast.contextDate} (not applied - season-level ASK only)`,
    });
  }
  if (ast.metricId) {
    rows.push({
      label: "Metric",
      value: metricById(ast.metricId)?.label ?? ast.metricId,
    });
  }
  rows.push({ label: "Operation", value: operationLabel(ast.operation) });
  rows.push({ label: "Scope", value: "Regular season (box / season boards)" });
  rows.push({
    label: "Population",
    value: populationFor(ast.operation),
  });
  if (ast.seasonNotes?.length) {
    rows.push({ label: "Season notes", value: ast.seasonNotes.join(" ") });
  }
  if (ast.unsupported?.length) {
    rows.push({
      label: "Unsupported clauses",
      value: ast.unsupported.join("; "),
    });
  }
  return rows;
}

function operationLabel(op: QueryOperation): string {
  switch (op) {
    case "season_stat":
      return "Player season statistic";
    case "team_season_stat":
      return "Team season statistic";
    case "leaderboard":
      return "Qualified leaderboard";
    case "season_compare":
      return "Player season comparison";
    case "team_season_compare":
      return "Team season / team vs team comparison";
    case "team_season_rank":
      return "Rank Team Seasons (Copeland)";
    case "team_season_game_evidence":
      return "Team season game evidence";
    case "season_rank":
      return "Rank My Seasons (Copeland)";
    case "career_resume":
      return "Career Resume (CPI)";
    case "game_lab":
      return "Game Lab summary";
    case "box_score_context":
      return "Box-score context";
    case "offseason_summary":
      return "Offseason transaction events";
    default:
      return op;
  }
}

function populationFor(op: QueryOperation): string {
  switch (op) {
    case "leaderboard":
      return "Qualified player-season rows (≥20 GP · ≥500 MIN)";
    case "season_stat":
    case "season_compare":
    case "season_rank":
    case "career_resume":
      return "Qualified player-season row(s)";
    case "team_season_stat":
    case "team_season_compare":
    case "team_season_rank":
      return "Team-season board row";
    case "team_season_game_evidence":
      return "Final regular-season GameSummary rows (scores only)";
    case "game_lab":
      return "Game box score + team totals";
    case "offseason_summary":
      return "ESPN transaction event archive";
    default:
      return "Existing DRBL analytical systems";
  }
}

export function buildFollowUpLinks(
  ast: BasketballQueryAst,
  existing: AskDrblResult["links"] = []
): NonNullable<AskDrblResult["links"]> {
  const links: NonNullable<AskDrblResult["links"]> = [...(existing ?? [])];
  const seenHref = new Set(links.map((l) => l.href));
  const seenLabel = new Set(
    links.map((l) => l.label.toLowerCase().replace(/→/g, "").trim())
  );
  const pathKey = (href: string) => href.split("?")[0]?.split("#")[0] ?? href;
  const seenPath = new Set(links.map((l) => pathKey(l.href)));
  const add = (label: string, href: string) => {
    const labelKey = label.toLowerCase().replace(/→/g, "").trim();
    if (seenHref.has(href) || seenLabel.has(labelKey)) return;
    const path = pathKey(href);
    // Allow /offseason open + filter variants; otherwise one link per path.
    if (seenPath.has(path) && path !== "/offseason") return;
    seenHref.add(href);
    seenLabel.add(labelKey);
    seenPath.add(path);
    links.push({ label, href });
  };

  const player = ast.entities.find((e) => e.kind === "player");
  const team = ast.entities.find((e) => e.kind === "team");
  const seasons = ast.when?.seasons ?? [];

  switch (ast.operation) {
    case "season_stat":
      if (player?.id) {
        add(
          "Explore player →",
          `/players/${player.id}${seasons[0] ? `?season=${encodeURIComponent(seasons[0])}` : ""}`
        );
        if (seasons[0]) {
          add(
            "Compare this season →",
            `/players/${player.id}/season-compare?a=${encodeURIComponent(seasons[0])}`
          );
        }
        add("Rank his seasons →", `/players/${player.id}/season-rank`);
        if (ast.metricId) {
          const m = metricById(ast.metricId);
          if (m?.learnHref) add("View methodology →", m.learnHref);
        }
      }
      break;
    case "season_compare":
      if (player?.id && seasons[0] && seasons[1]) {
        add(
          "Open full comparison →",
          `/players/${player.id}/season-compare?a=${encodeURIComponent(seasons[0])}&b=${encodeURIComponent(seasons[1])}`
        );
        add(
          "Rank these seasons →",
          `/players/${player.id}/season-rank?seasons=${encodeURIComponent(
            `${seasons[0]},${seasons[1]}`
          )}`
        );
        add("View player →", `/players/${player.id}`);
      }
      break;
    case "season_rank":
      if (player?.id) {
        add("Open Season Rank →", `/players/${player.id}/season-rank`);
        add("View Career Resume →", `/players/${player.id}`);
        add("Compare seasons →", `/players/${player.id}/season-compare`);
      }
      break;
    case "career_resume":
      if (player?.id) {
        add("View Career Resume →", `/players/${player.id}`);
        add("Rank seasons →", `/players/${player.id}/season-rank`);
        add("Compare seasons →", `/players/${player.id}/season-compare`);
      }
      break;
    case "leaderboard":
      if (seasons[0]) {
        add(
          "Open leaderboard →",
          `/explore/players?season=${encodeURIComponent(seasons[0])}`
        );
      }
      break;
    case "team_season_stat":
      if (team?.id) {
        add(
          "View team →",
          `/teams/${team.id}${seasons[0] ? `?season=${encodeURIComponent(seasons[0])}` : ""}`
        );
        add("Team leaderboard →", `/explore/teams`);
      }
      break;
    case "team_season_compare": {
      const teams = ast.entities.filter((e) => e.kind === "team");
      const a = teams[0];
      const b = teams[1] ?? teams[0];
      const sa = seasons[0];
      const sb = seasons[1] ?? sa;
      if (a?.id && b?.id && sa && sb) {
        add(
          "Open full comparison →",
          `/compare?mode=teams&teamA=${encodeURIComponent(a.id)}&teamB=${encodeURIComponent(b.id)}&seasonA=${encodeURIComponent(sa)}&seasonB=${encodeURIComponent(sb)}`
        );
      }
      if (a?.id) {
        add(
          "Rank this team's seasons →",
          `/compare?mode=teams&view=rank&teamId=${encodeURIComponent(a.id)}`
        );
      }
      break;
    }
    case "team_season_rank":
      if (team?.id) {
        const seasonQs = seasons.length
          ? `&seasons=${encodeURIComponent(seasons.join(","))}`
          : "";
        add(
          "Open Team Season Ranking →",
          `/compare?mode=teams&view=rank&teamId=${encodeURIComponent(team.id)}${seasonQs}`
        );
        add(
          "View team →",
          `/teams/${team.id}${seasons[0] ? `?season=${encodeURIComponent(seasons[0])}` : ""}`
        );
        add(
          "Compare seasons →",
          `/compare?mode=teams&teamA=${encodeURIComponent(team.id)}&teamB=${encodeURIComponent(team.id)}`
        );
      }
      break;
    case "team_season_game_evidence":
      if (team?.id) {
        add(
          "Rank this team's seasons →",
          `/compare?mode=teams&view=rank&teamId=${encodeURIComponent(team.id)}`
        );
        add(
          "View team →",
          `/teams/${team.id}${seasons[0] ? `?season=${encodeURIComponent(seasons[0])}` : ""}`
        );
      }
      break;
    case "game_lab":
    case "box_score_context": {
      const gameLink = links.find((l) => l.href.startsWith("/games/"));
      if (gameLink) {
        add("View box score →", `${gameLink.href.split("?")[0]}#box`);
      }
      break;
    }
    case "offseason_summary":
      add("Open Offseason Tracker →", "/offseason");
      if (team?.id) {
        // Prefer filter link when team-specific; pathname differs from bare /offseason
        add(
          "Filter this team →",
          `/offseason?team=${encodeURIComponent(team.id)}`
        );
      }
      break;
  }

  return links.slice(0, 4);
}
