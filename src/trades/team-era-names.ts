/** Team nickname as of a date, for franchises the log covers under older names. */

const ERA_NAMES: Record<string, Array<{ before: string; name: string }>> = {
  "3": [{ before: "2013-04-19", name: "Hornets" }],
  "25": [{ before: "2008-07-03", name: "SuperSonics" }],
  "30": [{ before: "2014-05-20", name: "Bobcats" }],
};

export function teamNameAt(teamId: string, date: string | undefined, names: Record<string, string>): string {
  const era = date ? ERA_NAMES[teamId]?.find((e) => date < e.before) : undefined;
  if (teamId === "30" && date && date < "2004-07-01") return "Hornets";
  return era?.name ?? names[teamId] ?? "team";
}
