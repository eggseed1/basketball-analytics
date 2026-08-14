import type { GmPlayer, GmPosition, GmTeam } from "@/gm/types";

export function autoSetLineup(team: GmTeam, players: GmPlayer[]): GmTeam {
  const roster = players
    .filter((p) => p.teamId === team.id)
    .sort((a, b) => b.ratings.impact - a.ratings.impact);
  const starters: GmTeam["starters"] = {
    PG: null,
    SG: null,
    SF: null,
    PF: null,
    C: null,
  };
  const used = new Set<string>();
  const order: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];
  for (const pos of order) {
    const fit =
      roster.find((p) => p.position === pos && !used.has(p.id)) ??
      roster.find((p) => !used.has(p.id));
    if (fit) {
      starters[pos] = fit.id;
      used.add(fit.id);
    }
  }
  const benchOrder = roster.filter((p) => !used.has(p.id)).map((p) => p.id);
  return { ...team, starters, benchOrder };
}
