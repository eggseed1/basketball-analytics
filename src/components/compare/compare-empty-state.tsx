import Link from "next/link";
import type { CSSProperties } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { getPlayerPortraitUrl } from "@/data/media/get-player-media";
import { CAREER_COMPARE_KEY } from "@/lib/career-average-row";
import { type } from "@/lib/design-system";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import { cn } from "@/lib/utils";

/** `teamKey` only tints the card wash; stats come from the compare route. */
type Side = { id: string; name: string; teamKey: string };

type FeaturedMatchup = {
  a: Side;
  b: Side;
  /** Canonical season, or career averages when omitted. */
  season?: string;
};

const FEATURED: FeaturedMatchup[] = [
  {
    a: { id: "3112335", name: "Nikola Jokic", teamKey: "DEN" },
    b: { id: "3945274", name: "Luka Doncic", teamKey: "LAL" },
    season: "2025-26",
  },
  {
    a: { id: "4278073", name: "Shai Gilgeous-Alexander", teamKey: "OKC" },
    b: { id: "5104157", name: "Victor Wembanyama", teamKey: "SAS" },
    season: "2025-26",
  },
  {
    a: { id: "4594268", name: "Anthony Edwards", teamKey: "MIN" },
    b: { id: "4432166", name: "Cade Cunningham", teamKey: "DET" },
    season: "2025-26",
  },
  {
    a: { id: "1035", name: "Michael Jordan", teamKey: "CHI" },
    b: { id: "1966", name: "LeBron James", teamKey: "CLE" },
  },
  {
    a: { id: "215", name: "Tim Duncan", teamKey: "SAS" },
    b: { id: "261", name: "Kevin Garnett", teamKey: "MIN" },
  },
  {
    a: { id: "3975", name: "Stephen Curry", teamKey: "GSW" },
    b: { id: "110", name: "Kobe Bryant", teamKey: "LAL" },
  },
];

function matchupHref(m: FeaturedMatchup): string {
  const sp = new URLSearchParams({
    a: m.a.id,
    an: m.a.name,
    b: m.b.id,
    bn: m.b.name,
  });
  const basis = m.season ?? CAREER_COMPARE_KEY;
  sp.set("seasonA", basis);
  sp.set("seasonB", basis);
  if (m.season) sp.set("season", m.season);
  return `/compare?${sp.toString()}`;
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

/** Decorative sketches of the three main visuals. Not data. */
export function CompareEmptyState() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="featured-matchups">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2
            id="featured-matchups"
            className={cn(type.bodySm, "font-bold tracking-tight")}
          >
            Try a matchup
          </h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            Or search any two players above
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED.map((m) => {
            const theme = buildGameMatchupTheme(m.a.teamKey, m.b.teamKey);
            return (
            <li key={`${m.a.id}-${m.b.id}`}>
              <Link
                href={matchupHref(m)}
                className={cn(
                  "group relative isolate flex items-center gap-3 overflow-hidden rounded-[var(--card-radius)] bg-card px-4 py-3 ring-1 ring-inset ring-foreground/[0.06] shadow-[0_1px_2px_rgb(0_0_0/0.03),0_6px_20px_rgb(0_0_0/0.04)] dark:shadow-[0_8px_24px_rgb(0_0_0/0.3)]",
                  "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                )}
              >
                <span
                  aria-hidden
                  className="strip-orb -z-10"
                  style={{ left: -56, top: -10, "--orb-color": theme.awayWash } as CSSProperties}
                />
                <span
                  aria-hidden
                  className="strip-orb strip-orb--b -z-10"
                  style={{ right: -56, bottom: -24, "--orb-color": theme.homeWash } as CSSProperties}
                />
                <PlayerHeadshot
                  playerId={m.a.id}
                  portraitUrl={getPlayerPortraitUrl(m.a.id)}
                  name={m.a.name}
                  size="md"
                  className="ring-2 ring-white/80 dark:ring-white/20"
                />
                <div className="min-w-0 flex-1 text-center">
                  <p
                    className={cn(
                      type.bodySm,
                      "font-bold leading-tight tracking-tight"
                    )}
                  >
                    <span className="block truncate">{lastName(m.a.name)}</span>
                    <span
                      className={cn(
                        type.micro,
                        "block font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                      )}
                    >
                      vs
                    </span>
                    <span className="block truncate">{lastName(m.b.name)}</span>
                  </p>
                  <p
                    className={cn(
                      type.caption,
                      "mt-1 truncate text-muted-foreground"
                    )}
                  >
                    {m.season ? `${m.season} season` : "Career averages"}
                  </p>
                </div>
                <PlayerHeadshot
                  playerId={m.b.id}
                  portraitUrl={getPlayerPortraitUrl(m.b.id)}
                  name={m.b.name}
                  size="md"
                  className="ring-2 ring-white/80 dark:ring-white/20"
                />
              </Link>
            </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
