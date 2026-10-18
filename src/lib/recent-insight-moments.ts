/**
 * Box-score moments in the shapes StatMuse leads with: the shooting line,
 * free throws on volume, threes, and a rebound or block night next to the
 * points. Every line is checked against this game only. Nothing here is a
 * league record.
 */

import type { InsightMoment, MomentMark, RecentInsightCategory, SlatePlayerLine } from "./recent-insights";

export type MomentHit = {
  shape: string;
  priority: number;
  category: RecentInsightCategory;
  /** Short label beside the big number. */
  heroLabel: string;
  heroValue: string;
  description: string;
  moment: InsightMoment;
};

export type MomentContext = {
  mates: SlatePlayerLine[];
  /** His team's points in this game. */
  teamPoints: number;
};

function mark(label: string, value: number, tick: number | undefined, tip: string, of?: number): MomentMark {
  return { label, value, tick, tip, ...(of != null ? { of } : {}) };
}

function also(line: SlatePlayerLine, skip: Array<"reb" | "ast" | "stl" | "blk">): string {
  const bits: string[] = [];
  if (!skip.includes("reb") && line.rebounds >= 10) bits.push(`${line.rebounds} rebounds`);
  if (!skip.includes("ast") && line.assists >= 10) bits.push(`${line.assists} assists`);
  if (!skip.includes("stl") && line.steals >= 4) bits.push(`${line.steals} steals`);
  if (!skip.includes("blk") && line.blocks >= 4) bits.push(`${line.blocks} blocks`);
  const shown = bits.slice(0, 2);
  if (!shown.length) return "";
  if (shown.length === 1) return ` He also had ${shown[0]}.`;
  return ` He also had ${shown[0]} and ${shown[1]}.`;
}

function uniqueOnTeam(line: SlatePlayerLine, mates: SlatePlayerLine[], pred: (l: SlatePlayerLine) => boolean): boolean {
  return pred(line) && mates.every((m) => !pred(m));
}

function pct(made: number, att: number): number | null {
  return att > 0 ? made / att : null;
}

/**
 * The single most interesting shape on this line, or null when the night is
 * ordinary. Callers still rank it against comebacks and other games.
 */
