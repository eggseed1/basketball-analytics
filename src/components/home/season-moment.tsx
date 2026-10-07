import { TeamLogo } from "@/components/brand/team-logo";
import { AppLink } from "@/components/ui/app-link";
import { type } from "@/lib/design-system";
import type { HomeSeasonMoment, OpenerGame, SeasonChampion } from "@/lib/home-season-moment";
import { cn } from "@/lib/utils";

const OPENER_GAMES_SHOWN = 6;

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function inDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className={cn(type.micro, "font-semibold uppercase tracking-[0.12em] text-muted-foreground")}>
      {children}
    </p>
  );
}

function MomentLinks({ links }: { links: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {links.map(([href, label]) => (
        <AppLink
          key={href}
          href={href}
          className={cn(type.caption, "font-semibold underline-offset-4 hover:underline")}
        >
          {label} <span data-motion-arrow aria-hidden>→</span>
        </AppLink>
      ))}
    </div>
  );
}

function OpenerGames({ games }: { games: OpenerGame[] }) {
  if (!games.length) return null;
  const shown = games.slice(0, OPENER_GAMES_SHOWN);
  return (
    <ul className="flex flex-wrap gap-2">
      {shown.map((g) => (
        <li key={g.id}>
          <AppLink
            href={`/games/${g.id}`}
            data-motion="chip"
            className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-2.5 py-1.5 transition hover:bg-muted/60"
          >
            <TeamLogo teamKey={g.awayAbbr} size="xs" />
            <span className={cn(type.caption, "font-semibold")}>{g.awayAbbr}</span>
            <span className={cn(type.micro, "text-muted-foreground")}>at</span>
            <TeamLogo teamKey={g.homeAbbr} size="xs" />
            <span className={cn(type.caption, "font-semibold")}>{g.homeAbbr}</span>
          </AppLink>
        </li>
      ))}
      {games.length > shown.length ? (
        <li className={cn(type.caption, "self-center text-muted-foreground")}>
          +{games.length - shown.length} more
        </li>
      ) : null}
    </ul>
  );
}

function ChampionLine({ champion }: { champion: SeasonChampion }) {
  return (
    <p className={cn(type.bodySm, "flex items-center gap-2 text-muted-foreground")}>
      <TeamLogo teamKey={champion.abbr || champion.teamId} size="xs" />
      <span>
        {champion.season} champions: {champion.name}, {champion.result} over the {champion.runnerUpName} in the Finals.
      </span>
    </p>
  );
}

/** Lead card for the stretches with no regular-season games. */
export function SeasonMomentCard({ moment }: { moment: HomeSeasonMoment }) {
  const { phase, marks, champion, daysToOpener, daysToPreseason } = moment;
  const season = marks.season;

  if (phase === "draft-free-agency") {
    return (
      <section aria-label="Offseason" className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <Eyebrow>Offseason · Draft and free agency</Eyebrow>
        {champion ? (
          <div className="flex items-center gap-3">
            <TeamLogo teamKey={champion.abbr || champion.teamId} size="md" />
            <div className="min-w-0">
              <h2 className={cn(type.title2, "font-bold tracking-tight")}>
                The {champion.name} won the {champion.season} title
              </h2>
              <p className={cn(type.bodySm, "text-muted-foreground")}>
                Beat the {champion.runnerUpName} {champion.result} in the Finals.
              </p>
            </div>
          </div>
        ) : (
          <h2 className={cn(type.title2, "font-bold tracking-tight")}>Draft and free agency</h2>
        )}
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Signings, trades and draft moves land in the transactions feed below as teams announce them.
        </p>
        {champion ? (
          <MomentLinks
            links={[[`/explore/bracket?season=${champion.season}`, `${champion.season} playoff bracket`]]}
          />
        ) : null}
      </section>
    );
  }

  if (phase === "offseason") {
    return (
      <section aria-label="Offseason" className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <Eyebrow>Offseason</Eyebrow>
        {marks.opener && daysToOpener != null ? (
          <>
            <h2 className={cn(type.title2, "font-bold tracking-tight")}>
              The {season} season tips off {inDays(daysToOpener)}
            </h2>
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              Opening night is {longDate(marks.opener)}.
              {marks.preseasonStart && daysToPreseason != null && daysToPreseason > 0
                ? ` Preseason starts ${longDate(marks.preseasonStart)}.`
                : ""}
            </p>
            <OpenerGames games={marks.openerGames} />
          </>
        ) : (
          <h2 className={cn(type.title2, "font-bold tracking-tight")}>
            The {season} schedule isn&apos;t out yet
          </h2>
        )}
        {champion ? <ChampionLine champion={champion} /> : null}
      </section>
    );
  }

  if (phase === "preseason") {
    return (
      <section
        aria-label={`${season} preseason`}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-[3px] border-[var(--ring)] py-1 pl-3.5"
      >
        <span className={cn(type.title, "font-bold tracking-tight")}>
          {marks.opener && daysToOpener != null
            ? `Season starts ${inDays(daysToOpener)}`
            : "Preseason is underway"}
        </span>
        {marks.opener && daysToOpener != null ? (
          <span className={cn(type.bodySm, "text-muted-foreground")}>
            {longDate(marks.opener)}
          </span>
        ) : null}
        <span className={cn(type.caption, "text-muted-foreground")}>
          Preseason games don&apos;t count toward records or stats.
        </span>
      </section>
    );
  }

  return null;
}

/** One-line status for in-season phases. */
export function SeasonPhaseBar({ moment }: { moment: HomeSeasonMoment }) {
  const { phase, marks, regularDaysLeft, regularWeek } = moment;
  const season = marks.season;
  let label: string | null = null;
  let note: string | null = null;

  if (phase === "opening-weeks") {
    label = `${season} regular season · Week ${regularWeek}`;
    note = "Early records and stats swing a lot on small samples.";
  } else if (phase === "regular-season") {
    label = `${season} regular season · Week ${regularWeek}`;
    if (regularDaysLeft != null) note = `${regularDaysLeft} days left in the regular season.`;
  } else if (phase === "stretch-run") {
    label = "Playoff race";
    note =
      regularDaysLeft != null
        ? `${regularDaysLeft} day${regularDaysLeft === 1 ? "" : "s"} left in the regular season. Seeds 7 to 10 go to the play-in.`
        : "Seeds 7 to 10 go to the play-in.";
  } else if (phase === "play-in") {
    label = "Play-in tournament";
    note = "Seeds 7 to 10 play for the last two playoff spots in each conference.";
  } else if (phase === "playoffs") {
    label = `${season} playoffs`;
    if (marks.playoffStart) note = `First round began ${longDate(marks.playoffStart)}.`;
  }

  if (!label) return null;
  return (
    <p className={cn(type.caption, "flex flex-wrap items-baseline gap-x-3 gap-y-0.5")}>
      <span className="font-bold uppercase tracking-[0.1em]">{label}</span>
      {note ? <span className="text-muted-foreground">{note}</span> : null}
    </p>
  );
}
