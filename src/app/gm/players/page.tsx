"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmPlayersTable } from "@/gm/ui/gm-players";

export default function GmPlayersPage() {
  return (
    <GmShell>
      <PlayersBody />
    </GmShell>
  );
}

function PlayersBody() {
  const t = useTranslations("GmUi");
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">{t("playersLoading")}</p>}>
      <GmPlayersTable />
    </Suspense>
  );
}
