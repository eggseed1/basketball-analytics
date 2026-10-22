"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { findEspnCdnSummary } from "@/data/providers/nba/espn-cdn-summary";
import type { EspnSummaryResponse } from "@/data/transformers/espn";

type Competitor = {
  homeAway?: string;
  score?: string | number;
  team?: { displayName?: string; abbreviation?: string };
};

type BoxAthlete = {
  didNotPlay?: boolean;
  athlete?: { displayName?: string };
  stats?: Array<string | number | null | undefined>;
};

type BoxBlock = {
  team?: { abbreviation?: string };
  statistics?: Array<{
    labels?: string[];
    names?: string[];
    athletes?: BoxAthlete[];
  }>;
};

type BoxRow = {
  team?: string;
  name?: string;
  stats: Record<string, string | number>;
};

async function fetchBrowserGameSummary(
  gameId: string,
  signal: AbortSignal
): Promise<EspnSummaryResponse> {
  const cdn = await fetch(
    `https://cdn.espn.com/core/nba/game?xhr=1&gameId=${encodeURIComponent(gameId)}`,
    { signal }
  );
  if (cdn.ok) {
    const wrapped: unknown = await cdn.json();
    const summary = findEspnCdnSummary(wrapped);
    if (summary) return summary;
  }
  const site = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(gameId)}`,
    { signal }
  );
  if (!site.ok) throw new Error(String(site.status));
  const siteJson: unknown = await site.json();
  const fromSite = findEspnCdnSummary(siteJson);
  if (fromSite) return fromSite;
  return siteJson as EspnSummaryResponse;
}

export function RuntimeGameFallback({ gameId }: { gameId: string }) {
  const [data, setData] = useState<EspnSummaryResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchBrowserGameSummary(gameId, controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        const name =
          e && typeof e === "object" && "name" in e
            ? String((e as { name?: unknown }).name)
            : "";
        if (name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [gameId]);
  if (failed)
    return (
      <div className="sports-card flex flex-col gap-3 p-6">
        <h1 className="text-[20px] font-semibold">Game unavailable</h1>
        <p className="text-[14px] text-muted-foreground">
          The server and browser game feeds are both unavailable right now.
        </p>
        <Link
          href="/scores"
          className="font-semibold underline-offset-4 hover:underline"
        >
          Back to scores
        </Link>
      </div>
    );
  if (!data)
    return (
      <div className="sports-card p-6 text-[14px] text-muted-foreground">
        Loading game…
      </div>
    );
  const header = data.header as
    | {
        competitions?: Array<{
          competitors?: Competitor[];
          status?: { type?: { shortDetail?: string; detail?: string } };
        }>;
      }
    | undefined;
  const comp = header?.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === "home");
  const away = comp?.competitors?.find((c) => c.homeAway === "away");
  if (!home || !away)
    return (
      <div className="sports-card p-6 text-[14px] text-muted-foreground">
        Game data returned without a matchup.
      </div>
    );
  const boxPlayers = (data as { boxscore?: { players?: BoxBlock[] } }).boxscore
    ?.players;
  const rows: BoxRow[] = (boxPlayers ?? []).flatMap((block) => {
    const labels =
      block?.statistics?.[0]?.labels ?? block?.statistics?.[0]?.names ?? [];
    return (block?.statistics?.[0]?.athletes ?? [])
      .filter((r) => !r.didNotPlay)
      .map((r) => ({
        team: block?.team?.abbreviation,
        name: r?.athlete?.displayName,
        stats: Object.fromEntries(
          labels.map((l, i) => [l, r?.stats?.[i] ?? "-"])
        ),
      }));
  });
  return (
    <div className="flex flex-col gap-5">
      <section className="sports-card p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Basic game view
        </p>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div>
            <p className="text-[20px] font-bold">{away.team?.displayName}</p>
            <p className="text-[32px] font-bold tabular-nums">
              {away.score ?? "-"}
            </p>
          </div>
          <div className="text-muted-foreground">@</div>
          <div className="text-right">
            <p className="text-[20px] font-bold">{home.team?.displayName}</p>
            <p className="text-[32px] font-bold tabular-nums">
              {home.score ?? "-"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {comp?.status?.type?.shortDetail ?? comp?.status?.type?.detail ?? ""}
        </p>
      </section>
      {rows.length ? (
        <section className="sports-card overflow-x-auto p-4">
          <h2 className="mb-3 text-[18px] font-bold">Box score</h2>
          <table className="w-full min-w-[620px] text-[12px]">
            <thead>
              <tr>
                <th className="p-2 text-left">Player</th>
                <th>MIN</th>
                <th>PTS</th>
                <th>REB</th>
                <th>AST</th>
                <th>STL</th>
                <th>BLK</th>
                <th>TO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-t border-border">
                  <td className="p-2 font-semibold">
                    {r.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      {r.team}
                    </span>
                  </td>
                  {["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO"].map((k) => (
                    <td key={k} className="p-2 text-center tabular-nums">
                      {r.stats[k] ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Detailed box score is not available for this game.
        </p>
      )}
    </div>
  );
}
