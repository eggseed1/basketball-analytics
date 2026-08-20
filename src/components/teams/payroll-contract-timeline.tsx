import type { TeamContractRow } from "@/data/types/front-office";
import { formatUsdCompact } from "@/lib/format-money";

/** Accessible contract-horizon grid (players × seasons). */
export function PayrollContractTimeline({
  rows,
  seasons,
}: {
  rows: TeamContractRow[];
  seasons: string[];
}) {
  if (!rows.length || !seasons.length) return null;

  return (
    <section aria-labelledby="contract-timeline-heading" className="space-y-3">
      <h2 id="contract-timeline-heading" className="text-lg font-semibold">
        Contract timeline
      </h2>
      <p className="text-sm text-muted-foreground">
        Players × future seasons with known salary. Equivalent table data lives
        in the contract table below.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-2 font-semibold">Player</th>
              {seasons.map((s) => (
                <th key={s} className="py-2 pr-2 font-semibold tabular-nums">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.years.some((y) => y.salary != null))
              .slice(0, 40)
              .map((row) => (
                <tr key={row.contractId} className="border-b border-border/50">
                  <td className="py-1.5 pr-2 font-medium">{row.playerName}</td>
                  {seasons.map((s) => {
                    const y = row.years.find((yy) => yy.season === s);
                    const has = y?.salary != null;
                    return (
                      <td key={s} className="py-1.5 pr-2">
                        {has ? (
                          <span
                            className="inline-block min-w-[4.5rem] rounded-sm bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold text-background tabular-nums"
                            title={formatUsdCompact(y!.salary)}
                          >
                            {formatUsdCompact(y!.salary)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
