import { Suspense } from "react";

import { buildPlayerComparison } from "@/analytics";
import { ComparePicker } from "@/components/compare/compare-picker";
import { PlayerCompareView } from "@/components/compare/player-compare-view";
import {
  getFilteredPlayerSeasons,
  getPlayerSeason,
} from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { PlayerSeason } from "@/data/types";

export const metadata = {
  title: "Compare",
  description: "Side-by-side NBA player comparison with percentile context.",
};

interface ComparePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

async function loadSeasonRow(
  playerId: string,
  season: string,
  peers: PlayerSeason[]
): Promise<PlayerSeason | null> {
  const fromPeers = peers.find((p) => p.playerId === playerId);
  const row = await getPlayerSeason(playerId, season).catch(() => null);
  if (!row && !fromPeers) return null;
  if (!row) return fromPeers ?? null;
  return {
    ...row,
    playerName: row.playerName || fromPeers?.playerName || playerId,
    usagePct:
      row.usagePct > 0 ? row.usagePct : fromPeers?.usagePct ?? row.usagePct,
    darkoDpm: row.darkoDpm ?? fromPeers?.darkoDpm,
    darkoOff: row.darkoOff ?? fromPeers?.darkoOff,
    darkoDef: row.darkoDef ?? fromPeers?.darkoDef,
    lebron: row.lebron ?? fromPeers?.lebron,
    trueShootingPct:
      row.trueShootingPct > 0
        ? row.trueShootingPct
        : fromPeers?.trueShootingPct ?? row.trueShootingPct,
  };
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const sp = await searchParams;
  const aId = one(sp, "a");
  const bId = one(sp, "b");
  const season =
    one(sp, "season") ??
    canonicalSeasonFromStartYear(currentNbaStartYear());

  const peers = await getFilteredPlayerSeasons({
    season,
    minimumGames: 15,
  }).catch(() => [] as PlayerSeason[]);

  const [aRow, bRow] = await Promise.all([
    aId ? loadSeasonRow(aId, season, peers) : Promise.resolve(null),
    bId ? loadSeasonRow(bId, season, peers) : Promise.resolve(null),
  ]);

  const result =
    aRow && bRow
      ? buildPlayerComparison({ a: aRow, b: bRow, peers })
      : null;

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Compare
        </h1>
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Pick two players. See the measurable edges first, then the dimensions
          that drive the difference.
        </p>
      </header>

      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-secondary" />}>
        <ComparePicker
          aId={aRow?.playerId ?? aId}
          bId={bRow?.playerId ?? bId}
          aName={aRow?.playerName}
          bName={bRow?.playerName}
          season={season}
        />
      </Suspense>

      {!aId || !bId ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
          Search for Player A and Player B to run a comparison.
        </p>
      ) : !result ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
          Could not load season rows for both players in {season}. Try another
          season or different players.
        </p>
      ) : (
        <PlayerCompareView result={result} />
      )}
    </main>
  );
}
