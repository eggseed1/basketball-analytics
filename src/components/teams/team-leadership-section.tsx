import type { ReactNode } from "react";

import {
  getTeamLeadership,
  teamLeadershipRetrievedAt,
  type LeadershipPerson,
} from "@/data/runtime/team-leadership";
import { surfaceTileClassName, textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function PersonName({ person }: { person: { name: string; wiki?: string } }) {
  if (!person.wiki) return <>{person.name}</>;
  return (
    <a href={person.wiki} target="_blank" rel="noopener noreferrer" className={textLinkClassName}>
      {person.name}
    </a>
  );
}

function Role({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div
      data-motion-item
      className={cn(surfaceTileClassName, "flex min-w-0 flex-col gap-1 px-3 py-2.5", wide && "col-span-2 lg:col-span-1")}
    >
      <dt className={cn(type.caption, "text-muted-foreground")}>{label}</dt>
      <dd className={cn(type.bodySm, "flex flex-col gap-1")}>{children}</dd>
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
  teamName,
  season,
  currentSeason,
}: {
  teamId: string;
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
        <div className="sports-card flex flex-col gap-4 p-4 sm:p-5">
          <dl data-motion-stack className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Role label={org.owners.length > 1 ? "Owners" : "Owner"} wide>
              <People people={org.owners} />
            </Role>
            {org.ceo.length ? (
              <Role label="CEO">
                <People people={org.ceo} />
              </Role>
            ) : null}
            <Role label="President">
              <People people={org.president} />
            </Role>
            <Role label="General manager">
              <People people={org.generalManager} />
            </Role>
            <Role label="Head coach">
              {org.headCoach ? (
                <span className="font-semibold">
                  <PersonName person={org.headCoach} />
                </span>
              ) : (
                <span className="text-muted-foreground">Not listed</span>
              )}
            </Role>
            <Role label="Arena">
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
            <Role label="G League affiliate">
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
