import { TransitionLink } from "@/components/continuity/query-nav";

export type AskDrblHrefOptions = {
  playerId?: string;
  teamId?: string;
  /** Canonical season context (Time Machine / shareable). */
  season?: string;
  /** Display-only date context — not applied to season-level ASK. */
  date?: string;
  /** Marks context as originating from Time Machine. */
  fromHistory?: boolean;
};

/** Build a shareable ASK DRBL URL with optional historical context. */
export function askDrblHref(
  query: string,
  playerIdOrOptions?: string | AskDrblHrefOptions
): string {
  const opts: AskDrblHrefOptions =
    typeof playerIdOrOptions === "string"
      ? { playerId: playerIdOrOptions }
      : playerIdOrOptions ?? {};

  const params = new URLSearchParams();
  params.set("q", query);
  if (opts.playerId) params.set("playerId", opts.playerId);
  if (opts.teamId) params.set("teamId", opts.teamId);
  if (opts.season) params.set("season", opts.season);
  if (opts.date) params.set("date", opts.date);
  if (opts.fromHistory) params.set("from", "history");
  return `/ask?${params.toString()}`;
}

/**
 * Lightweight ASK entry points — prefills only; no custom NLP on the player page.
 */
export function PlayerAskLinks({
  playerId,
  playerName,
  season,
  peakSeason,
}: {
  playerId: string;
  playerName: string;
  season: string;
  peakSeason?: string | null;
}) {
  const ctx = { playerId, season };
  const links = [
    {
      label: `Ask DRBL about ${playerName}`,
      href: askDrblHref(
        `What was ${playerName}'s peak production?`,
        ctx
      ),
      hint: "Career Resume · peak CPI",
    },
    {
      label: `Rank ${playerName}'s seasons`,
      href: askDrblHref(`Rank ${playerName}'s seasons`, ctx),
      hint: "Rank My Seasons methodology",
    },
    {
      label: `${season} true shooting`,
      href: askDrblHref(`${playerName} true shooting ${season}`, ctx),
      hint: "Season board metric",
    },
    {
      label: `${season} points per game`,
      href: askDrblHref(`${playerName} ppg ${season}`, ctx),
      hint: "Counting rate",
    },
  ];

  if (peakSeason && peakSeason !== season) {
    links.push({
      label: `Compare ${season} to ${peakSeason}`,
      href: askDrblHref(
        `Compare ${playerName} ${season} vs ${peakSeason}`,
        ctx
      ),
      hint: "Season compare when supported",
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {links.map((l) => (
        <li key={l.href}>
          <TransitionLink
            href={l.href}
            className="text-[13px] font-semibold underline-offset-4 hover:underline"
          >
            {l.label}
          </TransitionLink>
          {l.hint ? (
            <span className="ml-2 text-[11px] text-muted-foreground">
              {l.hint}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
