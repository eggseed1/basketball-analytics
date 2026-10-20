/** Test helper mirroring simulate.assignMinutes default path (no paintShifts). */
import type { GmPlayer, GmTeam } from "../src/gm/types";
import {
  clampAndRespread,
  clampRotationDepth,
  maxMinutesForDepth,
  positionalMinuteTargets,
  rotationTarget,
} from "../src/gm/engine/lineup";
import { createRng, clamp } from "../src/gm/engine/rng";

export function assignMinutesViaTargets(
  team: GmTeam,
  lineup: GmPlayer[],
  seed = 1
): number[] {
  const rng = createRng(seed);
  const cap = maxMinutesForDepth(
    team.coaching?.rotationDepth ?? clampRotationDepth(lineup.length)
  );
  const targets = positionalMinuteTargets(lineup, team.starters);
  const raw: Record<string, number> = {};
  for (const player of lineup) {
    const base = targets[player.id] ?? rotationTarget(player);
    raw[player.id] = clamp(base * (0.96 + rng() * 0.08), 0, cap);
  }
  const sum = Object.values(raw).reduce((total, minutes) => total + minutes, 0);
  const scaled =
    sum > 1
      ? Object.fromEntries(
          Object.entries(raw).map(([id, minutes]) => [id, minutes * (240 / sum)])
        )
      : raw;
  const capped = clampAndRespread(scaled, cap);
  return lineup.map((player) => capped[player.id] ?? 0);
}
