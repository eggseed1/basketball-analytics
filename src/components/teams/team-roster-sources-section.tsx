import type { CSSProperties } from "react";
import Link from "next/link";

import { vizAccentStyle } from "@/components/teams/viz/viz-kit";
import { getTeamRosterArrivals } from "@/data/queries/acquisition-paths";
import type { TeamAcquisitionEntry } from "@/trades/acquisition-types";
import { sectionLinkClassName, type } from "@/lib/design-system";
import { playerPageHref } from "@/lib/player-season-resolve";
import { cn } from "@/lib/utils";

type Bucket = { id: string; label: string; share: number; players: Array<{ label: string; playerId?: string }> };

const KINDS: Array<{ how: TeamAcquisitionEntry["how"]; label: string; share: number }> = [
  { how: "draft", label: "Drafted", share: 100 },
  { how: "trade", label: "Traded for", share: 72 },
  { how: "signing", label: "Signed", share: 48 },
  { how: "claim", label: "Claimed off waivers", share: 32 },
  { how: "first-seen", label: "Re-signed, first move not logged", share: 20 },
];

function formatMonth(date: string): string {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** How the current roster arrived: one segment per acquisition type. */
export async function TeamRosterSourcesSection({ teamId, teamKey }: { teamId: string; teamKey: string }) {
  const roster = await getTeamRosterArrivals(teamId).catch(() => null);
  if (!roster || (!roster.onRoster.length && !roster.notLogged.length)) return null;

  const buckets: Bucket[] = KINDS.map((k) => ({
    id: k.how,
    label: k.label,
    share: k.share,
    players: roster.onRoster.filter((e) => e.how === k.how).map((e) => ({ label: e.label, playerId: e.playerId })),
  }));
  if (roster.notLogged.length) {
    buckets.push({
      id: "not-logged",
      label: "No logged move",
      share: 0,
      players: roster.notLogged.map((p) => ({ label: p.name, playerId: p.playerId })),
    });
  }
  const shown = buckets.filter((b) => b.players.length);
  const total = shown.reduce((n, b) => n + b.players.length, 0);
  const longest = [...roster.onRoster].sort((a, b) => a.date.localeCompare(b.date))[0];
  const longestNote = !longest
    ? null
    : longest.how === "first-seen"
      ? ` ${longest.label} has been here longest, since at least ${formatMonth(longest.date)}.`
      : ` ${longest.label} has been here longest, ${KINDS.find((k) => k.how === longest.how)?.label.toLowerCase()} in ${formatMonth(longest.date)}.`;
  const color = (b: Bucket) =>
    b.share ? `color-mix(in srgb, var(--viz-accent) ${b.share}%, transparent)` : "color-mix(in srgb, var(--foreground) 12%, transparent)";

  return (
    <section id="roster-building" className="scroll-mt-16 flex flex-col gap-3" aria-label="How this roster was built">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">How the roster was built</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            The move that brought each current player here.
            {longestNote}
          </p>
        </div>
        <Link
          href={`/acquisitions?team=${encodeURIComponent(teamId)}`}
          className={cn(type.caption, sectionLinkClassName)}
        >
          Every arrival since 2000 <span data-motion-arrow aria-hidden>→</span>
        </Link>
      </div>
      <div data-viz style={vizAccentStyle(teamKey)} className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        <div aria-hidden className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
          {shown.map((b, i) => (
            <span
              key={b.id}
              data-motion-bar="x"
              data-hover-item
              data-tip={`${b.label}: ${b.players.length}`}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={
                {
                  width: `${(b.players.length / total) * 100}%`,
                  backgroundColor: color(b),
                  "--i": i,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <dl data-motion-stack className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((b) => (
            <div key={b.id} data-motion-item className="flex flex-col gap-1">
              <dt className={cn(type.caption, "flex items-center gap-1.5 text-muted-foreground")}>
                <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color(b) }} />
                {b.label}
                <span className="font-semibold tabular-nums text-foreground">{b.players.length}</span>
              </dt>
              <dd className={type.bodySm}>
                {b.players.map((p, i) => (
                  <span key={`${p.label}-${i}`}>
                    {i ? ", " : null}
                    {p.playerId ? (
                      <Link href={playerPageHref(p.playerId)} className="font-semibold underline-offset-2 hover:underline">
                        {p.label}
                      </Link>
                    ) : (
                      <span className="font-semibold">{p.label}</span>
                    )}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className={cn(type.caption, "text-muted-foreground")}>
          From ESPN&apos;s transaction log, which starts in 2000. Players with no logged move are on the
          roster, but the log doesn&apos;t say how they got there.
        </p>
      </div>
    </section>
  );
}
