import Link from "next/link";

import { surplusTone } from "@/components/players/player-contract-transactions";
import type { TeamContractsView } from "@/data/queries/team-contracts";
import type { ContractValueGap, TeamContractValue } from "@/data/runtime/contract-value";
import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import { formatUsdSignedCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

/** "8th of 30 · 12 of 16 contracts valued" */
export function teamSurplusHint(value: TeamContractValue): string {
  const all = value.players.length + value.missing.length;
  return `${formatOrdinal(value.rank)} of ${value.teams} · ${value.players.length} of ${all} contracts valued`;
}

const GAP_LABEL: Record<ContractValueGap, string> = {
  waived: "waived",
  thin: "too few recent possessions",
  "no-drbl": "no recent DRBL seasons",
};

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** One diverging bar per contract: projected worth minus salary over the rest of the deal. */
export function TeamContractValueChart({
  value,
  contracts,
}: {
  value: TeamContractValue;
  contracts: TeamContractsView;
}) {
  const nameOf = new Map(contracts.rows.map((r) => [r.brefId, r.name]));
  const max = Math.max(...value.players.map((p) => Math.abs(p.surplus)), 1);
  const width = (dollars: number) => `${(Math.abs(dollars) / max) * 50}%`;
  const missingByReason = (Object.keys(GAP_LABEL) as ContractValueGap[])
    .map((reason) => ({
      reason,
      names: value.missing.filter((m) => m.reason === reason).map((m) => nameOf.get(m.brefId) ?? m.brefId),
    }))
    .filter((group) => group.names.length);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1" aria-label="Projected surplus by contract">
        {value.players.map((p) => {
          const name = nameOf.get(p.brefId) ?? p.brefId;
          const href = contracts.hrefs[p.brefId];
          const positive = p.surplus > 0;
          return (
            <li
              key={p.brefId}
              className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_4.5rem] items-center gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_5rem]"
            >
              {href ? (
                <Link href={href} className={cn(type.bodySm, "truncate font-semibold underline-offset-2 hover:underline")}>
                  {name}
                </Link>
              ) : (
                <span className={cn(type.bodySm, "truncate font-semibold")}>{name}</span>
              )}
              <div className="relative h-4" title={`${name}: ${formatUsdSignedCompact(p.surplus)} (80% range ${formatUsdSignedCompact(p.surplusLow)} to ${formatUsdSignedCompact(p.surplusHigh)})`}>
                <div aria-hidden className="absolute inset-y-[-2px] left-1/2 w-px bg-foreground/30" />
                <div
                  aria-hidden
                  className="absolute inset-y-0 rounded-sm"
                  style={{
                    width: width(p.surplus),
                    ...(positive ? { left: "50%" } : { right: "50%" }),
                    background: positive ? "var(--chart-3)" : "var(--destructive)",
                    opacity: 0.8,
                  }}
                />
              </div>
              <span className={cn(type.bodySm, "text-right font-semibold tabular-nums", surplusTone(p.surplus))}>
                {formatUsdSignedCompact(p.surplus)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        <p>
          Each bar is projected worth minus salary over the rest of the contract, the same estimate
          shown on player pages. The team total of {formatUsdSignedCompact(value.surplus)} adds up the
          middle estimate for each player. Every player&apos;s own range is wide, so read the total as
          a rough guide. It ranks {formatOrdinal(value.rank)} of {value.teams} teams.
        </p>
        {missingByReason.length ? (
          <p>
            Left out of the total, not counted as zero:{" "}
            {listJoin(missingByReason.map((g) => `${listJoin(g.names)} (${GAP_LABEL[g.reason]})`))}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
