import { TextLink } from "@/components/ui/text-link";
import type { PlayerContractSnapshot } from "@/data/queries/player-front-office";
import { type } from "@/lib/design-system";
import { formatUsdCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function optionLabel(opt: string): string | null {
  switch (opt) {
    case "PLAYER_OPTION":
      return "Player opt";
    case "TEAM_OPTION":
      return "Team opt";
    case "EARLY_TERMINATION_OPTION":
      return "ETO";
    case "QUALIFYING_OFFER":
      return "QO";
    case "NONE":
    case "UNKNOWN":
      return null;
    default:
      return opt.replace(/_/g, " ").toLowerCase();
  }
}

function contractTypeLabel(type: string): string | null {
  switch (type) {
    case "STANDARD":
      return "Standard";
    case "TWO_WAY":
      return "Two-way";
    case "OTHER":
    case "UNKNOWN":
      return null;
    default:
      return type.replace(/_/g, " ").toLowerCase();
  }
}

export function PlayerContractTransactions({
  contract,
}: {
  contract: PlayerContractSnapshot;
}) {
  const seasons = [...contract.row.years].sort((a, b) =>
    a.season.localeCompare(b.season)
  );
  if (!seasons.length) return null;

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
        {contractTypeLabel(contract.row.contractType)
          ? `${contractTypeLabel(contract.row.contractType)} · `
          : ""}
        Snapshot {contract.snapshotSeason}
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
          {seasons.map((year) => {
            const opt = optionLabel(year.optionType);
            return (
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
                  {opt ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
