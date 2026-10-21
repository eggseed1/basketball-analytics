import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ContractValueChart } from "@/components/players/contract-value-chart";
import { MoreInfo } from "@/components/ui/more-info";
import { TextLink } from "@/components/ui/text-link";
import { sectionAtomicTileClassName } from "@/lib/design-system-sections";
import type {
  ContractValueGap,
  ContractValueModel,
  ContractValueView,
} from "@/data/runtime/contract-value";
import type {
  PlayerContractSnapshot,
  PlayerContractYearView,
} from "@/data/queries/player-front-office";
import { capsForSeasons } from "@/data/queries/salary-learn";
import { type } from "@/lib/design-system";
import { formatOrdinal, formatPct } from "@/lib/format";
import { playerSurplusRankingHref } from "@/lib/contract-surplus";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { playerHref } from "@/lib/player-page-contract";
import { teamSalaryHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";
import { LinkCue } from "@/components/ui/link-cue";

function yearTerms(year: PlayerContractYearView): string | null {
  const option =
    year.option === "player"
      ? "Player option"
      : year.option === "team"
        ? "Team option"
        : null;
  const parts = [
    option && year.optionExercised ? `${option} exercised` : option,
    year.notGuaranteed ? "Not guaranteed" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function yearNote(year: PlayerContractYearView, aboveMax: boolean): string | null {
  const parts = [yearTerms(year), aboveMax ? "Worth more than the max" : null].filter(
    Boolean
  );
  return parts.length ? parts.join(" · ") : null;
}

const signedUsd = formatUsdSignedCompact;

export function surplusTone(dollars: number): string {
  if (Math.abs(dollars) < 50_000) return "text-muted-foreground";
  return dollars > 0 ? "text-[var(--chart-3)]" : "text-destructive";
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

function MissingNote({
  reason,
  model,
}: {
  reason: ContractValueGap;
  model: ContractValueModel;
}) {
  return <p className={cn(type.bodySm, "text-muted-foreground")}>{GAP_TEXT[reason](model)}</p>;
}

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function MethodNotes({ model }: { model: ContractValueModel }) {
  const nextSeason = model.outOfSample.byHorizon.find((row) => row.horizon === 1);
  const farthest = model.outOfSample.byHorizon.reduce<
    (typeof model.outOfSample.byHorizon)[number] | null
  >(
    (best, row) =>
      row.horizon > 1 && (!best || row.horizon > best.horizon) ? row : best,
    null
  );
  const refits = model.outOfSample.fitThrough;
  const capSeasonPrice = formatUsdCompact(model.pricePerWinShare * model.capSeasonCap);
  const priceFrom = model.priceSeasons[0];
  const priceTo = model.priceSeasons[model.priceSeasons.length - 1];
  const weights = model.weights.map((w) => String(w));
  const drblShare = model.projectionBasis?.drblShare ?? null;
  return (
    <MoreInfo>
      <p>
        Worth is what his projected wins would cost on the open market. We count wins above a
        minimum-salary player in the same minutes and price them at what teams paid per WAR1 win
        from {priceFrom} to {priceTo}: {(model.pricePerWinShare * 100).toFixed(1)}% of the cap,
        about {capSeasonPrice} in {model.capSeason}.
      </p>
      <p>
        Projections weight his last {weights.length} seasons {listJoin(weights)}, newest first
        {drblShare == null
          ? ", using each season's WAR1"
          : drblShare === 1
            ? ", using each season's DRBL/100 turned into wins"
            : drblShare === 0.5
              ? ", counting each season half from WAR1 and half from DRBL/100 turned into wins"
              : `, counting each season ${Math.round(drblShare * 100)}% from DRBL/100 turned into wins and the rest from WAR1`}
        . They pull toward what players at his salary usually produce, then adjust for age. Playing
        time comes from recent minutes, age and salary, since teams play the players they pay. A
        season lost to injury still pulls the playing time down.
      </p>
      <p>
        Surplus is worth minus salary. A team can always bench a player, so worth never drops below
        the minimum salary. A player option leaves the team only the downside, because he walks when
        he could earn more. A team option or a non-guaranteed year leaves only the upside.
      </p>
      {nextSeason ? (
        <p>
          To test it, we refit the model{" "}
          {refits.length > 1
            ? `${numberWord(refits.length)} times, each with only the seasons through ${refits.slice(0, -1).join(", ")} or ${refits[refits.length - 1]}`
            : `with only the seasons through ${refits[0]}`}
          , valued what players were actually paid afterward, and compared with what they did. The
          typical miss the next season was {nextSeason.rmseWins.toFixed(2)} wins, against{" "}
          {nextSeason.repeatRmseWins.toFixed(2)} for assuming a player repeats his last season.
          {farthest
            ? ` ${capitalize(numberWord(farthest.horizon))} seasons out it was ${farthest.rmseWins.toFixed(2)} wins, against ${farthest.repeatRmseWins.toFixed(2)}.`
            : null}{" "}
          {Math.round(nextSeason.aboveHigh * 100)}% of players beat the top of the range. Fewer than{" "}
          {Math.max(1, Math.ceil(nextSeason.belowLow * 100))}% fell below the bottom, since worth
          can&apos;t drop under the minimum salary.
        </p>
      ) : null}
      <p>
        Cap figures after {model.capKnownThrough} assume {(model.capGrowth * 100).toFixed(1)}% growth
        a year, the recent average. The percentile compares total surplus across the{" "}
        {model.contracts} current contracts we can estimate.
      </p>
    </MoreInfo>
  );
}

function MoneyTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={sectionAtomicTileClassName} data-motion-tile>
      <dt
        className={cn(
          type.micro,
          "font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {label}
      </dt>
      <dd className={cn(type.title, "font-bold tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

/** Every year on the deal with salary as a share of that season's cap. */
function ContractYearsVsCap({
  years,
  focusSeason,
  caps,
}: {
  years: PlayerContractYearView[];
  focusSeason: string | null;
  caps: Map<string, { cap: number; projected: boolean }>;
}) {
  const rows = years.map((year) => {
    const cap = caps.get(year.season) ?? null;
    const share = cap && cap.cap > 0 ? year.salary / cap.cap : null;
    return { year, cap, share };
  });
  const anyProjected = rows.some((r) => r.cap?.projected);
  // Track is 40% of cap (max-contract territory) so ordinary deals stay readable.
  const trackShare = 0.4;

  return (
    <div className="sports-card flex flex-col gap-3 p-4 sm:p-5" data-motion="card">
      <div>
        <h3 className={type.heading}>Contract years</h3>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Salary each season against that year&apos;s league cap
          {anyProjected
            ? ". Caps after the last published figure use the recent growth rate."
            : "."}
        </p>
      </div>

      <div
        className={cn(
          type.micro,
          "hidden grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_4.5rem_3.75rem] items-center gap-3 px-0.5 font-semibold uppercase tracking-wide text-muted-foreground sm:grid"
        )}
      >
        <span>Season</span>
        <span aria-hidden />
        <span className="text-right">Salary</span>
        <span className="text-right">Cap</span>
        <span className="text-right">Share</span>
      </div>

      <ul data-hover-group className="flex flex-col gap-1.5" aria-label="Contract salary vs cap">
        {rows.map(({ year, cap, share }, i) => {
          const active = year.season === focusSeason;
          const note = yearTerms(year);
          const barPct =
            share != null ? Math.min(100, (share / trackShare) * 100) : 0;
          return (
            <li
              key={year.season}
              data-hover-item
              data-motion="row"
              style={{ "--i": i } as CSSProperties}
              className={cn(
                "grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-[11px] px-2 py-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_4.5rem_3.75rem]",
                active && "bg-foreground/[0.06]"
              )}
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    type.bodySm,
                    "block tabular-nums",
                    active ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {year.season}
                </span>
                {note ? (
                  <span className={cn(type.micro, "block truncate text-muted-foreground")}>
                    {note}
                  </span>
                ) : null}
                <span
                  className={cn(
                    type.micro,
                    "mt-0.5 block tabular-nums text-muted-foreground sm:hidden"
                  )}
                >
                  {formatUsdCompact(year.salary)}
                  {share != null ? ` · ${formatPct(share, 1)} of cap` : ""}
                </span>
              </span>

              <span
                className="relative h-5 rounded-full bg-foreground/[0.05]"
                aria-hidden
                title={
                  share != null
                    ? `${formatPct(share, 1)} of a ${formatUsdCompact(cap!.cap)} cap`
                    : undefined
                }
              >
                {share != null ? (
                  <span
                    data-motion-bar="x"
                    className="absolute inset-y-1 left-0 rounded-full bg-foreground/55"
                    style={{ width: `${Math.max(2, barPct)}%` }}
                  />
                ) : null}
              </span>

              <span
                className={cn(
                  type.caption,
                  "hidden text-right tabular-nums sm:block",
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {formatUsdCompact(year.salary)}
              </span>
              <span
                className={cn(
                  type.caption,
                  "hidden text-right tabular-nums text-muted-foreground sm:block"
                )}
              >
                {cap ? (
                  <>
                    {formatUsdCompact(cap.cap)}
                    {cap.projected ? (
                      <span className="block text-[10px] normal-case tracking-normal">
                        projected
                      </span>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span
                className={cn(
                  type.bodySm,
                  "text-right font-bold tabular-nums",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {share != null ? formatPct(share, 1) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className={cn(type.caption, "text-muted-foreground")}>
        The bar fills when salary reaches 40% of that season&apos;s cap.
      </p>
    </div>
  );
}

/**
 * Contract + surplus. `summary` is Overview (tiles + deep link).
 * `full` is the Salary tab (chart, year detail, played-off children).
 */
export function PlayerContractTransactions({
  contract,
  value,
  model,
  playerId,
  season,
  variant = "full",
  children,
}: {
  playerId?: string | null;
  contract: PlayerContractSnapshot;
  value: ContractValueView | null;
  model: ContractValueModel;
  /** Page season; used to spotlight that year on the Salary tab. */
  season?: string | null;
  variant?: "summary" | "full";
  /** Extra cards below the contract, such as salary paid off. */
  children?: ReactNode;
}) {
  const total = contract.years.reduce((sum, year) => sum + year.salary, 0);
  const span =
    contract.years.length > 1
      ? `${contract.years.length} seasons through ${contract.years[contract.years.length - 1].season}`
      : `${contract.years[0].season} only`;
  const estimate = value?.kind === "estimate" ? value : null;
  const bySeason = new Map(estimate?.years.map((y) => [y.season, y]) ?? []);
  const focusSeason =
    (season && contract.years.some((y) => y.season === season) && season) ||
    contract.years[0]?.season ||
    null;
  const focusYear = focusSeason
    ? contract.years.find((y) => y.season === focusSeason) ?? null
    : null;
  const focusValue = focusSeason ? bySeason.get(focusSeason) ?? null : null;
  const salaryHref = playerId
    ? playerHref({ playerId, season: focusSeason ?? contract.capSeason, view: "salary" })
    : null;

  if (variant === "summary") {
    return (
      <section
        id="contract"
        data-slot="section-frame"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Contract"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className={type.heading}>Contract</h2>
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              {formatUsdCompact(total)} over {span}
              {contract.guaranteed != null
                ? ` · ${formatUsdCompact(contract.guaranteed)} guaranteed`
                : ""}
            </p>
          </div>
          {salaryHref ? (
            <TextLink href={salaryHref} scroll={false} className={cn(type.caption, "font-semibold")}>
              Full salary and played off <LinkCue />
            </TextLink>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {estimate ? (
            <MoneyTile
              label="Surplus"
              value={signedUsd(estimate.surplus)}
              tone={surplusTone(estimate.surplus)}
            />
          ) : null}
          {estimate ? (
            <MoneyTile label="Worth" value={formatUsdCompact(estimate.totalWorth)} />
          ) : null}
          <MoneyTile label="Salary" value={formatUsdCompact(estimate?.totalSalary ?? total)} />
          {estimate ? (
            <MoneyTile
              label="Rank"
              value={formatOrdinal(estimate.percentile)}
            />
          ) : (
            <MoneyTile label="Team" value={contract.teamAbbr} />
          )}
        </dl>

        {estimate ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            Likely {signedUsd(estimate.surplusLow)} to {signedUsd(estimate.surplusHigh)}.{" "}
            <Link
              href={playerSurplusRankingHref(playerId)}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              {formatOrdinal(estimate.percentile)} of {model.contracts} contracts
            </Link>
            .
          </p>
        ) : value?.kind === "missing" ? (
          <MissingNote reason={value.reason} model={model} />
        ) : null}
      </section>
    );
  }

  const seasonCaps = capsForSeasons(contract.years.map((y) => y.season));
  const focusCap = focusSeason ? seasonCaps.get(focusSeason) ?? null : null;
  const focusShare =
    focusYear && focusCap && focusCap.cap > 0
      ? focusYear.salary / focusCap.cap
      : null;

  return (
    <section
      id="salary"
      data-slot="section-frame"
      className="scroll-mt-16 flex flex-col gap-5"
      aria-label="Salary"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className={type.heading}>Salary</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {formatUsdCompact(total)} over {span}
            {contract.guaranteed != null
              ? ` · ${formatUsdCompact(contract.guaranteed)} guaranteed`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {estimate ? (
            <TextLink href={playerSurplusRankingHref(playerId)} className={type.caption}>
              Surplus rankings <LinkCue />
            </TextLink>
          ) : null}
          <TextLink
            href={teamSalaryHref(contract.franchiseId, "contracts")}
            className={type.caption}
          >
            {contract.teamAbbr} payroll <LinkCue />
          </TextLink>
        </div>
      </div>

      <ContractYearsVsCap
        years={contract.years}
        focusSeason={focusSeason}
        caps={seasonCaps}
      />

      {focusYear ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MoneyTile label={`${focusYear.season} salary`} value={formatUsdCompact(focusYear.salary)} />
          <MoneyTile
            label="% of cap"
            value={focusShare != null ? formatPct(focusShare, 1) : "—"}
          />
          {focusCap ? (
            <MoneyTile
              label={focusCap.projected ? "Cap (projected)" : "League cap"}
              value={formatUsdCompact(focusCap.cap)}
            />
          ) : null}
          {focusValue ? (
            <MoneyTile
              label="Surplus"
              value={signedUsd(focusValue.surplus)}
              tone={surplusTone(focusValue.surplus)}
            />
          ) : null}
        </dl>
      ) : null}

      {estimate || value?.kind === "missing" ? (
        <div className="sports-card flex flex-col gap-4 p-4 sm:p-5" data-motion="card">
          {estimate ? (
            <div className="flex flex-col gap-1">
              <p
                className={cn(
                  type.caption,
                  "font-semibold uppercase tracking-wide text-muted-foreground"
                )}
              >
                Projected surplus
              </p>
              <p
                className={cn(
                  "text-[28px] font-bold tabular-nums tracking-tight",
                  surplusTone(estimate.surplus)
                )}
              >
                {signedUsd(estimate.surplus)}
              </p>
              <p className={cn(type.bodySm, "text-muted-foreground")}>
                Worth {formatUsdCompact(estimate.totalWorth)} on{" "}
                {formatUsdCompact(estimate.totalSalary)} in salary. Likely{" "}
                {signedUsd(estimate.surplusLow)} to {signedUsd(estimate.surplusHigh)}.{" "}
                <Link
                  href={playerSurplusRankingHref(playerId)}
                  className="underline-offset-2 hover:text-foreground hover:underline"
                >
                  {formatOrdinal(estimate.percentile)} of {model.contracts} contracts.
                </Link>
              </p>
            </div>
          ) : value?.kind === "missing" ? (
            <MissingNote reason={value.reason} model={model} />
          ) : null}

          {estimate ? (
            <ContractValueChart
              years={contract.years.flatMap((year) => {
                const v = bySeason.get(year.season);
                return v
                  ? [
                      {
                        season: year.season,
                        salary: year.salary,
                        worthLow: v.worthLow,
                        worth: v.worth,
                        worthHigh: v.worthHigh,
                        surplus: v.surplus,
                        note: yearNote(year, v.worthAboveMax),
                        terms: yearTerms(year),
                      },
                    ]
                  : [];
              })}
              initialSeason={focusSeason}
            />
          ) : null}

          {estimate ? (
            <p className={cn(type.caption, "text-muted-foreground")}>
              From his DRBL seasons {estimate.basisSeasons.join(", ")} (
              {estimate.basisPossessions.toLocaleString()} possessions).
            </p>
          ) : null}
          {estimate ? <MethodNotes model={model} /> : null}
        </div>
      ) : null}

      {contract.note ? (
        <p className={cn(type.caption, "text-muted-foreground")}>{contract.note}</p>
      ) : null}
      {children}
    </section>
  );
}
