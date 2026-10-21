import { TextLink } from "@/components/ui/text-link";
import type { StyleDirectoryGroup } from "@/lib/player-styles-board";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function shellMix(group: StyleDirectoryGroup): Array<{
  key: string;
  label: string;
  share: number;
}> {
  const counts = { guard: 0, wing: 0, big: 0 };
  for (const p of group.players) {
    counts[p.role.shell] += 1;
  }
  const total = Math.max(1, group.players.length);
  return (
    [
      { key: "guard", label: "G", share: counts.guard / total },
      { key: "wing", label: "W", share: counts.wing / total },
      { key: "big", label: "B", share: counts.big / total },
    ] as const
  ).filter((row) => row.share > 0);
}

/**
 * Explore directory tile: phrase, count, shell composition, sample names.
 */
export function StyleGroupCard({
  group,
  href,
}: {
  group: StyleDirectoryGroup;
  href: string;
}) {
  const shells = shellMix(group);
  const samples = group.players.slice(0, 3).map((p) => p.playerName);
  const medianFit = (() => {
    if (!group.players.length) return null;
    const fits = group.players
      .map((p) => p.role.confidence)
      .sort((a, b) => a - b);
    return fits[Math.floor(fits.length / 2)] ?? null;
  })();

  return (
    <TextLink
      href={href}
      className="flex min-h-[9.5rem] flex-col gap-2.5 rounded-md border border-border/50 px-3.5 py-3 no-underline transition-colors hover:border-border hover:bg-foreground/[0.03]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn(type.bodySm, "font-semibold text-foreground")}>
          {group.phrase}
        </span>
        <span
          className={cn(
            type.caption,
            "shrink-0 tabular-nums text-muted-foreground"
          )}
        >
          {group.players.length}
        </span>
      </div>
      <p className={cn(type.caption, "line-clamp-2 text-muted-foreground")}>
        {group.blurb}
      </p>

      {shells.length ? (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]"
          aria-hidden
        >
          {shells.map((row) => (
            <div
              key={row.key}
              className={cn(
                "h-full",
                row.key === "guard" && "bg-foreground/55",
                row.key === "wing" && "bg-foreground/35",
                row.key === "big" && "bg-foreground/20"
              )}
              style={{ width: `${row.share * 100}%` }}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-0.5">
        {samples.length ? (
          <p className={cn(type.caption, "truncate text-muted-foreground")}>
            {samples.join(" · ")}
          </p>
        ) : null}
        {medianFit != null ? (
          <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
            Median fit {Math.round(medianFit * 100)}%
            {shells.length
              ? ` · ${shells.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(" ")}`
              : ""}
          </p>
        ) : null}
      </div>
    </TextLink>
  );
}
