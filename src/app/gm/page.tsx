"use client";

import Link from "next/link";
import { GmShell } from "@/gm/ui/gm-shell";
import { MyLeagueStatusCard } from "@/gm/ui/myleague-status-card";
import { GmGamePlan } from "@/gm/ui/gm-game-plan";
import { useGmStore } from "@/gm/state/gm-store";
import { userCap, userRecord } from "@/gm/lib/selectors";
import { formatNumber } from "@/lib/format";

export default function GmHomePage() {
  return (
    <GmShell>
      <CommandCenter />
    </GmShell>
  );
}

function CommandCenter() {
  const league = useGmStore((s) => s.league);

  if (!league) return null;
  const record = userRecord(league);
  const cap = userCap(league);
  const news = league.news.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="sports-card p-4">
          <p className="text-[14px] font-semibold text-muted-foreground">
            Record
          </p>
          <p className="score-num mt-1 text-[2.5rem]">
            {record?.wins ?? 0}-{record?.losses ?? 0}
          </p>
          <p className="text-[14px] text-muted-foreground">
            {league.season - 1}-{String(league.season).slice(-2)} · day{" "}
            {league.day}
          </p>
        </div>
        <div className="sports-card p-4">
          <p className="text-[14px] font-semibold text-muted-foreground">
            Payroll
          </p>
          <p className="score-num mt-1 text-[2.5rem]">
            ${formatNumber(cap.payrollM, 1)}M
          </p>
          <p className="text-[14px] text-muted-foreground">
            Cap ${formatNumber(league.settings.salaryCapM, 1)}M
            {cap.overTax ? " · tax" : ""}
          </p>
        </div>
      </section>

      <GmGamePlan league={league} />

      <MyLeagueStatusCard />

      <p className="text-[14px] text-muted-foreground">
        <Link
          className="font-semibold text-foreground underline-offset-4 hover:underline"
          href="/gm/offseason"
        >
          Offseason Hub
        </Link>
        {" · "}
        <Link
          className="underline-offset-4 hover:underline"
          href="/gm/trade"
        >
          Trade
        </Link>
        {" · "}
        <Link className="underline-offset-4 hover:underline" href="/gm/cap">
          Cap
        </Link>
        {" · "}
        <Link
          className="underline-offset-4 hover:underline"
          href="/gm/standings"
        >
          Standings
        </Link>
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-[16px] font-bold">FO briefings</h2>
        <ul className="sports-card divide-y divide-black/5">
          {news.length === 0 ? (
            <li className="px-4 py-3 text-[14px] text-muted-foreground">
              Play your first game to fill the wire.
            </li>
          ) : (
            news.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="font-semibold">{n.headline}</p>
                <p className="text-[14px] text-muted-foreground">{n.body}</p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
