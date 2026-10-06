import type { Metadata } from "next";
import Link from "next/link";

import {
  AcquisitionEntryList,
  AnswerNote,
  AnswerSentence,
  OutgoingOrigins,
  RosterArrivals,
  StoryDeal,
  WhereItLed,
  acquisitionHref,
  formatPlainDate,
} from "@/components/acquisitions/acquisition-story";
import { AcquisitionTree } from "@/components/acquisitions/acquisition-tree";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  getAcquisitionStory,
  getTeamRosterArrivals,
  teamNicknames,
} from "@/data/queries/acquisition-paths";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

function resolveTeamId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const names = teamNicknames();
  if (names[value]) return value;
  const brand = resolveTeamBrand(value)?.espnTeamId;
  if (brand && names[brand]) return brand;
  const lower = value.toLowerCase();
  return Object.entries(names).find(([, name]) => name.toLowerCase() === lower)?.[0];
}

const EXAMPLES: Array<{ team: string; player: string; label: string }> = [
  { team: "13", player: "Luka Doncic", label: "Luka Dončić to the Lakers" },
  { team: "14", player: "Giannis Antetokounmpo", label: "Giannis Antetokounmpo to the Heat" },
  { team: "10", player: "James Harden", label: "James Harden to the Rockets" },
  { team: "2", player: "Kevin Garnett", label: "Kevin Garnett to the Celtics" },
];

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const teamId = resolveTeamId(one(sp, "team"));
  const player = one(sp, "player");
  if (teamId && player) {
    const { story } = await getAcquisitionStory({ teamId, player, since: one(sp, "since") });
    if (story) return { title: `How the ${teamNicknames()[teamId]} got ${story.player.label}` };
  }
  return {
    title: "How they got him",
    description: "How each NBA team acquired its players, and where the trades led, from the transaction log.",
  };
}

