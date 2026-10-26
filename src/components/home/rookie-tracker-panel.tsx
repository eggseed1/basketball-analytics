import { RookieTrackerBoard } from "@/components/home/rookie-tracker-board";
import { SectionLink } from "@/components/ui/section-link";
import { getHomeRookieTracker } from "@/data/queries/home-rookie-tracker";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Current draft class on the homepage, under contract surplus.
 * Bundled draft-night + season-table bake only (no live ESPN on the home path).
 */
export async function RookieTrackerPanel() {
  const model = await getHomeRookieTracker();

  if (!model.rows.length) {
    return (
      <section
        aria-label="Rookie tracker"
        className="sports-card flex flex-col gap-3 p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className={type.heading}>Rookie tracker</h2>
            <p className={cn(type.caption, "text-muted-foreground")}>
              The {model.draftYear} draft class is not in the bake yet.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const description =
    model.withGames > 0
      ? `${model.draftYear} draft class in ${model.season}. ${model.withGames} with a game line so far; blank is missing, not 0.`
      : `${model.draftYear} draft class for ${model.season}. Per-game lines show up as they play.`;

  return (
    <section
      aria-label="Rookie tracker"
      className="sports-card flex flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className={type.heading}>Rookie tracker</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {description}
          </p>
        </div>
        <SectionLink href={model.exploreHref}>Full class</SectionLink>
      </div>
      <RookieTrackerBoard model={model} />
    </section>
  );
}
