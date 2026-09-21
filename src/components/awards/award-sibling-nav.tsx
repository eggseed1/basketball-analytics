import { TransitionLink } from "@/components/continuity/query-nav";
import { AWARD_DEFINITIONS } from "@/content/awards/catalog";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function AwardSiblingNav({ currentSlug }: { currentSlug: string }) {
  const idx = AWARD_DEFINITIONS.findIndex((a) => a.slug === currentSlug);
  if (idx < 0) return null;
  const prev = idx > 0 ? AWARD_DEFINITIONS[idx - 1] : null;
  const next =
    idx < AWARD_DEFINITIONS.length - 1 ? AWARD_DEFINITIONS[idx + 1] : null;

  return (
    <nav
      aria-label="Other awards"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
    >
      {prev ? (
        <TransitionLink
          href={`/awards/${prev.slug}`}
          className={cn(
            type.bodySm,
            "min-w-0 font-semibold text-muted-foreground underline-offset-4 hover:underline"
          )}
        >
          ← {prev.shortLabel}
        </TransitionLink>
      ) : (
        <span />
      )}
      {next ? (
        <TransitionLink
          href={`/awards/${next.slug}`}
          className={cn(
            type.bodySm,
            "min-w-0 text-right font-semibold text-muted-foreground underline-offset-4 hover:underline"
          )}
        >
          {next.shortLabel} →
        </TransitionLink>
      ) : (
        <span />
      )}
    </nav>
  );
}
