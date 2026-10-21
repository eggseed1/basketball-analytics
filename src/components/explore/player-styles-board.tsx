import { StyleGroupCard } from "@/components/explore/style-group-card";
import { TeamLogo } from "@/components/brand/team-logo";
import { TeamIdentity } from "@/components/teams/team-identity";
import { TextLink } from "@/components/ui/text-link";
import type { StyleDirectoryGroup } from "@/lib/player-styles-board";
import { playerRoleDietLabel, playerRoleShellLabel } from "@/lib/player-role";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function FitBar({ value }: { value: number }) {
  const pctFit = Math.round(value * 100);
  return (
    <div className="ml-auto flex w-[4.5rem] items-center gap-1.5">
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full bg-foreground/55"
          style={{ width: `${Math.max(4, pctFit)}%` }}
        />
      </div>
      <span className="w-7 shrink-0 text-right tabular-nums">{pctFit}%</span>
    </div>
  );
}

export function PlayerStylesBoard({
  groups,
  season,
  activeStyle,
  styleHref,
}: {
  groups: StyleDirectoryGroup[];
  season: string;
  activeStyle: string | null;
  styleHref: (id: string | null) => string;
}) {
  const visible = activeStyle
    ? groups.filter((g) => g.id === activeStyle)
    : groups;

  if (!visible.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No players matched this style filter for {season}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {!activeStyle ? (
        <section
          aria-label="Style groups"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {groups.map((group) => (
            <StyleGroupCard
              key={group.id}
              group={group}
              href={styleHref(group.id)}
            />
          ))}
        </section>
      ) : null}

      {visible.map((group) => (
        <section
          key={group.id}
          id={group.id}
          className="scroll-mt-20 flex flex-col gap-3"
          aria-labelledby={`style-${group.id}`}
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <h2 id={`style-${group.id}`} className={type.heading}>
                {group.phrase}
              </h2>
              <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
                {group.blurb}
              </p>
            </div>
            <p
              className={cn(
                type.caption,
                "shrink-0 font-semibold tabular-nums text-muted-foreground"
              )}
            >
              {group.players.length} player
              {group.players.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="board-scroll-host overflow-x-auto rounded-md">
            <table className="w-full min-w-[48rem] border-collapse text-left">
              <thead
                className={cn(
                  type.caption,
                  "uppercase tracking-wide text-muted-foreground"
                )}
              >
                <tr className="border-b border-border/60">
                  <th className="py-2 pr-3 font-semibold">Player</th>
                  <th className="px-2 py-2 font-semibold">Tm</th>
                  <th className="px-2 py-2 text-right font-semibold">Pos</th>
                  <th className="px-2 py-2 text-left font-semibold">Shell</th>
                  <th className="px-2 py-2 text-left font-semibold">Diet</th>
                  <th className="px-2 py-2 text-right font-semibold">G</th>
                  <th className="px-2 py-2 text-right font-semibold">USG</th>
                  <th className="px-2 py-2 text-right font-semibold">AST%</th>
                  <th className="px-2 py-2 text-right font-semibold">3PAr</th>
                  <th className="px-2 py-2 text-left font-semibold">Mix</th>
                  <th className="py-2 pl-2 text-right font-semibold">Fit</th>
                </tr>
              </thead>
              <tbody className={cn(type.caption, "tabular-nums")}>
                {group.players.map((p) => {
                  const second = p.role.roleMix[1];
                  return (
                    <tr
                      key={p.playerId}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="py-1.5 pr-3 font-semibold">
                        <TextLink
                          href={`/players/${encodeURIComponent(p.playerId)}?season=${encodeURIComponent(season)}`}
                        >
                          {p.playerName}
                        </TextLink>
                      </td>
                      <td className="px-2 py-1.5">
                        <TeamIdentity
                          teamKey={p.teamId}
                          label={p.teamAbbr}
                          className="inline-flex items-center gap-1.5"
                          nameClassName="font-semibold"
                        >
                          <TeamLogo teamKey={p.teamId} size="xs" />
                          <span>{p.teamAbbr}</span>
                        </TeamIdentity>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {p.position ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-left">
                        {playerRoleShellLabel(p.role.shell)}
                      </td>
                      <td className="px-2 py-1.5 text-left">
                        {playerRoleDietLabel(p.role.diet)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {formatNumber(p.gamesPlayed, 0)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {pct(p.usagePct)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {pct(p.assistPct)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {pct(p.threePointAttemptRate)}
                      </td>
                      <td className="max-w-[9rem] truncate px-2 py-1.5 text-left text-muted-foreground">
                        {second
                          ? `${Math.round((p.role.roleMix[0]?.weight ?? 0) * 100)}/${Math.round(second.weight * 100)} ${second.phrase}`
                          : "—"}
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <FitBar value={p.role.confidence} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
