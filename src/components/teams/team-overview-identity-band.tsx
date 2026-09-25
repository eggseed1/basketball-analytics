import { GlassSurface } from "@/components/brand/glass-surface";
import type { TeamIdentityStatement } from "@/lib/team-explorer";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Percentile-band identity lines — measurable, not a team grade.
 */
export function TeamOverviewIdentityBand({
  statements,
  coverageLines,
}: {
  statements: TeamIdentityStatement[];
  coverageLines: Array<{
    label: string;
    status: "ok" | "partial" | "unavailable";
  }>;
}) {
  if (!statements.length && !coverageLines.length) return null;

  return (
    <GlassSurface
      effect="css"
      className="flex flex-col gap-3 p-4 sm:p-5"
      aria-label="Team identity"
    >
      <div>
        <h2 className={type.heading}>Who they are</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          League-percentile bands from this season&apos;s board — not a quality
          grade.
        </p>
      </div>

      {statements.length ? (
        <ul className={cn(type.bodySm, "flex flex-col gap-1.5")}>
          {statements.map((s) => (
            <li key={s.id}>{s.text}</li>
          ))}
        </ul>
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No Top/Bottom band traits cleared on this board yet.
        </p>
      )}

      {coverageLines.length ? (
        <details className="group">
          <summary
            className={cn(
              type.caption,
              "cursor-pointer list-none font-semibold text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden"
            )}
          >
            Coverage
          </summary>
          <ul
            className={cn(
              type.caption,
              "mt-2 flex flex-col gap-1 text-muted-foreground"
            )}
          >
            {coverageLines.map((line) => (
              <li key={line.label}>
                {line.label}: {line.status}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </GlassSurface>
  );
}
