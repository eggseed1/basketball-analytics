import { TeamDraftAssetsTable } from "@/components/teams/team-draft-assets-table";
import type { TeamDraftAssetsPresentation } from "@/data/types/front-office";

/**
 * Draft Assets surface — shows own-pick baseline when available; never false zeros.
 */
export function TeamDraftAssetsView({
  data,
}: {
  data: TeamDraftAssetsPresentation;
}) {
  const hasAssets = Object.keys(data.assetsByYear).length > 0;

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

      {hasAssets ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Future picks</h2>
          <TeamDraftAssetsTable data={data} />
        </section>
      ) : (
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
      )}

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
