/**
 * Deploy-baked owners, executives, head coach, arena and G League affiliate.
 * Written by scripts/build-team-leadership.ts from team Wikipedia infoboxes.
 */
import snapshot from "./team-leadership.json";

export type LeadershipPerson = { name: string; note?: string; wiki?: string };

export type TeamLeadership = {
  teamId: string;
  abbr: string;
  displayName: string;
  owners: LeadershipPerson[];
  ceo: LeadershipPerson[];
  president: LeadershipPerson[];
  generalManager: LeadershipPerson[];
  headCoach: { name: string; espnExperienceYears: number | null; wiki?: string } | null;
  affiliate: LeadershipPerson | null;
  arena: { name: string; location: string | null; wiki?: string } | null;
  sources: { wikipedia: string | null; espn: string };
};

type LeadershipFile = { retrievedAt?: string; teams?: TeamLeadership[] };

const data = snapshot as LeadershipFile;

export function teamLeadershipRetrievedAt(): string | null {
  return data.retrievedAt ?? null;
}

export function getTeamLeadership(teamId: string): TeamLeadership | null {
  return data.teams?.find((t) => t.teamId === teamId) ?? null;
}
