"use client";

import { Suspense } from "react";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmPlayersTable } from "@/gm/ui/gm-players";

export default function GmPlayersPage() {
  return (
    <GmShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading players…</p>}>
        <GmPlayersTable mode="all" />
      </Suspense>
    </GmShell>
  );
}
