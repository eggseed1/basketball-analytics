import { readFileSync } from "node:fs";
import path from "node:path";

import type { HeadlineRosterPlayer } from "@/sentiment/headline-entities";

type SearchSnapshot = { players: [string, string, string, string, number][] };
type CurrentRosterSnapshot = { players: Record<string, { teamId: string }> };

/** Current ESPN rosters joined to display names from the search snapshot. */
export function loadIngestRoster(): HeadlineRosterPlayer[] {
  const runtime = path.join(process.cwd(), "src", "data", "runtime");
  const search = JSON.parse(
    readFileSync(path.join(runtime, "player-search-snapshot.json"), "utf8")
  ) as SearchSnapshot;
  const current = JSON.parse(
    readFileSync(path.join(runtime, "current-roster-snapshot.json"), "utf8")
  ) as CurrentRosterSnapshot;
  const names = new Map<string, string>();
  for (const [id, name] of search.players) {
    if (!names.has(id)) names.set(id, name);
  }
  const roster: HeadlineRosterPlayer[] = [];
  for (const [playerId, row] of Object.entries(current.players)) {
    const name = names.get(playerId);
    if (name) roster.push({ playerId, name, teamId: row.teamId });
  }
  return roster;
}
