import Link from "next/link";

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
function PreviewShape() {
  return (
    <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
      <polygon
        points="32,4 56,18 50,42 14,42 8,18"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
      />
      <polygon
        points="32,10 50,20 44,36 20,38 14,20"
        fill="#1d6fd8"
        fillOpacity="0.14"
        stroke="#1d6fd8"
        strokeWidth="2"
      />
      <polygon
        points="32,16 46,22 40,32 22,34 18,22"
        fill="#e0620d"
        fillOpacity="0.1"
        stroke="#e0620d"
        strokeWidth="2"
        strokeDasharray="4 3"
      />
    </svg>
  );
}

function PreviewEdges() {
  return (
    <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
      {[10, 22, 34].map((y, i) => {
        const a = [30, 18, 36][i]!;
        const even = [8, 14, 6][i]!;
        return (
          <g key={y}>
            <rect x="4" y={y} width={a} height="6" rx="3" fill="#1d6fd8" />
            <rect
              x={4 + a}
              y={y}
              width={even}
              height="6"
              fill="currentColor"
              fillOpacity="0.18"
            />
            <rect
              x={4 + a + even}
              y={y}
              width={56 - a - even}
              height="6"
              rx="3"
              fill="#e0620d"
            />
          </g>
        );
      })}
    </svg>
  );
}

function PreviewGaps() {
  return (
    <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
      <line
        x1="32"
        y1="4"
        x2="32"
        y2="44"
        stroke="currentColor"
        strokeOpacity="0.25"
      />
      <rect x="6" y="8" width="24" height="7" rx="2" fill="#1d6fd8" />
      <rect x="34" y="20" width="18" height="7" rx="2" fill="#e0620d" />
      <rect x="18" y="32" width="12" height="7" rx="2" fill="#1d6fd8" />
    </svg>
  );
}

const PREVIEWS = [
  {
    title: "Matchup shape",
    body: "A radar of peer percentiles across scoring, shooting, defense and impact.",
    Art: PreviewShape,
  },
  {
    title: "Metric edges",
    body: "Who is ahead on each metric and in each category, with ties shown as even.",
    Art: PreviewEdges,
  },
  {
    title: "Biggest gaps",
    body: "The metrics where the two players are furthest apart, pointing at the leader.",
    Art: PreviewGaps,
  },
];

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
          {FEATURED.map((m) => (
            <li key={`${m.a.id}-${m.b.id}`}>
              <Link
                href={matchupHref(m)}
                style={buildGameMatchupTheme(m.a.teamKey, m.b.teamKey).cssVars}
                className={cn(
                  "score-card-wash group flex items-center gap-3 rounded-xl border border-white/50 px-4 py-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_1px_2px_rgb(0_0_0/0.05),0_8px_24px_rgb(0_0_0/0.06)] dark:border-white/10 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_8px_24px_rgb(0_0_0/0.3)]",
                  "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                )}
              >
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
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="compare-preview"
        className="sports-card rounded-xl px-4 py-4 sm:px-5"
      >
        <h2
          id="compare-preview"
          className={cn(
            type.micro,
            "font-bold uppercase tracking-[0.12em] text-muted-foreground"
          )}
        >
          What you get
        </h2>
        <ul className="mt-3 grid gap-4 sm:grid-cols-3">
          {PREVIEWS.map(({ title, body, Art }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="frost-surface shrink-0 rounded-lg p-1.5 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]">
                <Art />
              </span>
              <span className="min-w-0">
                <span className={cn(type.bodySm, "block font-bold")}>
                  {title}
                </span>
                <span
                  className={cn(
                    type.caption,
                    "mt-0.5 block text-muted-foreground"
                  )}
                >
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className={cn(type.caption, "mt-4 text-muted-foreground")}>
          Career averages load by default. Pick a season on either side for a
          year-true matchup with league percentiles.
        </p>
      </section>
    </div>
  );
}