export function recognizeMoment(line: SlatePlayerLine, ctx: MomentContext): MomentHit | null {
  const hits: MomentHit[] = [];
  const { mates, teamPoints } = ctx;

  const five = line.points >= 5 && line.rebounds >= 5 && line.assists >= 5 && line.steals >= 5 && line.blocks >= 5;
  if (five) {
    const counts = [line.points, line.rebounds, line.assists, line.steals, line.blocks];
    hits.push({
      shape: "five",
      priority: 97,
      category: "PLAYER · BIG NIGHT",
      heroLabel: "5 in five columns",
      heroValue: counts.join("/"),
      description:
        `5 or more in points, rebounds, assists, steals, and blocks: ${counts.join(", ")}.` +
        (uniqueOnTeam(line, mates, (l) => l.points >= 5 && l.rebounds >= 5 && l.assists >= 5 && l.steals >= 5 && l.blocks >= 5)
          ? " Nobody else on his team had all five."
          : ""),
      moment: {
        kind: "meters",
        marks: [
          mark("PTS", line.points, 5, `${line.points} points. 5 is the line.`),
          mark("REB", line.rebounds, 5, `${line.rebounds} rebounds. 5 is the line.`),
          mark("AST", line.assists, 5, `${line.assists} assists. 5 is the line.`),
          mark("STL", line.steals, 5, `${line.steals} steals. 5 is the line.`),
          mark("BLK", line.blocks, 5, `${line.blocks} blocks. 5 is the line.`),
        ],
      },
    });
  }

  const twentyBoard = line.points >= 20 && line.rebounds >= 20;
  const twentyDime = line.points >= 20 && line.assists >= 20;
  if (twentyBoard || twentyDime) {
    const rebSide = twentyBoard && (!twentyDime || line.rebounds >= line.assists);
    const second = rebSide ? line.rebounds : line.assists;
    const secondLabel = rebSide ? "rebounds" : "assists";
    const huge = line.points >= 25 && second >= 25;
    hits.push({
      shape: huge ? "25-25" : "20-20",
      priority: huge ? 95 : 92,
      category: "PLAYER · BIG NIGHT",
      heroLabel: huge ? "25 and 25" : "20 and 20",
      heroValue: `${line.points}/${second}`,
      description: `${line.points} points and ${second} ${secondLabel}.${also(line, [rebSide ? "reb" : "ast"])}`,
      moment: {
        kind: "meters",
        marks: [
          mark("PTS", line.points, huge ? 25 : 20, `${line.points} points.`),
          mark(rebSide ? "REB" : "AST", second, huge ? 25 : 20, `${second} ${secondLabel}.`),
        ],
      },
    });
  }

  if (line.points >= 50) {
    hits.push({
      shape: "50",
      priority: 90,
      category: "PLAYER · BIG NIGHT",
      heroLabel: "Points",
      heroValue: String(line.points),
      description: `${line.points} points on ${line.fgm} of ${line.fga} from the field.${also(line, [])}`,
      moment: {
        kind: "meters",
        marks: [mark("PTS", line.points, 50, `${line.points} points. 50 is the line.`)],
      },
    });
  }

  if (line.points >= 40 && line.assists >= 10) {
    hits.push({
      shape: "40-10",
      priority: 87,
      category: "PLAYER · BIG NIGHT",
      heroLabel: "Points and assists",
      heroValue: `${line.points}/${line.assists}`,
      description: `${line.points} points and ${line.assists} assists.${also(line, ["ast"])}`,
      moment: {
        kind: "meters",
        marks: [
          mark("PTS", line.points, 40, `${line.points} points. 40 is the line.`),
          mark("AST", line.assists, 10, `${line.assists} assists. 10 is the line.`),
        ],
      },
    });
  }

  if (line.points >= 30 && line.rebounds >= 10 && line.assists >= 5) {
    const richer = line.rebounds >= 15 || line.assists >= 10;
    hits.push({
      shape: "30-10-5",
      priority: richer ? 85 : 82,
      category: line.assists >= 10 ? "PLAYER · PLAYMAKING" : "PLAYER · SCORING",
      heroLabel: "30 / 10 / 5",
      heroValue: `${line.points}/${line.rebounds}/${line.assists}`,
      description:
        `${line.points} points, ${line.rebounds} rebounds, and ${line.assists} assists.` +
        (uniqueOnTeam(line, mates, (l) => l.points >= 30 && l.rebounds >= 10 && l.assists >= 5)
          ? " Nobody else on his team had 30, 10, and 5."
          : "") +
        also(line, ["reb", "ast"]),
      moment: {
        kind: "meters",
        marks: [
          mark("PTS", line.points, 30, `${line.points} points. 30 is the line.`),
          mark("REB", line.rebounds, 10, `${line.rebounds} rebounds. 10 is the line.`),
          mark("AST", line.assists, 5, `${line.assists} assists. 5 is the line.`),
        ],
      },
    });
  }

  if (line.points >= 20 && line.rebounds >= 5 && line.assists >= 10) {
    hits.push({
      shape: "20-5-10",
      priority: 79,
      category: "PLAYER · PLAYMAKING",
      heroLabel: "20 / 5 / 10",
      heroValue: `${line.points}/${line.rebounds}/${line.assists}`,
      description:
        `${line.points} points, ${line.rebounds} rebounds, and ${line.assists} assists.` +
        (uniqueOnTeam(line, mates, (l) => l.points >= 20 && l.rebounds >= 5 && l.assists >= 10)
          ? " Nobody else on his team had 20, 5, and 10."
          : ""),
      moment: {
        kind: "meters",
        marks: [
          mark("PTS", line.points, 20, `${line.points} points. 20 is the line.`),
          mark("REB", line.rebounds, 5, `${line.rebounds} rebounds. 5 is the line.`),
          mark("AST", line.assists, 10, `${line.assists} assists. 10 is the line.`),
        ],
      },
    });
  }

  if (line.points >= 25 && (line.steals >= 5 || line.blocks >= 5)) {
    const stocks = line.steals >= 5 && line.blocks >= 3 ? "both" : line.steals >= line.blocks ? "stl" : "blk";
    const detail =
      stocks === "both"
        ? `${line.steals} steals and ${line.blocks} blocks`
        : stocks === "stl"
          ? `${line.steals} steals`
          : `${line.blocks} blocks`;
    hits.push({
      shape: "stocks",
      priority: 77,
      category: "PLAYER · DEFENSE",
      heroLabel: stocks === "blk" ? "Blocks" : "Steals",
      heroValue: stocks === "both" ? `${line.steals}+${line.blocks}` : stocks === "stl" ? String(line.steals) : String(line.blocks),
      description: `${line.points} points with ${detail}.`,
      moment: {
        kind: "meters",
        marks: [
          mark("PTS", line.points, 25, `${line.points} points. 25 is the line.`),
          ...(line.steals >= 5 ? [mark("STL", line.steals, 5, `${line.steals} steals. 5 is the line.`)] : []),
          ...(line.blocks >= 5 ? [mark("BLK", line.blocks, 5, `${line.blocks} blocks. 5 is the line.`)] : []),
        ],
      },
    });
  }

  const fg = pct(line.fgm, line.fga);
  const tp = pct(line.threePm, line.threePa);
  const ft = pct(line.ftm, line.fta);

  // Field and three together, even when he barely went to the line.
  // StatMuse prints this as the line (8-10 FG, 5-7 3P), not as true shooting.
  if (
    line.points >= 20 &&
    fg != null &&
    fg >= 0.6 &&
    line.fga >= 8 &&
    tp != null &&
    tp >= 0.45 &&
    line.threePm >= 4 &&
    line.threePa >= 4
  ) {
    const lineBits = `${line.fgm} of ${line.fga} from the field and ${line.threePm} of ${line.threePa} from three`;
    const free =
      ft != null && line.fta >= 2 && ft >= 0.8 ? `, and ${line.ftm} of ${line.fta} at the line` : "";
    hits.push({
      shape: "hot-shot",
      priority: 88,
      category: "PLAYER · SCORING",
      heroLabel: `FG, ${line.threePm}-${line.threePa} 3P`,
      heroValue: `${line.fgm}-${line.fga}`,
      description: `${lineBits}${free}, for ${line.points} points.`,
      moment: {
        kind: "splits",
        marks: [
          mark("FG", line.fgm, Math.round(line.fga * 0.5), `${line.fgm} of ${line.fga}.`, line.fga),
          mark("3P", line.threePm, Math.round(line.threePa * 0.4), `${line.threePm} of ${line.threePa}.`, line.threePa),
          ...(line.fta >= 2
            ? [mark("FT", line.ftm, Math.round(line.fta * 0.8), `${line.ftm} of ${line.fta}.`, line.fta)]
            : []),
        ],
      },
    });
  }

  // A pile of free throws, almost all made. The field line is extra when it is clean.
  if (ft != null && line.fta >= 12 && ft >= 0.875 && line.points >= 18) {
    const field =
      fg != null && fg >= 0.5 && line.fga >= 4 ? `, on ${line.fgm} of ${line.fga} from the field` : "";
    hits.push({
      shape: "free-throws",
      priority: 84,
      category: "PLAYER · SCORING",
      heroLabel: "At the line",
      heroValue: `${line.ftm}-${line.fta}`,
      description: `${line.ftm} of ${line.fta} at the line${field}. ${line.points} points.`,
      moment: {
        kind: "splits",
        marks: [
          mark("FT", line.ftm, Math.round(line.fta * 0.8), `${line.ftm} of ${line.fta}.`, line.fta),
          ...(line.fga >= 4
            ? [mark("FG", line.fgm, Math.round(line.fga * 0.5), `${line.fgm} of ${line.fga}.`, line.fga)]
            : []),
        ],
      },
    });
  }

  // Boards and blocks, the stock line, when the scoring night is not the story.
  if (line.rebounds >= 12 && line.blocks >= 3 && line.points < 20) {
    hits.push({
      shape: "glass",
      priority: 72,
      category: "PLAYER · REBOUNDING",
      heroLabel: `REB, ${line.blocks} BLK`,
      heroValue: String(line.rebounds),
      description: `${line.rebounds} rebounds and ${line.blocks} blocks.`,
      moment: {
        kind: "meters",
        marks: [
          mark("REB", line.rebounds, 10, `${line.rebounds} rebounds.`),
          mark("BLK", line.blocks, 3, `${line.blocks} blocks.`),
        ],
      },
    });
  }

  const madeThrees =
    line.threePm >= 8 ||
    (line.threePm >= 5 && line.threePa >= 6 && line.threePm / line.threePa >= 0.5);
  if (madeThrees && line.threePa >= line.threePm) {
    hits.push({
      shape: "threes",
      priority: line.threePm >= 8 ? 75 + Math.min(6, line.threePm - 8) : 74,
      category: "PLAYER · SCORING",
      heroLabel: "Threes",
      heroValue: String(line.threePm),
      description: `${line.threePm} threes on ${line.threePa} attempts, and ${line.points} points.`,
      moment: {
        kind: "threes",
        marks: [
          mark(
            "3PM",
            line.threePm,
            line.threePm >= 8 ? 8 : 5,
            `${line.threePm} of ${line.threePa} from three.`,
            line.threePa
          ),
        ],
      },
    });
  }

  if (line.turnovers === 0 && line.minutesNum >= 28 && (line.assists >= 10 || line.points >= 28)) {
    const withWhat = line.assists >= 10 ? `${line.assists} assists` : `${line.points} points`;
    hits.push({
      shape: "clean",
      priority: 74,
      category: "PLAYER · SCORING",
      heroLabel: "Turnovers",
      heroValue: "0",
      description: `0 turnovers in ${Math.round(line.minutesNum)} minutes, with ${withWhat}.`,
      moment: {
        kind: "clean",
        marks: [
          mark("TOV", 0, undefined, "0 turnovers."),
          line.assists >= 10
            ? mark("AST", line.assists, 10, `${line.assists} assists.`)
            : mark("PTS", line.points, 28, `${line.points} points.`),
        ],
      },
    });
  }

  if (teamPoints >= 80 && line.points >= 30 && line.points / teamPoints >= 0.45) {
    const share = Math.round((line.points / teamPoints) * 100);
    hits.push({
      shape: "share",
      priority: 71 + Math.min(8, share - 45),
      category: "PLAYER · SCORING",
      heroLabel: "Of his team's points",
      heroValue: `${share}%`,
      description: `${line.points} of his team's ${teamPoints} points.`,
      moment: {
        kind: "share",
        marks: [mark("PTS", line.points, undefined, `${line.points} of ${teamPoints} team points.`)],
        share: { points: line.points, team: teamPoints },
      },
    });
  }

  if (
    line.points >= 22 &&
    fg != null &&
    fg >= 0.5 &&
    line.fga >= 10 &&
    tp != null &&
    tp >= 0.4 &&
    line.threePa >= 5 &&
    ft != null &&
    ft >= 0.8 &&
    line.fta >= 8
  ) {
    hits.push({
      shape: "splits",
      priority: 70,
      category: "PLAYER · SCORING",
      heroLabel: "From the field",
      heroValue: `${Math.round(fg * 100)}%`,
      description: `Made ${line.fgm} of ${line.fga} from the field, ${line.threePm} of ${line.threePa} from three, and ${line.ftm} of ${line.fta} at the line. ${line.points} points.`,
      moment: {
        kind: "splits",
        marks: [
          mark("FG", line.fgm, Math.round(line.fga * 0.5), `${line.fgm} of ${line.fga}. The tick is 50%.`, line.fga),
          mark("3P", line.threePm, Math.round(line.threePa * 0.4), `${line.threePm} of ${line.threePa}. The tick is 40%.`, line.threePa),
          mark("FT", line.ftm, Math.round(line.fta * 0.8), `${line.ftm} of ${line.fta}. The tick is 80%.`, line.fta),
        ],
      },
    });
  }

  const next = [...mates].sort((a, b) => b.points - a.points || a.playerName.localeCompare(b.playerName))[0];
  if (next && line.points >= 32 && line.points - next.points >= 15) {
    hits.push({
      shape: "gap",
      priority: 68,
      category: "PLAYER · SCORING",
      heroLabel: "More than the next teammate",
      heroValue: `+${line.points - next.points}`,
      description: `${line.points} points. ${next.playerName} was next on his team with ${next.points}.`,
      moment: {
        kind: "meters",
        marks: [
          mark("PTS", line.points, next.points, `${line.points} points. ${next.playerName} had ${next.points}.`),
        ],
      },
    });
  }

  const club = [line, ...mates];
  const maxPts = Math.max(...club.map((l) => l.points));
  const maxAst = Math.max(...club.map((l) => l.assists));
  const alonePts = club.filter((l) => l.points === maxPts).length === 1;
  const aloneAst = club.filter((l) => l.assists === maxAst).length === 1;
  if (alonePts && aloneAst && line.points === maxPts && line.assists === maxAst && line.points >= 25 && line.assists >= 8) {
    hits.push({
      shape: "led-two",
      priority: 66,
      category: "PLAYER · PLAYMAKING",
      heroLabel: "Team leader, points and assists",
      heroValue: `${line.points}/${line.assists}`,
      description: `Led his team in points (${line.points}) and assists (${line.assists}).`,
      moment: {
        kind: "meters",
        marks: [
          mark("PTS", line.points, undefined, `${line.points} points, most on his team.`),
          mark("AST", line.assists, undefined, `${line.assists} assists, most on his team.`),
        ],
      },
    });
  }

  hits.sort((a, b) => b.priority - a.priority || a.shape.localeCompare(b.shape));
  return hits[0] ?? null;
}

/**
 * Three games of 30 or more inside the loaded window. The copy names the
 * games. It does not call them a streak unless they sit within a week.
 */
export function pointsRun(games: SlatePlayerLine[]): { inAWeek: boolean; points: number[] } | null {
  if (games.length < 3) return null;
  const last = [...games].sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.gameId.localeCompare(b.gameId)).slice(-3);
  if (last.some((g) => g.points < 30)) return null;
  const span = (Date.parse(`${last[2]!.gameDate}T12:00:00Z`) - Date.parse(`${last[0]!.gameDate}T12:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(span)) return null;
  return { inAWeek: span <= 7, points: last.map((g) => g.points) };
}
