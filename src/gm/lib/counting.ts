import type { GmBoxScore, GmCountingLine, GmLeagueState, GmRatings } from "@/gm/types";
import { UNAVAILABLE_STAT_LABEL, formatCountingRate, formatNumber } from "@/lib/format";

export function perGame(total: number, gp: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(gp) || gp < 1) return null;
  return total / gp;
}

export function rateLabel(total: number, gp: number, digits = 1): string {
  const value = perGame(total, gp);
  if (value == null) return UNAVAILABLE_STAT_LABEL;
  return formatCountingRate(value, digits);
}

/** Shooting percentage. Blank when there are no attempts. */
export function shotLabel(made: number, attempted: number): string {
  if (!Number.isFinite(made) || !Number.isFinite(attempted) || attempted <= 0) {
    return UNAVAILABLE_STAT_LABEL;
  }
  return formatNumber(made / attempted, 3).replace(/^0/, "");
}

export function simCountingLine(
  league: GmLeagueState,
  playerId: string
): GmCountingLine | null {
  const player = league.players.find((entry) => entry.id === playerId);
  const seasonKey = String(league.season);
  if (player?.seasonLine?.season === seasonKey && player.seasonLine.gp > 0) {
    return player.seasonLine;
  }
  const rows = league.boxScores.filter((box) => box.season === league.season);
  const lines = rows.flatMap((box: GmBoxScore) =>
    box.players.filter((line) => line.playerId === playerId)
  );
  if (lines.length === 0) return null;
  const sum = (pick: (line: (typeof lines)[number]) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);
  const teamId = lines[lines.length - 1]?.teamId ?? "";
  return {
    season: `${league.season - 1}-${String(league.season).slice(-2)}`,
    team: teamId.toUpperCase(),
    gp: lines.length,
    min: sum((line) => line.minutes),
    pts: sum((line) => line.points),
    reb: sum((line) => line.rebounds),
    ast: sum((line) => line.assists),
    stl: sum((line) => line.steals),
    blk: sum((line) => line.blocks),
    tov: sum((line) => line.turnovers),
    fgm: sum((line) => line.fgm),
    fga: sum((line) => line.fga),
    tpm: sum((line) => line.tpm),
    tpa: sum((line) => line.tpa),
    ftm: sum((line) => line.ftm),
    fta: sum((line) => line.fta),
  };
}

export function leagueHasRealPlayers(league: GmLeagueState): boolean {
  return league.players.some((player) => Boolean(player.nbaPlayerId));
}

/** Skill bars already live on a 0–100 scale. */
export function skillBar(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function attributeBars(ratings: GmRatings): Array<{ label: string; value: number }> {
  return [
    { label: "Shooting", value: skillBar(ratings.shooting) },
    { label: "Finishing", value: skillBar(ratings.finishing) },
    { label: "Playmaking", value: skillBar(ratings.playmaking) },
    { label: "Rebounding", value: skillBar(ratings.rebounding) },
    { label: "Defense", value: skillBar(50 + ratings.defense * 6) },
    { label: "Durability", value: skillBar(ratings.durability) },
  ];
}
