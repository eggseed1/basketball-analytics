"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmAwardBoard } from "@/gm/ui/gm-awards";
import { useGmStore } from "@/gm/state/gm-store";

export default function GmAwardsPage() {
  return (
    <GmShell>
      <AwardsBody />
    </GmShell>
  );
}

function AwardsBody() {
  const league = useGmStore((state) => state.league);
  if (!league) return null;
  return <GmAwardBoard league={league} />;
}
