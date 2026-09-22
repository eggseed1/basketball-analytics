import type {
  GameAnalysisSummary,
  GameWinningFactor,
} from "@/analytics/game-lab";
import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { TextLink } from "@/components/ui/text-link";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function FactorRow({
  factor,
  sideLabel,
}: {
  factor: GameWinningFactor;
  sideLabel: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className={cn(type.bodySm, "min-w-0 font-semibold")}>
        {factor.label}
        <span className="font-normal text-muted-foreground">
          {" "}
          · {sideLabel}
        </span>
      </span>
      <span
        className={cn(
          type.caption,
          "shrink-0 tabular-nums text-muted-foreground"
        )}
      >
        {factor.deltaDisplay}
      </span>
    </li>
  );
}

/**
 * Box-derived narrative for Game Lab — answer before flow / PBP rabbit holes.
 * Descriptive advantages only; not causation or a game grade.
 */
export function GameWhatDecided({
  analysis,
}: {
  analysis: GameAnalysisSummary;
}) {
  const {
    outcome,
    whatChanged,
    homeAdvantages,
    awayAdvantages,
    overallReason,
    overallEdgeDisplay,
    playerHighlights,
    gameSeasonContext,
    coverage,
    methodology,
  } = analysis;

  const hasBoxFactors =
    coverage.hasTeamTotals &&
    (homeAdvantages.length > 0 || awayAdvantages.length > 0);
  const swingLines = whatChanged.slice(0, 4);
  const topScorer = playerHighlights.scoring[0];
  const unusual =
    gameSeasonContext.availability === "ready"
      ? gameSeasonContext.findings.slice(0, 3)
      : [];

  const empty =
    !hasBoxFactors &&
    swingLines.length === 0 &&
    !topScorer &&
    unusual.length === 0;

  return (
    <MatchupWashCard
      awayTeamKey={outcome.awayTeamId}
      homeTeamKey={outcome.homeTeamId}
      intensity="subtle"
      className="flex flex-col gap-3 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <h2 className={type.heading}>What decided it</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Statistical edges from the box — not a causal score.
          </p>
        </div>
        {coverage.hasTeamTotals ? (
          <p
            className={cn(
              type.micro,
              "font-bold uppercase tracking-[0.1em] text-muted-foreground"
            )}
          >
            Edge · {overallEdgeDisplay}
          </p>
        ) : null}
      </div>

      {empty ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {coverage.hasBoxScore
            ? "No meaningful box edges cleared their tolerances for this game."
            : "Detailed box data is not available for this game, so winning-factor analysis stays empty."}
        </p>
      ) : (
        <>
          <p className={cn(type.body, "max-w-3xl")}>{overallReason}</p>

          {swingLines.length ? (
            <div>
              <p
                className={cn(
                  type.micro,
                  "mb-1.5 font-bold uppercase tracking-[0.1em] text-muted-foreground"
                )}
              >
                How the score moved
              </p>
              <ul
                className={cn(
                  type.bodySm,
                  "list-disc space-y-1 pl-4 text-muted-foreground"
                )}
              >
                {swingLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasBoxFactors ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p
                  className={cn(
                    type.micro,
                    "mb-1.5 font-bold uppercase tracking-[0.1em] text-muted-foreground"
                  )}
                >
                  {outcome.awayLabel} advantages
                </p>
                {awayAdvantages.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {awayAdvantages.map((f) => (
                      <FactorRow
                        key={f.id}
                        factor={f}
                        sideLabel={outcome.awayLabel}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className={cn(type.caption, "text-muted-foreground")}>
                    None cleared tolerance
                  </p>
                )}
              </div>
              <div>
                <p
                  className={cn(
                    type.micro,
                    "mb-1.5 font-bold uppercase tracking-[0.1em] text-muted-foreground"
                  )}
                >
                  {outcome.homeLabel} advantages
                </p>
                {homeAdvantages.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {homeAdvantages.map((f) => (
                      <FactorRow
                        key={f.id}
                        factor={f}
                        sideLabel={outcome.homeLabel}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className={cn(type.caption, "text-muted-foreground")}>
                    None cleared tolerance
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {topScorer ? (
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              Top scorer:{" "}
              <TextLink href={topScorer.playerHref} className="text-foreground">
                {topScorer.playerName}
              </TextLink>{" "}
              <span className="tabular-nums">({topScorer.display})</span>
            </p>
          ) : null}

          {unusual.length ? (
            <div>
              <p
                className={cn(
                  type.micro,
                  "mb-1.5 font-bold uppercase tracking-[0.1em] text-muted-foreground"
                )}
              >
                Vs season normal
              </p>
              <ul
                className={cn(
                  type.bodySm,
                  "list-disc space-y-1 pl-4 text-muted-foreground"
                )}
              >
                {unusual.map((f) => (
                  <li key={f.id}>{f.text}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <p className={cn(type.caption, "text-muted-foreground")}>
        {methodology.winningFactorsRule}
      </p>
    </MatchupWashCard>
  );
}
