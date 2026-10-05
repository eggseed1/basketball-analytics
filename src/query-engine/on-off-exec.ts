import { resolveNbaIdForDrbl } from "@/data/identity/player-identity";
import {
  getOnOffPlayoffTeams,
  getOnOffSeasons,
  getPlayerOnOffData,
  getPlayerOnOffSeasons,
} from "@/data/queries/on-off";
import { Z95, playerDetail, SMALL_SAMPLE_POSS } from "@/lib/on-off/derive";
import { playerHref } from "@/lib/player-page-contract";

import { buildQueryPlan } from "./followups";
import { onOffViewLabel } from "./on-off-intent";
import type { AskDrblResult, BasketballQueryAst } from "./types";
import { ASK_DRBL_VERSION } from "./types";

const MINUS = "\u2212";

function signed(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Number(v.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return `${r > 0 ? "+" : MINUS}${Math.abs(r).toFixed(digits)}`;
}

function ordinal(p: number): string {
  const m100 = p % 100;
  const m10 = p % 10;
  const suffix = m100 >= 11 && m100 <= 13 ? "th" : m10 === 1 ? "st" : m10 === 2 ? "nd" : m10 === 3 ? "rd" : "th";
  return `${p}${suffix}`;
}

function base(ast: BasketballQueryAst, status: AskDrblResult["status"]): AskDrblResult {
  return {
    status,
    version: ASK_DRBL_VERSION,
    rawQuery: ast.rawQuery ?? "",
    ast,
    interpretation: [...ast.interpretation, ...(ast.seasonNotes ?? [])],
    queryPlan: buildQueryPlan(ast),
  };
}

const METHODOLOGY = [
  "Every possession of every game is tagged with the ten players on the floor, rebuilt from NBA play-by-play.",
  "Swing is the team's net rating with him on the floor minus its net rating with him off it, per 100 possessions.",
  "Filtered leaves out garbage time (the Cleaning the Glass definition) and possessions that start with 2 seconds or less. Clutch is the last five minutes of the fourth quarter or overtime with the score within five.",
];

const LIMITATIONS = [
  "On/off follows the whole lineup. Teammates, opponents and his backups all move it, so it is context for his value and not a measure of it.",
];

export async function execPlayerOnOff(ast: BasketballQueryAst): Promise<AskDrblResult> {
  const player = ast.entities.find((e) => e.kind === "player");
  const view = ast.onOff?.view ?? "clean";
  const phase = ast.onOff?.phase ?? "regular";
  const seasons = await getOnOffSeasons();
  const season = ast.when?.seasons?.[0] ?? seasons[0];
  const covered = seasons.slice().reverse().join(", ") || "no seasons yet";

  if (!player?.id) {
    return { ...base(ast, "no_result"), errors: ["Could not resolve the player."] };
  }
  if (!season || !seasons.includes(season)) {
    return {
      ...base(ast, "insufficient_data"),
      errors: [`Possession-level on/off isn't built for ${season ?? "that season"}. It covers ${covered}.`],
      links: [{ label: "Learn on/off →", href: "/learn/on-off" }],
    };
  }
  if (phase === "playoffs" && !(await getOnOffPlayoffTeams(season)).length) {
    return {
      ...base(ast, "insufficient_data"),
      errors: [`Playoff on/off isn't built for ${season}.`],
    };
  }

  const nbaId = await resolveNbaIdForDrbl(player.id);
  const stints = await getPlayerOnOffData([nbaId, player.id], season, phase);
  const pageHref = playerHref({ playerId: player.id, season, view: "onoff" });
  const phaseText = phase === "playoffs" ? "playoffs" : "regular season";
  if (!stints.length) {
    return {
      ...base(ast, "insufficient_data"),
      errors: [`No ${phaseText} possessions for ${player.name ?? "this player"} in ${season}.`],
      links: [{ label: "View player →", href: `/players/${player.id}?season=${encodeURIComponent(season)}` }],
    };
  }

  const { file, league, playerId } = stints[0]!;
  const d = playerDetail(file, league, playerId, view);
  const name = file.players.find((p) => p.id === playerId)?.name ?? player.name ?? "He";
  if (!d || d.row.cmp.netDiff == null) {
    const scope = view === "clutch" ? "clutch possessions" : "possessions";
    const why = !d || d.row.poss === 0
      ? `${name} played no ${file.teamAbbr} ${scope} in the ${season} ${phaseText}.`
      : d.row.onShare != null && d.row.onShare >= 0.999
        ? `${name} was on the floor for every ${file.teamAbbr} ${view === "clutch" ? "clutch possession" : "possession"} in the ${season} ${phaseText}, so there is no off sample to compare.`
        : `Not enough ${file.teamAbbr} ${scope} with and without ${name} to compare.`;
    return {
      ...base(ast, "insufficient_data"),
      errors: [why],
      links: [{ label: "Open on/off →", href: pageHref }],
    };
  }

  const { row } = d;
  const { cmp } = row;
  const swing = cmp.netDiff!;
  const se = cmp.netDiffSe;
  const range = se != null ? `${signed(swing - Z95 * se)} to ${signed(swing + Z95 * se)}` : null;
  const context: string[] = [
    `On net ${signed(cmp.on.net)}, off net ${signed(cmp.off.net)} over ${Math.round(row.poss).toLocaleString("en-US")} possessions on the floor.`,
  ];
  if (range) context.push(`95% range ${range}. ${row.smallSample ? "Small sample, so the range matters more than the swing." : ""}`.trim());
  context.push(`Luck-adjusted swing ${signed(cmp.netLuckAdjDiff)} with opponent 3P% and FT% at league average.`);
  context.push(`Offense ${signed(cmp.ortgDiff)}, defense ${signed(cmp.drtgDiff)} points allowed per 100 (negative is better).`);
  if (row.netDiffPercentile != null) {
    context.push(`${ordinal(row.netDiffPercentile)} percentile among players with 2,000 or more possessions.`);
  }
  if (row.quality.teammatesOn != null && row.quality.teammatesOff != null) {
    context.push(
      `Teammates averaged ${signed(row.quality.teammatesOn, 2)} DRBL/100 with him and ${signed(row.quality.teammatesOff, 2)} without. Opponents averaged ${signed(row.quality.opponentsOn, 2)} against him.`
    );
  }
  if (d.replacements[0]) {
    const r = d.replacements[0];
    context.push(
      `${r.name} takes the most extra floor time when he sits: ${Math.round(r.shareWithout * 100)}% of possessions without him, ${Math.round(r.shareWith * 100)}% with him.`
    );
  }
  const yearly = (await getPlayerOnOffSeasons([nbaId, player.id]))
    .filter((r) => r.phase === "regular" && r.views[view].poss > 0)
    .map((r) => `${r.season} ${r.teamAbbr} ${signed(r.views[view].swing)}${r.views[view].smallSample ? " (small sample)" : ""}`);
  if (yearly.length > 1) {
    context.push(`Regular-season swing by year: ${yearly.join(", ")}.`);
  }
  if (stints.length > 1) {
    context.push(`He also played for ${stints.slice(1).map((s) => s.file.teamAbbr).join(", ")} that season. This answer covers ${file.teamAbbr}, where he logged the most possessions.`);
  }

  return {
    ...base(ast, "ok"),
    interpretation: [name, season, `${onOffViewLabel(view)} · ${phase === "playoffs" ? "Playoffs" : "Regular season"}`],
    headline: `${file.teamAbbr} was ${Math.abs(swing).toFixed(1)} points per 100 possessions ${
      swing < 0 ? "worse" : "better"
    } with ${name} on the floor in the ${season} ${phaseText}.`,
    valueDisplay: signed(swing),
    detailLines: context,
    contextLines: context,
    methodology: [
      ...METHODOLOGY,
      `Small sample marks fewer than ${SMALL_SAMPLE_POSS.toLocaleString("en-US")} possessions on or off.`,
    ],
    source: `NBA play-by-play · DRBL on/off build · ${season} ${phaseText}`,
    limitations: LIMITATIONS,
    links: [
      { label: "Open full on/off →", href: pageHref },
      { label: "Learn on/off →", href: "/learn/on-off" },
    ],
  };
}
