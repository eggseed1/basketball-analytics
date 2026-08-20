import type { TeamDraftAssetsPresentation } from "@/data/types/front-office";

/**
 * Draft Assets surface — timeline scaffold remains even when ledger is empty
 * so partner design has a stable contract; never shows false zero counts.
 */
export function TeamDraftAssetsView({
  data,
}: {
  data: TeamDraftAssetsPresentation;
}) {
  const years = [2026, 2027, 2028, 2029, 2030];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Draft Assets
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {data.franchise.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Snapshot {data.snapshotStatus.toLowerCase()} · Updated{" "}
          {new Date(data.updatedAt).toLocaleString("en-US")}
        </p>
      </header>

      <section
        aria-labelledby="draft-unavailable-heading"
        className="space-y-3 rounded-md border border-dashed border-border p-4"
      >
        <h2 id="draft-unavailable-heading" className="text-lg font-semibold">
          Draft asset data unavailable
        </h2>
        <p className="text-sm text-muted-foreground">
          {data.summary.unavailableReason ??
            "No product-approved structured draft-asset ledger."}
        </p>
        <p className="text-sm text-muted-foreground">
          Future firsts controlled: Unavailable · Future seconds controlled:
          Unavailable — not 0.
        </p>
      </section>

      <section aria-labelledby="draft-timeline-heading" className="space-y-3">
        <h2 id="draft-timeline-heading" className="text-lg font-semibold">
          Asset timeline (scaffold)
        </h2>
        <p className="text-sm text-muted-foreground">
          What future draft capital does this team control, and what strings are
          attached? Grid reserved for own / incoming / outgoing / protected /
          swap once a structured ledger exists.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Round</th>
                {years.map((y) => (
                  <th key={y} className="py-2 pr-3 font-semibold tabular-nums">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["First", "Second"] as const).map((round) => (
                <tr key={round} className="border-b border-border/60">
                  <td className="py-3 pr-3 font-medium">{round}</td>
                  {years.map((y) => (
                    <td
                      key={y}
                      className="py-3 pr-3 text-muted-foreground"
                      title="Unavailable — not an owned empty pick"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true">○</span>
                        <span className="text-[11px]">Unavailable</span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Legend: Own · Incoming · Outgoing · Protected · Swap — textual labels
          required; symbols alone are insufficient. Swaps are never counted as
          owned additional picks.
        </p>
      </section>

      <section className="space-y-2 text-xs text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">Capabilities</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>First-round assets: {data.capabilities.FIRST_ROUND_ASSETS}</li>
          <li>Second-round assets: {data.capabilities.SECOND_ROUND_ASSETS}</li>
          <li>Swaps: {data.capabilities.SWAPS}</li>
          <li>Protections: {data.capabilities.PROTECTIONS}</li>
          <li>
            Transaction provenance: {data.capabilities.TRANSACTION_PROVENANCE}
          </li>
        </ul>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {data.disclosures.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
