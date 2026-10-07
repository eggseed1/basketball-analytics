import Link from "next/link";
import type { CSSProperties } from "react";

import { surplusTone } from "@/components/players/player-contract-transactions";
import type { TeamContractsView } from "@/data/queries/team-contracts";
import type { ContractValueGap, TeamContractValue, TeamContractValuePlayer } from "@/data/runtime/contract-value";
import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

/** "8th of 30 · 12 of 16 contracts valued" */
export function teamSurplusHint(value: TeamContractValue): string {
  const all = value.players.length + value.missing.length;
  return `${formatOrdinal(value.rank)} of ${value.teams} · ${value.players.length} of ${all} contracts valued`;
}

const ROW =
  "grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_4.5rem] items-center gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_4.5rem_4.5rem_5rem]";

const GAP_LABEL: Record<ContractValueGap, string> = {
  waived: "waived",
  thin: "too few recent possessions",
  "no-drbl": "no recent DRBL seasons",
};

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Why surplus isn't simply worth minus salary for this contract: a team option
 * or non-guaranteed year counts only its upside, a player option only its downside.
 */
function optionNote(p: TeamContractValuePlayer, contracts: TeamContractsView): string | null {
  if (Math.abs(p.surplus - (p.totalWorth - p.totalSalary)) < 50_000) return null;
  const cells = contracts.rows.find((r) => r.brefId === p.brefId)?.years ?? [];
  const parts = [
    cells.some((c) => c?.option === "team") ? "Team option: upside only" : null,
    cells.some((c) => c?.notGuaranteed && c.option !== "team") ? "Unguaranteed year: upside only" : null,
    cells.some((c) => c?.option === "player") ? "Player option: downside only" : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}

function Money({ dollars }: { dollars: number }) {
  return (
    <span className={cn(type.caption, "hidden text-right tabular-nums text-muted-foreground sm:block")}>
      {formatUsdCompact(dollars)}
    </span>
  );
}

/** One diverging bar per contract: projected surplus over the rest of the deal, with worth and salary beside it. */
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
      <div
        aria-hidden
        className={cn(ROW, type.micro, "hidden font-semibold uppercase tracking-wide text-muted-foreground sm:grid")}
      >
        <span>Player</span>
        <span />
        <span className="text-right">Worth</span>
        <span className="text-right">Salary</span>
        <span className="text-right">Surplus</span>
      </div>
      <ul data-hover-group className="flex flex-col gap-1.5" aria-label="Projected surplus by contract">
        {value.players.map((p, i) => {
          const name = nameOf.get(p.brefId) ?? p.brefId;
          const href = contracts.hrefs[p.brefId];
          const positive = p.surplus > 0;
          const note = optionNote(p, contracts);
          return (
            <li key={p.brefId} data-hover-item className={ROW}>
              <div className="min-w-0">
                {href ? (
                  <Link
                    href={href}
                    className={cn(type.bodySm, "block truncate font-semibold text-foreground underline-offset-2 hover:underline")}
                  >
                    {name}
                  </Link>
                ) : (
                  <span className={cn(type.bodySm, "block truncate font-semibold text-foreground")}>{name}</span>
                )}
                <p className={cn(type.micro, "tabular-nums text-muted-foreground sm:hidden")}>
                  {formatUsdCompact(p.totalWorth)} worth · {formatUsdCompact(p.totalSalary)} salary
                </p>
                {note ? <p className={cn(type.micro, "text-muted-foreground")}>{note}</p> : null}
              </div>
              <div
                className="relative h-4"
                data-tip={`${name}: ${formatUsdSignedCompact(p.surplus)}`}
                data-tip-sub={`80% range ${formatUsdSignedCompact(p.surplusLow)} to ${formatUsdSignedCompact(p.surplusHigh)}`}
              >
                <div aria-hidden className="absolute inset-y-[-2px] left-1/2 w-px bg-foreground/30" />
                <div
                  aria-hidden
                  data-motion-bar="x"
                  className="absolute inset-y-0 rounded-sm"
                  style={{
                    ...({ "--i": Math.min(i, 16) } as CSSProperties),
                    transformOrigin: positive ? "left" : "right",
                    width: width(p.surplus),
                    ...(positive ? { left: "50%" } : { right: "50%" }),
                    background: positive ? "var(--chart-3)" : "var(--destructive)",
                    opacity: 0.8,
                  }}
                />
              </div>
              <Money dollars={p.totalWorth} />
              <Money dollars={p.totalSalary} />
              <span className={cn(type.bodySm, "text-right font-semibold tabular-nums", surplusTone(p.surplus))}>
                {formatUsdSignedCompact(p.surplus)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={cn(ROW, "border-t border-border/70 pt-2")}>
        <div className="min-w-0">
          <span className={cn(type.bodySm, "font-bold text-foreground")}>Total, {value.players.length} contracts</span>
          <p className={cn(type.micro, "tabular-nums text-muted-foreground sm:hidden")}>
            {formatUsdCompact(value.totalWorth)} worth · {formatUsdCompact(value.totalSalary)} salary
          </p>
        </div>
        <span />
        <Money dollars={value.totalWorth} />
        <Money dollars={value.totalSalary} />
        <span className={cn(type.bodySm, "text-right font-bold tabular-nums", surplusTone(value.surplus))}>
          {formatUsdSignedCompact(value.surplus)}
        </span>
      </div>
      <div className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        <p>
          Worth is what each player&apos;s projected DRBL wins would cost on the open market over the
          rest of his contract, and salary is what he is owed. Surplus is worth minus salary, except
          that a team can decline a team option or cut a non-guaranteed year, and a player can turn
          down his option. These are the same estimates shown on player pages.
        </p>
        <p>
          The team total of {formatUsdSignedCompact(value.surplus)} adds up each player&apos;s middle
          estimate and ranks {formatOrdinal(value.rank)} of {value.teams} teams. Every player&apos;s
          own range is wide, so read the total as a rough guide.
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
