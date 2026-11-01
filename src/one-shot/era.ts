/**
 * Soft decade flavor so a season in 2041 does not feel identical to 2055.
 * Modifiers stay small: box scores and exposure tilt, they do not rewrite careers.
 */

export type EraId = "pace-space" | "intl-wave" | "load-manage" | "big-ball";

export interface Era {
  id: EraId;
  label: string;
  /** One line for birthday / first-pro notes. */
  line: string;
  /** Added to three-point share of FGA. */
  threeShare: number;
  /** Multiplier on national-team exposure gains. */
  intlExposure: number;
  /** Pace nudge for senior games (points scale). */
  pace: number;
  /** Extra energy drain on high workload months. */
  loadTax: number;
}

const ERAS: Era[] = [
  {
    id: "pace-space",
    label: "Pace and space",
    line: "The league wants spacing. Threes are up; paint traffic is thinner.",
    threeShare: 0.04,
    intlExposure: 1,
    pace: 2,
    loadTax: 0,
  },
  {
    id: "intl-wave",
    label: "International wave",
    line: "Federations and Euro clubs pull more eyes. Caps and overseas film matter more.",
    threeShare: 0.01,
    intlExposure: 1.22,
    pace: 0,
    loadTax: 0,
  },
  {
    id: "load-manage",
    label: "Load management",
    line: "Staffs sit stars and watch minutes. High workloads cost more.",
    threeShare: 0.02,
    intlExposure: 1.05,
    pace: -1,
    loadTax: 1.4,
  },
  {
    id: "big-ball",
    label: "Big-ball stretch",
    line: "Size and post play are back in the tape. Wings still shoot, but the paint is crowded.",
    threeShare: -0.035,
    intlExposure: 0.95,
    pace: -2,
    loadTax: 0.3,
  },
];

/** 12-year blocks cycling from 2020 so lives spanning decades see more than one feel. */
export function eraAt(year: number): Era {
  const phase = ((year - 2020) % 48 + 48) % 48;
  return ERAS[Math.floor(phase / 12)]!;
}

export function eraLabel(year: number): string {
  return eraAt(year).label;
}
