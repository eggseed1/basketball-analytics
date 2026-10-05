import { MoreInfo } from "@/components/ui/more-info";
import { TextLink } from "@/components/ui/text-link";
import type {
  ContractValueGap,
  ContractValueModel,
  ContractValueView,
} from "@/data/runtime/contract-value";
import type {
  PlayerContractSnapshot,
  PlayerContractYearView,
} from "@/data/queries/player-front-office";
import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import { formatUsdCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function yearNote(year: PlayerContractYearView, aboveMax: boolean): string | null {
  const parts = [
    year.option === "player" ? "Player option" : year.option === "team" ? "Team option" : null,
    year.notGuaranteed ? "Not guaranteed" : null,
    aboveMax ? "Worth more than the max" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function signedUsd(dollars: number): string {
  const text = formatUsdCompact(Math.abs(dollars));
  if (Math.abs(dollars) < 50_000) return "$0.0M";
  return dollars > 0 ? `+${text}` : `-${text}`;
}

function surplusTone(dollars: number): string {
  if (Math.abs(dollars) < 50_000) return "text-muted-foreground";
  return dollars > 0 ? "text-[var(--chart-3)]" : "text-destructive";
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {label}
      </p>
      <p className={cn("text-[22px] font-bold tabular-nums tracking-tight", tone)}>{value}</p>
      <p className={cn(type.caption, "text-muted-foreground")}>{detail}</p>
    </div>
  );
}

function windowLabel(model: ContractValueModel): string {
  const end = Number(model.lastSeason.slice(0, 4));
  const start = end - 2;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")} to ${model.lastSeason}`;
}

const GAP_TEXT: Record<ContractValueGap, (model: ContractValueModel) => string> = {
  "no-drbl": (model) =>
    `No value estimate. He has no DRBL seasons from ${windowLabel(model)}, so there is nothing to project from.`,
  thin: (model) =>
    `No value estimate. He played fewer than 500 DRBL possessions from ${windowLabel(model)}.`,
  waived: () =>
    "No value estimate. He was waived, so this team pays the salary without getting him on the floor.",
};

function MissingNote({ reason, model }: { reason: ContractValueGap; model: ContractValueModel }) {
  return <p className={cn(type.bodySm, "text-muted-foreground")}>{GAP_TEXT[reason](model)}</p>;
}

function MethodNotes({ model }: { model: ContractValueModel }) {
  const first = model.backtest[0];
  const capSeasonPrice = formatUsdCompact(model.pricePerWinShare * model.capSeasonCap);
  const priceFrom = model.priceSeasons[0];
  const priceTo = model.priceSeasons[model.priceSeasons.length - 1];
  return (
    <MoreInfo>
      <p>
        Worth is what his projected DRBL wins would cost on the open market. We count wins above
        a minimum-salary player in the same minutes and price them at what teams paid per win from{" "}
        {priceFrom} to {priceTo}: {(model.pricePerWinShare * 100).toFixed(1)}% of the cap, about{" "}
        {capSeasonPrice} in {model.capSeason}.
      </p>
      <p>
        Projections weight his last three seasons 3, 2 and 1, pull toward league average, then
        adjust for age. Playing time comes from recent minutes, age and salary, since teams play
        the players they pay. A season lost to injury still pulls the playing time down.
      </p>
      <p>
        Surplus is worth minus salary. A team can always bench a player, so worth never drops
        below the minimum salary. A player option leaves the team only the downside, because he
        walks when he could earn more. A team option or a non-guaranteed year leaves only the
        upside.
      </p>
      {first ? (
        <p>
          The range covers 8 of every 10 outcomes when we test the model on past seasons
          ({Math.round(first.coverage80 * 100)}% one year out). One-year projections were off by
          about {first.rmse.toFixed(1)} wins in a typical season, against{" "}
          {first.naiveRmse.toFixed(1)} for a league-average guess.
        </p>
      ) : null}
      <p>
        Cap figures after {model.capKnownThrough} assume {(model.capGrowth * 100).toFixed(1)}%
        growth a year, the recent average. The percentile compares total surplus across the{" "}
        {model.contracts} current contracts we can estimate.
      </p>
    </MoreInfo>
  );
}

export function PlayerContractTransactions({
  contract,
  value,
  model,
}: {
  contract: PlayerContractSnapshot;
  value: ContractValueView | null;
  model: ContractValueModel;
}) {
  const total = contract.years.reduce((sum, year) => sum + year.salary, 0);
  const span =
    contract.years.length > 1
      ? `${contract.years.length} seasons through ${contract.years[contract.years.length - 1].season}`
      : `${contract.years[0].season} only`;
  const estimate = value?.kind === "estimate" ? value : null;
  const bySeason = new Map(estimate?.years.map((y) => [y.season, y]) ?? []);

  return (
    <section id="contract" className="scroll-mt-16 flex flex-col gap-3" aria-label="Contract">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Contract</h2>
          <p className="text-[14px] text-muted-foreground">
            {formatUsdCompact(total)} over {span}
            {contract.guaranteed != null
              ? ` · ${formatUsdCompact(contract.guaranteed)} guaranteed`
              : ""}
          </p>
        </div>
        <TextLink href={`/teams/${contract.franchiseId}/payroll`} className={type.caption}>
          {contract.teamAbbr} payroll →
        </TextLink>
      </div>

      <div className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        {estimate ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Projected surplus"
              value={signedUsd(estimate.surplus)}
              detail={`80% range ${signedUsd(estimate.surplusLow)} to ${signedUsd(estimate.surplusHigh)}`}
              tone={surplusTone(estimate.surplus)}
            />
            <Stat
              label="Estimated worth"
              value={formatUsdCompact(estimate.totalWorth)}
              detail={`Against ${formatUsdCompact(estimate.totalSalary)} in salary`}
            />
            <Stat
              label="Among contracts"
              value={`${formatOrdinal(estimate.percentile)} percentile`}
              detail={`By total surplus, of ${model.contracts} we can estimate`}
            />
          </div>
        ) : value?.kind === "missing" ? (
          <MissingNote reason={value.reason} model={model} />
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className={cn(type.caption, "uppercase tracking-wide text-muted-foreground")}>
              <tr className="border-b border-border/70">
                <th className="pb-1.5 pr-2 font-semibold">Season</th>
                <th className="px-2 pb-1.5 text-right font-semibold">Salary</th>
                {estimate ? (
                  <>
                    <th className="px-2 pb-1.5 text-right font-semibold">Est. worth</th>
                    <th className="hidden px-2 pb-1.5 text-right font-semibold sm:table-cell">
                      80% range
                    </th>
                    <th className="px-2 pb-1.5 text-right font-semibold">Surplus</th>
                  </>
                ) : null}
                <th className="hidden pb-1.5 pl-2 text-right font-semibold sm:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className={type.bodySm}>
              {contract.years.map((year) => {
                const v = bySeason.get(year.season);
                const note = yearNote(year, v?.worthAboveMax ?? false);
                return (
                  <tr key={year.season} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 pr-2 tabular-nums">
                      <span className="whitespace-nowrap">{year.season}</span>
                      {note ? (
                        <span className={cn(type.caption, "block text-muted-foreground sm:hidden")}>
                          {note}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatUsdCompact(year.salary)}
                    </td>
                    {estimate ? (
                      <>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {v ? formatUsdCompact(v.worth) : "—"}
                        </td>
                        <td className="hidden px-2 py-1.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                          {v ? `${formatUsdCompact(v.worthLow)}–${formatUsdCompact(v.worthHigh)}` : "—"}
                        </td>
                        <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", v && surplusTone(v.surplus))}>
                          {v ? signedUsd(v.surplus) : "—"}
                        </td>
                      </>
                    ) : null}
                    <td className="hidden py-1.5 pl-2 text-right text-muted-foreground sm:table-cell">
                      {note ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {estimate ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            Worth is projected from DRBL wins over {estimate.basisSeasons.join(", ")} (
            {estimate.basisPossessions.toLocaleString()} possessions). Surplus is worth minus
            salary, after options.
          </p>
        ) : null}
        {contract.note ? (
          <p className={cn(type.caption, "text-muted-foreground")}>{contract.note}</p>
        ) : null}
        {estimate ? <MethodNotes model={model} /> : null}
      </div>
    </section>
  );
}
