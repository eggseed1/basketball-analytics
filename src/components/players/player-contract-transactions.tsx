import { TextLink } from "@/components/ui/text-link";
import type {
  PlayerContractSnapshot,
  PlayerContractYearView,
} from "@/data/queries/player-front-office";
import { type } from "@/lib/design-system";
import { formatUsdCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function yearNote(year: PlayerContractYearView): string | null {
  const parts = [
    year.option === "player" ? "Player option" : year.option === "team" ? "Team option" : null,
    year.notGuaranteed ? "Not guaranteed" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function PlayerContractTransactions({
  contract,
}: {
  contract: PlayerContractSnapshot;
}) {
  const total = contract.years.reduce((sum, year) => sum + year.salary, 0);
  const span =
    contract.years.length > 1
      ? `${contract.years.length} seasons through ${contract.years[contract.years.length - 1].season}`
      : `${contract.years[0].season} only`;

  return (
    <div className="relative z-[1] flex w-full flex-col gap-2 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Contract
        </p>
        <TextLink
          href={`/teams/${contract.franchiseId}/payroll`}
          className={type.caption}
        >
          {contract.teamAbbr} payroll →
        </TextLink>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {formatUsdCompact(total)} over {span}
        {contract.guaranteed != null
          ? ` · ${formatUsdCompact(contract.guaranteed)} guaranteed`
          : ""}
      </p>
      <table className="w-full text-left">
        <thead
          className={cn(
            type.caption,
            "uppercase tracking-wide text-muted-foreground"
          )}
        >
          <tr>
            <th className="pb-1 pr-2 font-semibold">Season</th>
            <th className="px-1.5 pb-1 text-right font-semibold">Salary</th>
            <th className="pb-1 pl-1.5 text-right font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody>
          {contract.years.map((year) => (
            <tr key={year.season}>
              <td className={cn(type.caption, "py-1 pr-2 tabular-nums")}>
                {year.season}
              </td>
              <td
                className={cn(
                  type.caption,
                  "px-1.5 py-1 text-right tabular-nums"
                )}
              >
                {formatUsdCompact(year.salary)}
              </td>
              <td
                className={cn(
                  type.caption,
                  "py-1 pl-1.5 text-right text-muted-foreground"
                )}
              >
                {yearNote(year) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {contract.note ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          {contract.note}
        </p>
      ) : null}
    </div>
  );
}
