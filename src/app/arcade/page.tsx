import { MotionReveal } from "@/components/continuity/motion-reveal";
import type { CSSProperties, ReactNode } from "react";

import {
  GmLabArt,
  HigherLowerArt,
  OneShotArt,
  TeammateChainArt,
  Zero82Art,
} from "@/components/arcade/arcade-card-art";
import { TransitionLink } from "@/components/continuity/query-nav";
import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Arcade",
  description: "Basketball games: Higher or Lower, 0–82, Teammate Chain, ONE SHOT and the GM Lab.",
};

const GAMES = [
  {
    href: "/arcade/higher-or-lower",
    title: "Higher or Lower",
    blurb: "Spin for a stat, then guess whether the next player's season beats the last one. Build a streak.",
    meta: "VORP · DARKO · points · rebounds · assists",
    art: <HigherLowerArt />,
    tints: ["#ff9f0a", "#0a84ff"],
  },
  {
    href: "/arcade/zero-82",
    title: "0–82",
    blurb: "Spin a team, take one of its players, fill all five positions. Build the worst team you can, or flip it and chase 82–0.",
    meta: "Projected record from Box Plus/Minus",
    art: <Zero82Art />,
    tints: ["#d9a066", "#ff375f"],
  },
  {
    href: "/arcade/teammate-chain",
    title: "Teammate Chain",
    blurb: "Connect two stars through the fewest shared teammates.",
    meta: "Every roster from 1996-97 on",
    art: <TeammateChainArt />,
    tints: ["#0a84ff", "#bf5af2"],
  },
  {
    href: "/arcade/one-shot",
    title: "ONE SHOT",
    blurb: "Be born anywhere in the world and try to reach the NBA. Grow up, pick your focus, take or turn down offers, make one regular-season game.",
    meta: "Life sim · every country · fictional players",
    art: <OneShotArt />,
    tints: ["#48b9ab", "#df668c"],
  },
];

export default function ArcadePage() {
  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        eyebrow="Arcade"
        title="Games"
        subtitle="Basketball games, most of them built on 30 seasons of real player stats."
      />

      <section className="flex flex-col gap-3">
        <h2 className={type.heading}>Play</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game, i) => (
            <li key={game.href}>
              <ArcadeCard {...game} index={i} />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className={type.heading}>GM Lab</h2>
          <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
            Run a franchise through a simulated season. Still a work in progress.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <ArcadeCard
              href="/gm"
              title="Franchise Lab"
              blurb="Set the roster, make trades, manage the cap and play out the schedule."
              meta="Unfinished"
              art={<GmLabArt />}
              tints={["#30d158", "#64d2ff"]}
              index={GAMES.length}
            />
          </li>
        </ul>
      </section>
    </main>
  );
}

function ArcadeCard({
  href,
  title,
  blurb,
  meta,
  art,
  tints,
  index,
}: {
  href: string;
  title: string;
  blurb: string;
  meta: string;
  art: ReactNode;
  tints: string[];
  index: number;
}) {
  return (
    <TransitionLink
      href={href}
      data-motion-tile
      style={{ "--i": index } as CSSProperties}
      className={cn(
        "group sports-card flex h-full flex-col overflow-hidden",
        "transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgb(0_0_0/0.45)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="relative isolate flex h-36 items-center justify-center overflow-hidden border-b border-border/60 bg-foreground/[0.02]">
        <span
          aria-hidden
          className="strip-orb -z-10"
          style={{ left: "8%", top: -20, "--orb-color": tints[0], "--orb-strength": 1.6 } as CSSProperties}
        />
        <span
          aria-hidden
          className="strip-orb strip-orb--b -z-10"
          style={{ right: "8%", bottom: -30, "--orb-color": tints[1], "--orb-strength": 1.6 } as CSSProperties}
        />
        <span className="transition-transform duration-300 group-hover:scale-105">{art}</span>
      </span>
      <span className="flex flex-1 flex-col gap-2 px-4 py-3.5">
        <span className={cn(type.body, "font-semibold")}>{title}</span>
        <span className={cn(type.caption, "text-muted-foreground")}>{blurb}</span>
        <span
          className={cn(
            type.micro,
            "mt-auto border-t border-border/70 pt-2.5 font-bold uppercase tracking-[0.1em] text-muted-foreground"
          )}
        >
          {meta}
        </span>
      </span>
    </TransitionLink>
  );
}
