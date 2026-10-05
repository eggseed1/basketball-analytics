import { TransitionLink } from "@/components/continuity/query-nav";
import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Arcade",
  description: "Basketball games: Higher or Lower, 0–82, Teammate Chain and the GM Lab.",
};

const GAMES = [
  {
    href: "/arcade/higher-or-lower",
    title: "Higher or Lower",
    blurb: "Spin for a stat, then guess whether the next player's season beats the last one. Build a streak.",
    meta: "VORP · DARKO · points · rebounds · assists",
  },
  {
    href: "/arcade/zero-82",
    title: "0–82",
    blurb: "Spin a team, take one of its players, fill all five positions. Build the worst team you can, or flip it and chase 82–0.",
    meta: "Projected record from Box Plus/Minus",
  },
  {
    href: "/arcade/teammate-chain",
    title: "Teammate Chain",
    blurb: "Connect two stars through the fewest shared teammates.",
    meta: "Every roster from 1996-97 on",
  },
];

export default function ArcadePage() {
  return (
    <main className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <PageHeader
        eyebrow="Arcade"
        title="Games"
        subtitle="Quick basketball games built on 30 seasons of real player stats."
      />

      <section className="flex flex-col gap-3">
        <h2 className={type.heading}>Play</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => (
            <li key={game.href}>
              <ArcadeCard {...game} />
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
            />
          </li>
        </ul>
      </section>
    </main>
  );
}

function ArcadeCard({ href, title, blurb, meta }: { href: string; title: string; blurb: string; meta: string }) {
  return (
    <TransitionLink
      href={href}
      className={cn(
        "sports-card flex h-full flex-col gap-2 px-4 py-3.5",
        "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
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
    </TransitionLink>
  );
}
