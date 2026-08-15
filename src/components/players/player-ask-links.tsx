import Link from "next/link";

/** Build a shareable ASK DRBL URL with a supported structured-query example. */
export function askDrblHref(query: string, playerId?: string): string {
  const params = new URLSearchParams();
  params.set("q", query);
  if (playerId) params.set("playerId", playerId);
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
  const links = [
    {
      label: `Ask DRBL about ${playerName}`,
      href: askDrblHref(
        `What was ${playerName}'s peak production?`,
        playerId
      ),
      hint: "Career Resume · peak CPI",
    },
    {
      label: `Rank ${playerName}'s seasons`,
      href: askDrblHref(`Rank ${playerName}'s seasons`, playerId),
      hint: "Rank My Seasons methodology",
    },
    {
      label: `${season} true shooting`,
      href: askDrblHref(`${playerName} true shooting ${season}`, playerId),
      hint: "Season board metric",
    },
    {
      label: `${season} points per game`,
      href: askDrblHref(`${playerName} ppg ${season}`, playerId),
      hint: "Counting rate",
    },
  ];

  if (peakSeason && peakSeason !== season) {
    links.push({
      label: `Compare ${season} to ${peakSeason}`,
      href: askDrblHref(
        `Compare ${playerName} ${season} vs ${peakSeason}`,
        playerId
      ),
      hint: "Season compare when supported",
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="group flex flex-col rounded-xl border border-border bg-white/45 px-3 py-2.5 sm:px-4"
          >
            <span className="text-[14px] font-semibold underline-offset-2 group-hover:underline">
              {link.label} →
            </span>
            <span className="text-[12px] text-muted-foreground">{link.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
