"use client";

import { TeamLogo } from "@/components/brand/team-logo";
import { GmPlayoffBracket } from "@/gm/ui/gm-playoff-bracket";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { standingsTable, teamById } from "@/gm/lib/selectors";
import { resolveTeamBrand } from "@/lib/nba-brand";

export default function GmStandingsPage() {
  return (
    <GmShell>
      <StandingsBody />
    </GmShell>
  );
}

function StandingsBody() {
  const league = useGmStore((s) => s.league);
  if (!league) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ConfTable
        title="Eastern Conference"
        rows={standingsTable(league, "East")}
        league={league}
      />
      <ConfTable
        title="Western Conference"
        rows={standingsTable(league, "West")}
        league={league}
      />
      {league.playoffBracket?.length ? (
        <div className="lg:col-span-2">
          <GmPlayoffBracket league={league} />
        </div>
      ) : null}
    </div>
  );
}

function ConfTable({
  title,
  rows,
  league,
}: {
  title: string;
  rows: ReturnType<typeof standingsTable>;
  league: NonNullable<ReturnType<typeof useGmStore.getState>["league"]>;
}) {
  return (
    <section>
      <h2 className="mb-2 font-bold tracking-tight text-xl tracking-wide">{title}</h2>
      <div className="arena-panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">W</th>
              <th className="px-3 py-2">L</th>
              <th className="px-3 py-2">PCT</th>
              <th className="px-3 py-2">Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const t = teamById(league, r.teamId);
              const brand = resolveTeamBrand(r.teamId);
              const gp = r.wins + r.losses;
              const pct = gp ? r.wins / gp : 0;
              const highlight = r.teamId === league.userTeamId;
              return (
                <tr
                  key={r.teamId}
                  className={highlight ? "bg-primary/10" : undefined}
                  style={
                    brand
                      ? { boxShadow: `inset 3px 0 0 ${brand.primary}` }
                      : undefined
                  }
                >
                  <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <TeamLogo teamKey={r.teamId} size="xs" />
                      {t?.abbr} {t?.name}
                    </span>
                    <span className="gm-winbar" aria-hidden>
                      <span
                        data-motion-bar="x"
                        style={{ width: `${Math.min(100, (r.wins / 82) * 100)}%` }}
                      />
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.wins}</td>
                  <td className="px-3 py-2 tabular-nums">{r.losses}</td>
                  <td className="px-3 py-2 tabular-nums">{pct.toFixed(3)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.pointsFor - r.pointsAgainst > 0 ? "+" : ""}
                    {r.pointsFor - r.pointsAgainst}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
