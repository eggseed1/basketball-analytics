import Link from "next/link";

import {
  askDrblTeamHref,
  buildTeamAskLinks,
} from "@/lib/team-explorer";

export { askDrblTeamHref, buildTeamAskLinks };

export function TeamAskLinks({
  teamName,
  season,
  teamId,
  priorSeason,
}: {
  teamName: string;
  season: string;
  /** Canonical ESPN team id for ASK deep links. */
  teamId?: string;
  priorSeason?: string;
}) {
  const links = buildTeamAskLinks(teamName, season, teamId, priorSeason);
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
