"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmHomeStage } from "@/gm/ui/gm-home-stage";
import { useGmStore } from "@/gm/state/gm-store";

export default function GmHomePage() {
  return (
    <GmShell>
      <CommandCenter />
    </GmShell>
  );
}

function CommandCenter() {
  const league = useGmStore((s) => s.league);
  if (!league) return null;
  return <GmHomeStage league={league} />;
}