function Picker({
  teamId,
  player,
  names,
  datalist,
}: {
  teamId?: string;
  player?: string;
  names: Record<string, string>;
  datalist: string[];
}) {
  const teams = Object.entries(names).sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <form action="/acquisitions" className="flex flex-wrap items-end gap-2">
      <label className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        Team
        <select
          name="team"
          defaultValue={teamId ?? ""}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="" disabled>
            Pick a team
          </option>
          {teams.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={cn(type.caption, "flex min-w-48 flex-1 flex-col gap-1 text-muted-foreground")}>
        Player
        <input
          name="player"
          defaultValue={player ?? ""}
          list="acquisition-players"
          placeholder="Any player who joined this team"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        />
        <datalist id="acquisition-players">
          {datalist.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <button type="submit" className="h-9 rounded-md bg-foreground px-3 text-sm font-semibold text-background">
        Show
      </button>
    </form>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h2 className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>{title}</h2>
      {children}
    </section>
  );
}

export default async function AcquisitionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const names = teamNicknames();
  const teamId = resolveTeamId(one(sp, "team"));
  const player = one(sp, "player");
  const since = one(sp, "since");

  const rosterArrivals = teamId ? await getTeamRosterArrivals(teamId) : null;
  const catalog = rosterArrivals?.catalog ?? [];
  const payload = teamId && player ? await getAcquisitionStory({ teamId, player, since }) : null;
  const story = payload?.story ?? null;
  const ledgerThrough = payload?.ledgerThrough ?? null;
  const datalist = [...new Set(catalog.map((e) => e.label))].sort();

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <header className="flex flex-col gap-3">
        <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
          Transactions · How they got him
        </p>
        {story ? (
          <div className="flex items-center gap-3">
            {story.player.playerId ? (
              <PlayerHeadshot
                playerId={story.player.playerId}
                name={story.player.label}
                teamKey={story.teamId}
                size="lg"
                priority
              />
            ) : null}
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">
                <AnswerSentence story={story} names={names} />
              </h1>
              <AnswerNote story={story} names={names} />
            </div>
          </div>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {teamId ? `How the ${names[teamId]} built their roster` : "How did they get him?"}
          </h1>
        )}
        <Picker teamId={teamId} player={story?.player.label ?? player} names={names} datalist={datalist} />
      </header>

      {!teamId ? (
        <>
          <Section title="Start with a trade">
            <ul className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <li key={ex.label}>
                  <Link
                    href={acquisitionHref(ex.team, { label: ex.player })}
                    className="flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-sm font-semibold hover:border-foreground/30"
                  >
                    <TeamLogo teamKey={ex.team} size="xs" />
                    {ex.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Or pick a team">
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(names)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, name]) => (
                  <li key={id}>
                    <Link
                      href={`/acquisitions?team=${id}`}
                      className="flex items-center gap-2 rounded-md border border-border/60 frost-surface-muted px-2.5 py-1.5 text-sm font-semibold hover:border-foreground/30"
                    >
                      <TeamLogo teamKey={id} size="xs" />
                      {name}
                    </Link>
                  </li>
                ))}
            </ul>
          </Section>
        </>
      ) : null}

      {teamId && player && !story ? (
        <p className={cn(type.bodySm, "rounded-md border border-border/70 px-3 py-2 text-muted-foreground")}>
          The transaction log has no arrival for <span className="font-semibold text-foreground">{player}</span> with the{" "}
          {names[teamId]}. It covers 2000 onward, so earlier moves aren&apos;t here.
        </p>
      ) : null}

      {story ? (
        <>
          {story.stints.length > 1 ? (
            <nav aria-label="Stints" className="flex flex-wrap items-center gap-1.5">
              <span className={cn(type.caption, "text-muted-foreground")}>
                {story.player.label} joined the {names[story.teamId]} {story.stints.length} times:
              </span>
              {story.stints.map((s) => {
                const active = "date" in story.arrival && story.arrival.date === s.start;
                return (
                  <Link
                    key={s.start}
                    href={acquisitionHref(story.teamId, story.player, s.start)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      type.caption,
                      "rounded-full border px-2.5 py-0.5 tabular-nums",
                      active ? "border-foreground bg-foreground text-background" : "border-border/70 hover:border-foreground/30"
                    )}
                  >
                    {s.start.slice(0, 4)}
                    {s.end ? `–${s.end.slice(0, 4)}` : "–now"}
                  </Link>
                );
              })}
            </nav>
          ) : null}

          {story.arrival.how === "trade" ? (
            <Section title={`The trade · ${formatPlainDate(story.arrival.date)}`}>
              <StoryDeal deal={story.arrival.deal} names={names} />
            </Section>
          ) : null}

          <Section title={story.origins.length ? "The trail, both ways" : "Where it led"}>
            <AcquisitionTree story={story} names={names} />
            <p className={cn(type.caption, "text-muted-foreground")}>
              {story.origins.length
                ? "Left of the move: what the team gave up and how it got those pieces. Right: where he went next and what came back. Scroll sideways on long trails."
                : "Each card is what he or a returning piece turned into. Scroll sideways on long trails."}
            </p>
          </Section>

          <details className="group rounded-md border border-border/60 px-3 py-2">
            <summary className={cn(type.bodySm, "cursor-pointer font-semibold")}>Read it as text</summary>
            <div className="flex flex-col gap-4 pt-3">
              <Section title="Where it led">
                <WhereItLed story={story} names={names} />
              </Section>
              {story.origins.length ? (
                <Section title="Where the outgoing pieces came from">
                  <OutgoingOrigins story={story} names={names} />
                </Section>
              ) : null}
            </div>
          </details>

          {story.truncated ? (
            <p className={cn(type.caption, "text-muted-foreground")}>
              This trail runs long, so it stops after a few steps. Open any player above to keep following it.
            </p>
          ) : null}
        </>
      ) : null}

      {teamId && !story && rosterArrivals && (rosterArrivals.onRoster.length || rosterArrivals.notLogged.length) ? (
        <Section title="On the roster now">
          <RosterArrivals teamId={teamId} onRoster={rosterArrivals.onRoster} notLogged={rosterArrivals.notLogged} />
        </Section>
      ) : null}

      {teamId && !story && catalog.length ? (
        <details className="rounded-md border border-border/60 px-3 py-2">
          <summary className={cn(type.bodySm, "cursor-pointer font-semibold")}>
            Every {names[teamId]} arrival in the log ({catalog.length})
          </summary>
          <div className="pt-3">
            <AcquisitionEntryList teamId={teamId} entries={catalog} />
          </div>
        </details>
      ) : null}

      {teamId ? (
        <footer className={cn(type.caption, "flex flex-col gap-1 border-t border-border/50 pt-3 text-muted-foreground")}>
          <p>
            Built from the NBA transaction log
            {ledgerThrough ? `, 2000 through ${formatPlainDate(ledgerThrough)}` : " from 2000 on"}. Each step uses only
            what the log says. When it skips a step, we leave that step blank. Draft slots come from NBA draft history and player bios.
          </p>
        </footer>
      ) : null}
    </main>
  );
}
