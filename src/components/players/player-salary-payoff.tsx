import { SalaryPayoffChart } from "@/components/charts/salary-payoff-chart";
import { TextLink } from "@/components/ui/text-link";
import {
  getPlayerPayoff,
  payoffLeftOutNote,
  payoffLine,
  payoffMethodNote,
  payoffSourceNote,
  sampleIndexes,
} from "@/data/runtime/salary-payoff";
import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import { formatUsdCompact } from "@/lib/format-money";
import { shortDate } from "@/lib/salary-payoff";
import { cn } from "@/lib/utils";

function pct(n: number): string {
  return `${Math.round(n).toLocaleString()}%`;
}

/** How much of this season's salary his play has covered, night by night. */
export function PlayerSalaryPayoff({ nbaId, playerId }: { nbaId?: string | null; playerId: string }) {
  const found = getPlayerPayoff(nbaId);
  if (!found) return null;
  const { meta, player } = found;
  const now = player.pct.at(-1) ?? 0;
  const earned = player.earned.at(-1) ?? 0;
  const pace = meta.pace.at(-1) ?? 0;
  const indexes = sampleIndexes(meta.dates.length, meta.dates.length);
  const finished = meta.kind === "paced" || pace >= 100;
  const leftOut = payoffLeftOutNote(meta);

  return (
    <div className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="salary-payoff-title">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h3 id="salary-payoff-title" className={type.heading}>
            Salary paid off · {meta.season}
          </h3>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {pct(now)} of his {formatUsdCompact(player.salary)} salary
            {finished ? "" : ` with ${pct(pace)} of the season paid out`}
            {player.paidOff
              ? `, covered on ${shortDate(player.paidOff)}`
              : player.projected != null
                ? `, on pace for ${pct(player.projected)}`
                : ""}
            . {formatUsdCompact(earned)} of worth, {formatOrdinal(player.rank)} of {meta.players} players.
          </p>
        </div>
        <TextLink
          href={`/explore/players/visualizations?view=payoff&pin=${encodeURIComponent(nbaId ?? playerId)}${meta.kind === "paced" ? `&season=${meta.season}` : ""}`}
          className={type.caption}
        >
          League board <span data-motion-arrow aria-hidden>→</span>
        </TextLink>
      </div>
      <SalaryPayoffChart
        dates={indexes.map((i) => meta.dates[i])}
        pace={indexes.map((i) => meta.pace[i])}
        lines={[payoffLine(player, indexes, true)]}
      />
      <div className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        <p>{payoffMethodNote(meta)}</p>
        <p>{payoffSourceNote(meta)}</p>
        {leftOut ? <p>{leftOut}</p> : null}
      </div>
    </div>
  );
}
