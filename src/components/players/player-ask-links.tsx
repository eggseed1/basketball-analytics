import { TransitionLink } from "@/components/continuity/query-nav";

export type AskDrblHrefOptions = {
  playerId?: string;
  teamId?: string;
  /** Canonical season context (Time Machine / shareable). */
  season?: string;
  /** Display-only date context - not applied to season-level ASK. */
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

export type PlayerAskLink = {
  label: string;
  href: string;
  hint: string;
};

/** Supported ASK examples only — peak/career, rank, season board, compare. */
export function buildPlayerAskLinks(
  playerId: string,
  playerName: string,
  season: string,
  peakSeason?: string | null,
  options?: Omit<AskDrblHrefOptions, "playerId">
): PlayerAskLink[] {
  const ctx = { playerId, ...options };
  const links: PlayerAskLink[] = [
    {
      label: `What was ${playerName}'s peak?`,
      href: askDrblHref(
        `What was ${playerName}'s peak production?`,
        ctx
      ),
      hint: "Career resume · peak window",
    },
    {
      label: `Rank ${playerName}'s seasons`,
      href: askDrblHref(`Rank ${playerName}'s seasons`, ctx),
      hint: "Season ranking methodology",
    },
    {
      label: `${season} true shooting`,
      href: askDrblHref(`${playerName} true shooting ${season}`, ctx),
      hint: "Season board · efficiency",
    },
    {
      label: `${season} points per game`,
      href: askDrblHref(`${playerName} ppg ${season}`, ctx),
      hint: "Season board · scoring rate",
    },
  ];

  if (peakSeason && peakSeason !== season) {
    links.push({
      label: `Compare ${season} to ${peakSeason}`,
      href: askDrblHref(
        `Compare ${playerName} ${season} vs ${peakSeason}`,
        ctx
      ),
      hint: "Season compare",
    });
  }

  return links;
}

/**
 * Player-page ASK entry points — prefills supported queries only.
 */
export function PlayerAskLinks({
  playerId,
  playerName,
  season,
  peakSeason,
  fromHistory,
}: {
  playerId: string;
  playerName: string;
  season: string;
  peakSeason?: string | null;
  fromHistory?: boolean;
}) {
  const links = buildPlayerAskLinks(playerId, playerName, season, peakSeason, {
    season,
    fromHistory,
  });

  return (
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <li key={link.href}>
          <TransitionLink
            href={link.href}
            className="group flex flex-col rounded-xl border border-border frost-surface px-3 py-2.5 sm:px-4"
          >
            <span className="text-[14px] font-semibold underline-offset-2 group-hover:underline">
              {link.label} →
            </span>
            <span className="text-[12px] text-muted-foreground">{link.hint}</span>
          </TransitionLink>
        </li>
      ))}
    </ul>
  );
}
