/**
 * Deploy-baked player vitals for Cloudflare (height, weight, DOB/age, draft, college).
 */
import snapshot from "./player-bio-snapshot.json";
import type { Player } from "@/data/types";

type CompactBio = {
  fn?: string;
  p?: string;
  bd?: string;
  bp?: string;
  h?: number;
  w?: number;
  c?: string;
  d?: string;
  j?: string;
};

type BioSnapshotFile = {
  version?: number;
  generatedAt?: string;
  playerCount?: number;
  players?: Record<string, CompactBio>;
};

const data = snapshot as BioSnapshotFile;
const players =
  data?.players && typeof data.players === "object" ? data.players : {};

function expand(compact: CompactBio | null | undefined): Player | null {
  if (!compact) return null;
  const id = "bundled";
  return {
    id,
    fullName: compact.fn ?? id,
    firstName: compact.fn?.split(" ")[0] ?? compact.fn ?? id,
    lastName: compact.fn?.split(" ").slice(1).join(" ") ?? "",
    position: compact.p as Player["position"],
    birthDate: compact.bd,
    birthPlace: compact.bp,
    heightInches: compact.h,
    weightLbs: compact.w,
    college: compact.c,
    draftInfo: compact.d,
    jersey: compact.j,
  };
}

function lookup(id: string | null | undefined): Player | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return expand(players[key]);
}

export function getBundledPlayerBio(
  playerId: string,
  relatedIds: Array<string | null | undefined> = []
): Player | null {
  const candidates = [
    playerId,
    ...relatedIds,
  ]
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    const hit = lookup(id);
    if (hit) {
      return { ...hit, id: playerId };
    }
  }
  return null;
}

export function bundledPlayerBioMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    playerCount: data.playerCount ?? Object.keys(players).length,
  };
}
