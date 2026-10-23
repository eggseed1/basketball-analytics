import { ContractShowcaseBoard } from "@/components/home/contract-showcase-board";
import { SectionLink } from "@/components/ui/section-link";
import { getPlayerSurplusRows } from "@/data/queries/contract-surplus";
import {
  currentPayoffSeason,
  ensureSalaryPayoff,
  getPayoffSeason,
  payoffWaiting,
} from "@/data/runtime/salary-payoff";
import { ensureContractValue } from "@/data/runtime/contract-value";
import { PLAYER_SURPLUS_RANKING_PATH } from "@/lib/contract-surplus";
import { buildContractShowcase } from "@/lib/home-contract-showcase";
import { shortDate } from "@/lib/salary-payoff";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const PAYOFF_HREF = "/explore/players/visualizations?view=payoff";

/**
 * League salary-played-off + surplus showcase for the homepage main column.
 * Matches other home desk cards: one sports-card, header inside, list body.
 */
export async function ContractShowcasePanel() {
  await Promise.all([ensureSalaryPayoff(), ensureContractValue()]);
  const leagueSeason = currentPayoffSeason();
  const waiting = payoffWaiting(leagueSeason);
  const season =
    waiting?.previous && !getPayoffSeason(leagueSeason)
      ? waiting.previous
      : leagueSeason;
  const found = getPayoffSeason(season);

  if (!found?.players.length) {
    return (
      <section
        aria-label="Contract surplus"
        className="sports-card flex flex-col gap-3 p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className={type.heading}>Contract surplus</h2>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Who has played the most of their deal off, and who still projects
              as a bargain.
            </p>
          </div>
          <SectionLink href={PAYOFF_HREF}>Full board</SectionLink>
        </div>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {waiting
            ? `${waiting.season} payoff lines start after opening night${
                waiting.opener ? ` (${shortDate(waiting.opener)})` : ""
              }. Everyone begins at 0.`
            : "No salary payoff lines are baked yet."}
        </p>
      </section>
    );
  }

  const model = buildContractShowcase({
    season: found.meta.season,
    showingPrior: Boolean(waiting && season !== leagueSeason),
    waitingSeason: waiting?.season ?? null,
    opener: waiting?.opener ?? null,
    meta: found.meta,
    players: found.players,
    surplusRows: getPlayerSurplusRows(),
  });

  const description = model.showingPrior
    ? `${model.season} readings while ${model.waitingSeason} waits on tip. Climb is recent payoff progress; surplus is projected worth minus remaining salary.`
    : `Through ${shortDate(model.meta.through)}. Climb is recent payoff progress; surplus is projected worth minus remaining salary on the deal.`;

  return (
    <section
      aria-label="Contract surplus"
      className="sports-card flex flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className={type.heading}>Contract surplus</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SectionLink
            href={`${PAYOFF_HREF}&season=${encodeURIComponent(model.season)}`}
          >
            Payoff board
          </SectionLink>
          <SectionLink href={PLAYER_SURPLUS_RANKING_PATH}>
            Full surplus
          </SectionLink>
        </div>
      </div>

      <ContractShowcaseBoard model={model} />
    </section>
  );
}
