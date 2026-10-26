import { RookieTrackerBoard } from "@/components/home/rookie-tracker-board";
import { SectionLink } from "@/components/ui/section-link";
import { getHomeRookieTracker } from "@/data/queries/home-rookie-tracker";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Current draft-class race on the homepage (replaces contract surplus).
 * Bundled draft-night + season-table bake only (no live ESPN on the home path).
 */
export async function RookieTrackerPanel() {
  const model = await getHomeRookieTracker();

  if (!model.rows.length) {
    return (
      <section
        aria-label="Rookie race"
        className="sports-card flex flex-col gap-3 p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className={type.heading}>Rookie race</h2>
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
      ? `${model.draftYear} class · ${model.season}. WAR1 leads by default; blank is missing, not 0.`
      : `${model.draftYear} class · ${model.season}. Lines show up after they play.`;

  return (
    <section
      aria-label="Rookie race"
      className="sports-card flex flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className={type.heading}>Rookie race</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SectionLink href={model.raceHref}>Full race</SectionLink>
          <SectionLink href={model.exploreHref}>Full class</SectionLink>
        </div>
      </div>
      <RookieTrackerBoard model={model} />
    </section>
  );
}
