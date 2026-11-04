/**
 * Players learn habits along with skills. The original tendency sheet is the
 * player's identity, not a template to rebuild from today's OVR or position.
 *
 * Adjust only for skills that actually changed. Fractional carry lets a series
 * of small improvements matter without granting one full tendency point at
 * every 2K-style progress checkpoint. No RNG, hidden potential, or free OVR.
 */
import type { GmAttributes, GmSheet, GmTendencies } from "@/gm/types";

type Key = keyof GmTendencies;
export type TendencyPeriod = "season" | "summer" | "camp" | "commissioner";
type TendencyUpdate = Pick<GmSheet, "tendencies" | "tendencyCarry">;

const KEYS: readonly Key[] = [
  "shootClose", "shootMid", "shootThree", "drive", "postUp", "dish",
  "flashyPass", "steal", "block", "crashOffensive", "foul",
];

const limit = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * In a true NBA player profile, observed shot habits are stronger evidence
 * than a few simulated training points. Generated players have more freedom
 * to develop new offensive and defensive identities.
 */
export function evolveTendencies(
  before: Pick<GmSheet, "attributes" | "tendencies" | "tendencyCarry">,
  after: GmAttributes,
  period: TendencyPeriod,
  realNbaProfile = false
): TendencyUpdate {
  const d = (key: keyof GmAttributes) => {
    const oldValue = before.attributes[key];
    const newValue = after[key];
    return Number.isFinite(oldValue) && Number.isFinite(newValue) ? newValue - oldValue : 0;
  };
  // A reload or a skipped checkpoint must not turn stored fractional progress
  // into a free change. Carry is consumed only alongside new skill movement.
  if (!(Object.keys(after) as Array<keyof GmAttributes>).some(key => d(key) !== 0)) {
    return { tendencies: before.tendencies, tendencyCarry: before.tendencyCarry };
  }

  const three = d("threePoint"), mid = d("midrange");
  const learning: Record<Key, number> = {
    // A growing outside shot takes a little share from close and midrange
    // habits, but a midrange specialist does not automatically abandon it.
    shootClose: d("closeShot") * 0.56 + d("standingDunk") * 0.08 -
      Math.max(0, three) * 0.10,
    shootMid: mid * 0.65 - Math.max(0, three - mid) * 0.09,
    shootThree: (three * 0.80 + mid * 0.08) *
      limit((after.threePoint - 30) / 45, 0.45, 1.10),
    drive: d("ballHandle") * 0.35 + d("speedWithBall") * 0.30 +
      d("drivingLayup") * 0.22 + d("drivingDunk") * 0.10,
    postUp: d("postControl") * 0.68 + d("strength") * 0.14 +
      d("closeShot") * 0.10,
    dish: d("passAccuracy") * 0.60 + d("ballHandle") * 0.14,
    flashyPass: d("passAccuracy") * 0.16 + d("ballHandle") * 0.22,
    steal: d("steal") * 0.66 + d("perimeterDefense") * 0.10,
    block: d("block") * 0.72 + d("interiorDefense") * 0.10,
    crashOffensive: d("offReb") * 0.66 + d("strength") * 0.10,
    // Better defensive technique reduces foul propensity, not increases it.
    foul: -d("perimeterDefense") * 0.18 - d("interiorDefense") * 0.16 +
      d("steal") * 0.05,
  };
  const maxChange = period === "season" ? 2 : period === "camp" ? 2 :
    period === "commissioner" ? 12 : 6;
  const profileWeight = realNbaProfile ? 0.55 : 1;
  const tendencies = { ...before.tendencies };
  const tendencyCarry: Partial<Record<Key, number>> = { ...before.tendencyCarry };

  for (const key of KEYS) {
    // Some old fixtures and imported player cards have missing tendency keys.
    // Never manufacture new habits from that incomplete information.
    const original = tendencies[key];
    if (!Number.isFinite(original)) continue;
    const raw = learning[key] * profileWeight + (tendencyCarry[key] ?? 0);
    const requested = limit(Math.round(raw), -maxChange, maxChange);
    const next = limit(original + requested, 0, 100);
    const applied = next - original;
    tendencies[key] = next;
    tendencyCarry[key] = applied !== requested ? 0 : limit(
      Math.round((raw - applied) * 10000) / 10000, -0.99, 0.99
    );
    if (tendencyCarry[key] === 0) delete tendencyCarry[key];
  }
  return { tendencies, tendencyCarry };
}
