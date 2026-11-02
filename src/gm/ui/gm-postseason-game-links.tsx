"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";

export function GmPostseasonGameLinks({ boxId, match, seriesId, label }: {
  boxId?: string;
  match?: { homeId: string; awayId: string };
  seriesId?: string;
  label: string;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const simPlayInNight = useGmStore(state => state.simPlayInNight);
  const simPlayoffDay = useGmStore(state => state.simPlayoffDay);
  if (boxId) {
    const href = `/gm/game/${encodeURIComponent(boxId)}`;
    return <span className="gm-postseason-links">
      <Link href={href} aria-label={`Box score: ${label}`}>Box score</Link>
      <Link href={`${href}?watch=1`} aria-label={`Watch: ${label}`}>Watch</Link>
    </span>;
  }
  if (!match && !seriesId) return <span className="text-xs text-muted-foreground">Stats unavailable in this older save.</span>;
  return <div className="gm-postseason-links">
    <Button variant="outline" disabled={opening} aria-label={`Watch: ${label}`} onClick={() => {
      if (busy.current) return;
      busy.current = true;
      setOpening(true);
      setError(null);
      try {
        const id = match ? simPlayInNight(match) : simPlayoffDay(seriesId);
        if (!id) throw new Error("This matchup is no longer available. Check the updated bracket.");
        router.push(`/gm/game/${encodeURIComponent(id)}?watch=1`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to open this game. Review your healthy rotation and try again.");
        busy.current = false;
        setOpening(false);
      }
    }}>{opening ? "Opening game..." : "Watch game"}</Button>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>;
}
