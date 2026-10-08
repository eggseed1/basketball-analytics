import type { CSSProperties, ReactNode } from "react";

import {
  getTeamLeadership,
  teamLeadershipRetrievedAt,
  type LeadershipPerson,
} from "@/data/runtime/team-leadership";
import { vizAccentStyle } from "@/components/teams/viz/viz-kit";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function PersonName({ person }: { person: { name: string; wiki?: string } }) {
  if (!person.wiki) return <>{person.name}</>;
  return (
    <a href={person.wiki} target="_blank" rel="noopener noreferrer" className={textLinkClassName}>
      {person.name}
    </a>
  );
}

function Role({
  label,
  index,
  wide,
  children,
}: {
  label: string;
  index: number;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-motion-item
      style={{ "--i": index } as CSSProperties}
      className={cn("min-w-0", wide && "col-span-2 lg:col-span-1")}
    >
      <div data-org-tile className="relative flex h-full flex-col gap-1 overflow-hidden rounded-[11px] py-2.5 pl-4 pr-3">
        <span
          aria-hidden
          data-org-rail
          data-motion-bar="y"
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ "--i": index } as CSSProperties}
        />
        <dt data-org-label className={type.caption}>
          {label}
        </dt>
        <dd className={cn(type.bodySm, "flex flex-col gap-1")}>{children}</dd>
      </div>
    </div>
  );
}

function People({ people }: { people: LeadershipPerson[] }) {
  if (!people.length) return <span className="text-muted-foreground">Not listed</span>;
  return (
    <ul className="flex flex-col gap-1">
      {people.map((p) => (
        <li key={p.name}>
          <span className="font-semibold">
            <PersonName person={p} />
          </span>
          {p.note ? <span className="text-muted-foreground"> ({p.note})</span> : null}
        </li>
      ))}
    </ul>
  );
}

function formatRetrieved(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Owners, executives, head coach, arena and G League affiliate for the franchise today. */
export function TeamLeadershipSection({
  teamId,
  teamKey,
  teamName,
  season,
  currentSeason,
}: {
  teamId: string;
  teamKey: string;
  teamName: string;
  season: string;
  currentSeason: string;
}) {
  const org = getTeamLeadership(teamId);
  const retrievedAt = org?.checkedAt ?? teamLeadershipRetrievedAt();

  return (
    <section id="leadership" className="scroll-mt-16 flex flex-col gap-3" aria-label="Leadership">
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Organization</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Who owns, runs and coaches the {teamName}.
          {season !== currentSeason ? ` These are today's names, not the ${season} staff.` : null}
        </p>
      </div>
      {org ? (
        <div data-viz style={vizAccentStyle(teamKey)} className="sports-card flex flex-col gap-4 p-4 sm:p-5">
          <dl data-motion-stack className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Role index={0} label={org.owners.length > 1 ? "Owners" : "Owner"} wide>
              <People people={org.owners} />
            </Role>
            {org.ceo.length ? (
              <Role index={1} label="CEO">
                <People people={org.ceo} />
              </Role>
            ) : null}
            <Role index={2} label="President">
              <People people={org.president} />
            </Role>
            <Role index={3} label="General manager">
              <People people={org.generalManager} />
            </Role>
            <Role index={4} label="Head coach">
              {org.headCoach ? (
                <span className="font-semibold">
                  <PersonName person={org.headCoach} />
                </span>
              ) : (
                <span className="text-muted-foreground">Not listed</span>
              )}
            </Role>
            <Role index={5} label="Arena">
              {org.arena ? (
                <>
                  <span className="font-semibold">
                    <PersonName person={org.arena} />
                  </span>
                  {org.arena.location ? (
                    <span className={cn(type.caption, "text-muted-foreground")}>{org.arena.location}</span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">Not listed</span>
              )}
            </Role>
            <Role index={6} label="G League affiliate">
              {org.affiliate ? (
                <span className="font-semibold">
                  <PersonName person={org.affiliate} />
                </span>
              ) : (
                <span className="text-muted-foreground">None listed</span>
              )}
            </Role>
          </dl>
          <p className={cn(type.caption, "text-muted-foreground")}>
            From the team&apos;s Wikipedia infobox
            {retrievedAt ? `, checked ${formatRetrieved(retrievedAt)}` : null}. Teams split titles
            differently: one person can hold two roles, and some teams list no president or GM.
            {org.sources.wikipedia ? (
              <>
                {" "}
                <a
                  href={org.sources.wikipedia}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  Source
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No leadership listing for this franchise yet.
        </p>
      )}
    </section>
  );
}
