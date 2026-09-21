import type { AwardHistoryRow } from "@/content/awards/history";

export type AwardDynastyLeader = {
  name: string;
  count: number;
  href?: string;
};

/** Aggregate award history into dynasty leaders (server-safe). */
export function buildAwardDynastyBars(
  rows: AwardHistoryRow[]
): AwardDynastyLeader[] {
  const byName = new Map<string, { count: number; href?: string }>();
  for (const row of rows) {
    const timesMatch = /^(\d+)×$/.exec(row.season.trim());
    const add = timesMatch ? Number(timesMatch[1]) : 1;
    if (!Number.isFinite(add) || add <= 0) continue;
    const key = row.winner.trim();
    if (!key) continue;
    const prev = byName.get(key);
    if (prev) {
      prev.count += add;
      if (!prev.href && row.href) prev.href = row.href;
    } else {
      byName.set(key, { count: add, href: row.href });
    }
  }
  return [...byName.entries()]
    .map(([name, v]) => ({ name, count: v.count, href: v.href }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function awardDynastyUnitLabel(slug: string): string {
  switch (slug) {
    case "championships":
      return "titles";
    case "all-star":
      return "selections";
    case "all-nba":
    case "all-defense":
      return "selections";
    case "mvp":
      return "MVPs";
    case "finals-mvp":
      return "Finals MVPs";
    case "dpoy":
      return "DPOYs";
    case "roy":
      return "ROYs";
    case "hall-of-fame":
      return "inductees";
    default:
      return "wins";
  }
}
