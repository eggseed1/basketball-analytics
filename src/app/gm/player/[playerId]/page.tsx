"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { GmPlayerCard } from "@/gm/ui/gm-player-card";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";

export default function GmPlayerPage() {
  const params = useParams<{ playerId: string }>();
  const league = useGmStore((s) => s.league);
  const playerId = decodeURIComponent(params.playerId ?? "");
  const player = league?.players.find((entry) => entry.id === playerId);
  return (
    <GmShell accentTeamId={player?.teamId}>
      <PlayerBody />
    </GmShell>
  );
}

function PlayerBody() {
  const t = useTranslations("GmUi");
  const params = useParams<{ playerId: string }>();
  const league = useGmStore((s) => s.league);
  if (!league) return null;
  const playerId = decodeURIComponent(params.playerId ?? "");
  const player = league.players.find((entry) => entry.id === playerId);
  if (!player) {
    return <p className="text-sm text-muted-foreground">{t("gmPlayerMissing")}</p>;
  }
  return <GmPlayerCard league={league} player={player} />;
}
