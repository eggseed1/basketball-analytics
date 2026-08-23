import type { TeamDraftAssetsPresentation } from "@/data/types/front-office";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const YEARS = [2027, 2028, 2029, 2030];

function cellLabel(
  assets: TeamDraftAssetsPresentation["assetsByYear"][string] | undefined,
  round: 1 | 2
) {
  const hit = assets?.find((a) => a.round === round);
  if (!hit) return "—";
  if (hit.ownershipStatus === "OWED_OUT") return "Out";
  if (hit.assetType === "ACQUIRED_PICK") return "In";
  if (hit.swap) return "Swap";
  if (hit.protection !== "UNPROTECTED" && hit.protection !== "UNKNOWN") {
    return "Prot";
  }
  return "Own";
}

export function TeamDraftAssetsTable({
  data,
  compact = false,
  className,
}: {
  data: TeamDraftAssetsPresentation;
  compact?: boolean;
  className?: string;
}) {
  if (data.summary.unavailableReason && !Object.keys(data.assetsByYear).length) {
    return (
      <p className={cn(type.caption, "text-muted-foreground", className)}>
        {data.summary.unavailableReason}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Draft assets
        </p>
        {data.summary.futureFirstsControlled != null ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            {data.summary.futureFirstsControlled} firsts ·{" "}
            {data.summary.futureSecondsControlled ?? 0} seconds (own picks)
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-md border border-border/80">
        <table
          className={cn(
            "w-full min-w-[280px] border-collapse",
            compact ? type.caption : "text-sm"
          )}
        >
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-2 py-1.5 font-semibold">Round</th>
              {YEARS.map((year) => (
                <th
                  key={year}
                  className="px-2 py-1.5 text-center font-semibold tabular-nums"
                >
                  {String(year).slice(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([1, 2] as const).map((round) => (
              <tr key={round} className="border-b border-border/50">
                <td className="px-2 py-1.5 font-semibold">
                  {round === 1 ? "1st" : "2nd"}
                </td>
                {YEARS.map((year) => {
                  const label = cellLabel(data.assetsByYear[String(year)], round);
                  return (
                    <td
                      key={year}
                      className={cn(
                        "px-2 py-1.5 text-center font-medium tabular-nums",
                        label === "Own"
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {label}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.disclosures[0] ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          {data.disclosures[0]}
        </p>
      ) : null}
    </div>
  );
}
