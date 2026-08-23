/**
 * NBA calendar-driven Movement Center presentation labels.
 * Configurable prominence — not hard-coded by month alone.
 * See docs/architecture/movement-center.md § Seasonal modes
 */

export type MovementProminenceMode =
  | "offseason"
  | "early_regular"
  | "pre_deadline"
  | "deadline_week"
  | "post_deadline"
  | "quiet";

export type MovementPresentation = {
  mode: MovementProminenceMode;
  /** Permanent product name */
  productName: "Movement Center";
  /** Seasonal promoted label (Rumor Mill is not the system name) */
  seasonalLabel: string;
  tagline: string;
  navProminence: "featured" | "standard" | "discovery";
};

/** Approximate mode from date — production uses configurable event calendar. */
export function resolveMovementPresentation(now = new Date()): MovementPresentation {
  const month = now.getUTCMonth(); // 0-indexed
  const day = now.getUTCDate();

  // Deadline week (February, illustrative — replace with config table)
  if (month === 1 && day >= 1 && day <= 8) {
    return {
      mode: "deadline_week",
      productName: "Movement Center",
      seasonalLabel: "Rumor Mill — Trade Deadline Mode",
      tagline: "Live market reporting around the deadline",
      navProminence: "featured",
    };
  }

  if (month >= 6 && month <= 9) {
    return {
      mode: "offseason",
      productName: "Movement Center",
      seasonalLabel: "Rumor Mill",
      tagline: "Where the league might move next",
      navProminence: "featured",
    };
  }

  if (month === 0 || (month === 1 && day > 8) || month === 2) {
    return {
      mode: "pre_deadline",
      productName: "Movement Center",
      seasonalLabel: "Rumor Mill",
      tagline: "What might move before the deadline?",
      navProminence: "standard",
    };
  }

  if (month >= 3 && month <= 5) {
    return {
      mode: "post_deadline",
      productName: "Movement Center",
      seasonalLabel: "Movement Center",
      tagline: "Post-deadline landscape",
      navProminence: "discovery",
    };
  }

  return {
    mode: "early_regular",
    productName: "Movement Center",
    seasonalLabel: "Movement Center",
    tagline: "Background movement signals",
    navProminence: "discovery",
  };
}
