"use client";

import { TeamLogo } from "@/components/brand/team-logo";
import { teamColorStyle } from "@/gm/ui/team-colors";

/** Logo and abbreviation in that club's colors. Mixed lists keep one mark per team. */
export function ClubMark({
  teamId,
  label,
}: {
  teamId?: string | null;
  label: string;
}) {
  if (!teamId) return <span>{label}</span>;
  return (
    <span className="gm-club-mark" style={teamColorStyle(teamId)}>
      <TeamLogo teamKey={teamId} size="xs" />
      {label}
    </span>
  );
}
