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

export function bundledFuturePicks(teamId: string): {
  abbr: string;
  picks: FuturePick[];
  retrievedAt: string | null;
  sourceUrl: string | null;
} | null {
  const team = data.teams?.[teamId];
  if (!team) return null;
  return { ...team, retrievedAt: data.retrievedAt ?? null, sourceUrl: data.sourceUrl ?? null };
}
