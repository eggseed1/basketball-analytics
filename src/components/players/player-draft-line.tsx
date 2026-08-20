import { TeamLogo } from "@/components/brand/team-logo";
import { TeamIdentity } from "@/components/teams/team-identity";
import { type, textLinkClassName } from "@/lib/design-system";
import { parsePlayerDraftInfo } from "@/lib/player-draft";
import { cn } from "@/lib/utils";

/**
 * Draft year / round / pick with the drafting club as a web team mention.
 */
export function PlayerDraftLine({
  draftInfo,
  college,
}: {
  draftInfo?: string | null;
  college?: string | null;
}) {
  const parsed = parsePlayerDraftInfo(draftInfo);
  const collegeLabel = college?.trim() || null;
  if (!parsed && !draftInfo && !collegeLabel) return null;

  return (
    <p
      className={cn(
        type.caption,
        "mt-1 flex flex-wrap items-center justify-center gap-x-1.5 text-muted-foreground"
      )}
    >
      {parsed?.undrafted ? (
        <span>Undrafted</span>
      ) : parsed ? (
        <>
          {parsed.year != null ? <span>{parsed.year}</span> : null}
          {parsed.round != null ? (
            <>
              <span className="text-border" aria-hidden>
                ·
              </span>
              <span>Rd {parsed.round}</span>
            </>
          ) : null}
          {parsed.pick != null ? (
            <>
              <span className="text-border" aria-hidden>
                ·
              </span>
              <span>Pk {parsed.pick}</span>
            </>
          ) : null}
          {parsed.teamKey ? (
            <TeamIdentity
              teamKey={parsed.teamKey}
              label={parsed.teamAbbr}
              season={
                parsed.year != null ? `${parsed.year}-${String((parsed.year + 1) % 100).padStart(2, "0")}` : null
              }
              className="inline-flex min-w-0"
              nameClassName={cn(type.caption, "gap-1")}
            >
              <TeamLogo teamKey={parsed.teamKey} size="2xs" />
              <span className={textLinkClassName}>
                {parsed.teamAbbr ?? parsed.teamKey}
              </span>
            </TeamIdentity>
          ) : null}
        </>
      ) : draftInfo ? (
        <span>{draftInfo}</span>
      ) : null}
      {collegeLabel ? (
        <>
          {parsed || draftInfo ? (
            <span className="text-border" aria-hidden>
              ·
            </span>
          ) : null}
          <span>{collegeLabel}</span>
        </>
      ) : null}
    </p>
  );
}
