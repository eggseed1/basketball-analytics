/**
 * Future first- and second-round picks per team, with Spotrac's terms.
 * Written by scripts/import-spotrac-future-picks.mjs from a saved page read.
 */
import snapshot from "./future-picks-snapshot.json";

export type FuturePick = {
  year: number;
  round: 1 | 2;
  /** Team whose pick it originally is. */
  origin: string;
  /** Team holding it now (abbreviation). */
  holder: string;
  /** The other team in a swap. */
  swapWith?: string;
  /** Changed hands at least once. */
  moved?: true;
  /** Can't be traded while the team is over the second apron. */
  frozen?: true;
  terms?: string;
};

type SnapshotFile = {
  sourceUrl?: string;
  retrievedAt?: string;
  teams?: Record<string, { abbr: string; picks: FuturePick[] }>;
};

const data = snapshot as unknown as SnapshotFile;

/** The draft runs in late June, so from July on that year's picks are used. */
function nextDraftYear(now: Date): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export function bundledFuturePicks(teamId: string, now = new Date()): {
  abbr: string;
  picks: FuturePick[];
  retrievedAt: string | null;
  sourceUrl: string | null;
} | null {
  const team = data.teams?.[teamId];
  if (!team) return null;
  const firstYear = nextDraftYear(now);
  return {
    ...team,
    picks: team.picks.filter((pick) => pick.year >= firstYear),
    retrievedAt: data.retrievedAt ?? null,
    sourceUrl: data.sourceUrl ?? null,
  };
}
