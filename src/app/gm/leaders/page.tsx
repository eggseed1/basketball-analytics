"use client";

import { Suspense } from "react";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmAwardBoard } from "@/gm/ui/gm-awards";
import { GmPlayersTable } from "@/gm/ui/gm-players";
import { useGmStore } from "@/gm/state/gm-store";

export default function GmLeadersPage() {
  return (
    <GmShell>
      <Leaders />
    </GmShell>
  );
}

function Leaders() {
  const league = useGmStore((state) => state.league);
  return (
    <div className="flex flex-col gap-6">
      {league ? <GmAwardBoard league={league} /> : null}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading leaders…</p>}>
        <GmPlayersTable mode="leaders" />
      </Suspense>
    </div>
  );
}
