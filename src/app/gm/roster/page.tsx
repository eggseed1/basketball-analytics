"use client";

import { useTranslations } from "next-intl";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmRosterBoard } from "@/gm/ui/gm-roster";
import { useGmStore } from "@/gm/state/gm-store";
import { TeamLogo } from "@/components/brand/team-logo";
import { userPlayers, userTeam } from "@/gm/lib/selectors";

export default function GmRosterPage() {
  return (
    <GmShell>
      <RosterBody />
    </GmShell>
  );
}

function RosterBody() {
  const t = useTranslations("GmUi");
  const league = useGmStore((s) => s.league);
  if (!league) return null;
  const team = userTeam(league);
  const count = userPlayers(league).length;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <TeamLogo teamKey={league.userTeamId} size="sm" />
        {team.city} {team.name}
        <span className="text-sm font-semibold text-muted-foreground">
          {t("rosterLabel", { count })}
        </span>
      </h2>
      <GmRosterBoard league={league} />
    </div>
  );
}
