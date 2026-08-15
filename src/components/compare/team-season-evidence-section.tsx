import Link from "next/link";

import type { TeamSeasonEvidence } from "@/analytics/season-evidence";
import { cn } from "@/lib/utils";

function ResultBadge({ result }: { result: "W" | "L" | "—" }) {
  return (
    <span
      className={cn(
        "text-[11px] font-bold uppercase tracking-wide",
        result === "W" && "text-foreground",
        result === "L" && "text-muted-foreground"
      )}
    >
      {result}
    </span>
  );
}

/**
 * Calm evidence cards — season profile → Game Lab gateway.
 * No “most important game” language.
 */
export function TeamSeasonEvidenceSection({
  evidence,
  title = "See the evidence",
  subtitle = "Representative regular-season games from schedule scores — descriptive, not causal. Open Game Lab for the box.",
  highlightCategoryIds,
  compact,
}: {
  evidence: TeamSeasonEvidence | null;
  title?: string;
  subtitle?: string;
  /** Optional: emphasize findings that relate to rank advantages. */
  highlightCategoryIds?: string[];
  compact?: boolean;
}) {
  if (!evidence) return null;

  const highlight = new Set(highlightCategoryIds ?? []);

  return (
    <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div>
        <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {evidence.season} · {evidence.coverage.gameCount} final regular-season
          games in sample
        </p>
      </div>

      {evidence.error ? (
        <p className="text-[13px] text-muted-foreground">{evidence.error}</p>
      ) : null}

      {evidence.games.length ? (
        <ul
          className={cn(
            "grid gap-3",
            compact ? "sm:grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {evidence.games.map((card) => (
            <li key={card.gameId}>
              <Link
                href={card.href}
                className="flex h-full flex-col gap-2 rounded-xl border border-border bg-background/60 px-3 py-3 transition-colors hover:bg-secondary/50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-bold tracking-tight">
                    {card.isHome ? "vs" : "@"} {card.opponentLabel}
                  </p>
                  <ResultBadge result={card.result} />
                </div>
                <p className="text-[12px] tabular-nums text-muted-foreground">
                  {card.gameDate} · {card.teamScore}–{card.opponentScore} (
                  {card.margin > 0 ? "+" : ""}
                  {card.margin})
                </p>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Why it appears
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {card.findings.map((f) => (
                      <li
                        key={f.categoryId}
                        className={cn(
                          "text-[13px]",
                          highlight.has(f.categoryId)
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {f.label}
                        <span className="ml-1 tabular-nums text-foreground/80">
                          {f.valueDisplay}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="mt-auto pt-1 text-[12px] font-semibold">
                  Open Game Lab →
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : !evidence.error ? (
        <p className="text-[13px] text-muted-foreground">
          No representative games available for this season sample.
        </p>
      ) : null}

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer font-semibold">
          Evidence coverage &amp; methodology
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {evidence.coverage.categories.map((c) => (
            <li key={c.id}>
              {c.available ? "✓" : "—"} {c.label}
              {c.note ? ` (${c.note})` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-2">{evidence.methodology.selectionRule}</p>
        <p className="mt-1">{evidence.methodology.languageRule}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {evidence.coverage.unsupported.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Side-by-side evidence for Team Season Compare. */
export function TeamSeasonEvidenceCompareSection({
  evidenceA,
  evidenceB,
  labelA,
  labelB,
}: {
  evidenceA: TeamSeasonEvidence | null;
  evidenceB: TeamSeasonEvidence | null;
  labelA: string;
  labelB: string;
}) {
  if (!evidenceA && !evidenceB) return null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-[15px] font-bold tracking-tight">
          Compare the evidence
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Representative games for each season — same descriptive rules, not a
          cross-season game-matching algorithm.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamSeasonEvidenceSection
          evidence={evidenceA}
          title={labelA}
          subtitle="Season evidence"
          compact
        />
        <TeamSeasonEvidenceSection
          evidence={evidenceB}
          title={labelB}
          subtitle="Season evidence"
          compact
        />
      </div>
    </section>
  );
}
