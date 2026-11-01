"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { GmPlayerCard } from "@/gm/ui/gm-player-card";
import { GmShell } from "@/gm/ui/gm-shell";
import { GmProspectFile } from "@/gm/ui/gm-prospect-file";
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
  if (league.draftPool.includes(player.id)) {
    return <div className="flex flex-col gap-4"><header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Prospect report</h2><Link href="/gm/draft" className="text-sm font-medium underline underline-offset-4">Back to draft board</Link></header><GmProspectFile league={league} player={player}/></div>;
  }
  return <GmPlayerCard league={league} player={player} />;
}

