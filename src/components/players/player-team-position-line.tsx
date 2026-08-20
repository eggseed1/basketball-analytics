import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TeamLogo } from "@/components/brand/team-logo";
import { TeamIdentity } from "@/components/teams/team-identity";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { textLinkClassName, type } from "@/lib/design-system";
import type { PlayerCardStint } from "@/lib/player-team-context";
import { cn } from "@/lib/utils";

/**
 * Team then position, additional stops on the same line with a small
 * vertical divider: `DAL PG | LAL PG`.
 */
export function PlayerTeamPositionLine({
  stints,
  season,
  fallbackPosition,
  useHistoricalBranding = false,
  density = "card",
  interactive = true,
  className,
}: {
  stints: PlayerCardStint[];
  season?: string | null;
  fallbackPosition?: string | null;
  useHistoricalBranding?: boolean;
  density?: "card" | "preview";
  /** False inside another link (hover cards). */
  interactive?: boolean;
  className?: string;
}) {
  if (stints.length === 0) return null;
  const preview = density === "preview";
  const typeClass = preview ? type.caption : type.bodySm;
  const logoSize = preview ? "2xs" : "sm";
  const markSize = preview ? "xs" : "sm";

  return (
    <span
      className={cn(
        typeClass,
        "inline-flex min-w-0 flex-wrap items-center justify-center gap-y-1 text-muted-foreground",
        className
      )}
    >
      {stints.map((stint, index) => {
        const era =
          useHistoricalBranding && season
            ? resolveHistoricalTeamBrand(stint.teamKey, season, "era")
            : null;
        const label = era?.abbreviation ?? stint.teamLabel;
        const position = stint.position || fallbackPosition || null;
        const mark = (
          <>
            {era ? (
              <HistoricalTeamMark brand={era} size={markSize} />
            ) : stint.teamKey ? (
              <TeamLogo teamKey={stint.teamKey} size={logoSize} />
            ) : null}
            <span className={interactive ? textLinkClassName : undefined}>
              {label}
            </span>
          </>
        );
        return (
          <span
            key={`${stint.teamKey}-${index}`}
            className="inline-flex min-w-0 items-center"
          >
            {index > 0 ? (
              <span
                className={cn(
                  "h-3 w-px shrink-0 bg-foreground/25",
                  preview ? "mx-1.5" : "mx-2"
                )}
                aria-hidden
              />
            ) : null}
            {interactive && stint.teamKey ? (
              <TeamIdentity
                teamKey={stint.teamKey}
                label={label}
                season={season}
                className="inline-flex min-w-0"
                nameClassName={cn(typeClass, "gap-1.5")}
              >
                {mark}
              </TeamIdentity>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {mark}
              </span>
            )}
            {position ? (
              <span className="ml-1.5 shrink-0">{position}</span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
