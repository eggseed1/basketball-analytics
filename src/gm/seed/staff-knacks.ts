/**
 * Signature knacks for directors of scouting and player-development staff.
 * One knack per hire. Effects are passives — no extra menus.
 */

import type { GmPlayer, GmPosition } from "@/gm/types";

export type ScoutKnackId =
  | "euro_radar"
  | "paint_prophet"
  | "guard_tape"
  | "wing_translator"
  | "combine_hawk"
  | "medical_hawk"
  | "sleeper_sniffer"
  | "shot_lab_eye"
  | "cross_checker";

export type DevKnackId =
  | "guard_whisperer"
  | "big_whisperer"
  | "wing_forge"
  | "rookie_lab"
  | "vet_whisperer"
  | "shot_kitchen"
  | "two_way_forge"
  | "star_whisperer"
  | "load_gardener";

export type PlayerPipeline = "ncaa" | "international" | "gleague";

export type ScoutKnackDef = {
  id: ScoutKnackId;
  label: string;
  blurb: string;
};

export type DevKnackDef = {
  id: DevKnackId;
  label: string;
  blurb: string;
};

export const SCOUT_KNACKS: Record<ScoutKnackId, ScoutKnackDef> = {
  euro_radar: {
    id: "euro_radar",
    label: "Euro radar",
    blurb: "International tape clears faster and grades land closer.",
  },
  paint_prophet: {
    id: "paint_prophet",
    label: "Paint prophet",
    blurb: "Bigs: defense and upside grades sharpen; autofocus leans center.",
  },
  guard_tape: {
    id: "guard_tape",
    label: "Guard tape",
    blurb: "Guards: creation and feel come into focus first.",
  },
  wing_translator: {
    id: "wing_translator",
    label: "Wing translator",
    blurb: "Wings: shooting and defense reads tighten.",
  },
  combine_hawk: {
    id: "combine_hawk",
    label: "Combine hawk",
    blurb: "Athleticism and combine numbers fill before other fog.",
  },
  medical_hawk: {
    id: "medical_hawk",
    label: "Medical hawk",
    blurb: "Medical notes show up earlier; durability fog clears faster.",
  },
  sleeper_sniffer: {
    id: "sleeper_sniffer",
    label: "Sleeper sniffer",
    blurb: "Late-board foggy kids: upside uncapped more often.",
  },
  shot_lab_eye: {
    id: "shot_lab_eye",
    label: "Shot lab eye",
    blurb: "Shooting grades are sharper across the board.",
  },
  cross_checker: {
    id: "cross_checker",
    label: "Cross-checker",
    blurb: "Small boost everywhere. No specialty spike.",
  },
};

export const DEV_KNACKS: Record<DevKnackId, DevKnackDef> = {
  guard_whisperer: {
    id: "guard_whisperer",
    label: "Guard whisperer",
    blurb: "Guards grow faster when the minutes are there.",
  },
  big_whisperer: {
    id: "big_whisperer",
    label: "Big whisperer",
    blurb: "Bigs climb quicker in the weight room and film room.",
  },
  wing_forge: {
    id: "wing_forge",
    label: "Wing forge",
    blurb: "Wings add tools a little faster.",
  },
  rookie_lab: {
    id: "rookie_lab",
    label: "Rookie lab",
    blurb: "Players 23 and under develop ahead of schedule.",
  },
  vet_whisperer: {
    id: "vet_whisperer",
    label: "Vet whisperer",
    blurb: "Ages 29–34 lose a little less each year.",
  },
  shot_kitchen: {
    id: "shot_kitchen",
    label: "Shot kitchen",
    blurb: "Growth tilts toward shooting tools.",
  },
  two_way_forge: {
    id: "two_way_forge",
    label: "Two-way forge",
    blurb: "Growth tilts toward defense.",
  },
  star_whisperer: {
    id: "star_whisperer",
    label: "Star whisperer",
    blurb: "High-upside and star-trait kids get an extra bump.",
  },
  load_gardener: {
    id: "load_gardener",
    label: "Load gardener",
    blurb: "Mild growth boost for whoever is on the roster.",
  },
};

export function scoutKnackLabel(id: ScoutKnackId | undefined | null): string {
  if (!id) return "—";
  return SCOUT_KNACKS[id]?.label ?? id;
}

export function scoutKnackBlurb(id: ScoutKnackId | undefined | null): string {
  if (!id) return "";
  return SCOUT_KNACKS[id]?.blurb ?? "";
}

export function devKnackLabel(id: DevKnackId | undefined | null): string {
  if (!id) return "—";
  return DEV_KNACKS[id]?.label ?? id;
}

export function devKnackBlurb(id: DevKnackId | undefined | null): string {
  if (!id) return "";
  return DEV_KNACKS[id]?.blurb ?? "";
}

export function defaultKnackForExpertise(
  expertise: string
): ScoutKnackId {
  switch (expertise) {
    case "international":
      return "euro_radar";
    case "bigs":
      return "paint_prophet";
    case "guards":
      return "guard_tape";
    case "wings":
      return "wing_translator";
    case "defense":
      return "medical_hawk";
    case "offense":
      return "shot_lab_eye";
    default:
      return "cross_checker";
  }
}

export function playerPipeline(player: GmPlayer): PlayerPipeline {
  if (player.pipeline) return player.pipeline;
  const college = (player.college ?? "").toLowerCase();
  if (
    /euro|serbia|spain|france|australia|nbl|adriatic|lithuania|germany|turkey|greece|aba |real madrid|barcelona|virtus|olympiacos|fenerbahce|overseas|international/.test(
      college
    )
  ) {
    return "international";
  }
  if (/g.?league|ignite|delaware|delaware blue|motor city|raptors 905/.test(college)) {
    return "gleague";
  }
  return "ncaa";
}

export function scoutKnackMatchBonus(
  knack: ScoutKnackId | undefined | null,
  player: GmPlayer,
  focus:
    | "overall"
    | "offense"
    | "defense"
    | "shooting"
    | "creation"
    | "athleticism"
    | "feel"
): number {
  if (!knack) return 0;
  const pos = player.position;
  const pipe = playerPipeline(player);
  const fog = player.scouted.uncertainty ?? 0.8;
  const board = player.scoutProfile?.boardRankHint ?? 40;

  switch (knack) {
    case "euro_radar":
      return pipe === "international" ? 0.85 : 0.05;
    case "paint_prophet":
      if (pos === "C") return focus === "defense" || focus === "overall" ? 0.8 : 0.45;
      if (pos === "PF") return 0.5;
      return 0;
    case "guard_tape":
      if (pos === "PG" || pos === "SG") {
        return focus === "creation" || focus === "feel" || focus === "overall"
          ? 0.75
          : 0.4;
      }
      return 0;
    case "wing_translator":
      if (pos === "SF" || pos === "SG") {
        return focus === "shooting" || focus === "defense" || focus === "overall"
          ? 0.7
          : 0.35;
      }
      return 0;
    case "combine_hawk":
      return focus === "athleticism" ? 0.7 : 0.12;
    case "medical_hawk":
      return focus === "overall" || focus === "athleticism" ? 0.35 : 0.1;
    case "sleeper_sniffer":
      return fog >= 0.55 && board >= 20 ? 0.55 : 0.08;
    case "shot_lab_eye":
      return focus === "shooting" || focus === "offense" ? 0.55 : 0.1;
    case "cross_checker":
      return 0.18;
    default:
      return 0;
  }
}

/** Prefer filling this blank first when spending a look. */
export function scoutKnackPreferredFocus(
  knack: ScoutKnackId | undefined | null,
  player: GmPlayer
):
  | "athleticism"
  | "shooting"
  | "creation"
  | "defense"
  | "feel"
  | "upside"
  | null {
  if (!knack) return null;
  const pos = player.position;
  switch (knack) {
    case "combine_hawk":
      return "athleticism";
    case "shot_lab_eye":
      return "shooting";
    case "guard_tape":
      return pos === "PG" || pos === "SG" ? "creation" : null;
    case "paint_prophet":
      return pos === "C" || pos === "PF" ? "defense" : null;
    case "wing_translator":
      return pos === "SF" || pos === "SG" ? "shooting" : null;
    case "sleeper_sniffer":
      return "upside";
    case "medical_hawk":
      return "athleticism";
    default:
      return null;
  }
}

export function scoutKnackAutofocusWeight(
  knack: ScoutKnackId | undefined | null,
  player: GmPlayer
): number {
  if (!knack) return 0;
  const pos = player.position;
  const fog = player.scouted.uncertainty ?? 0.8;
  const pipe = playerPipeline(player);
  switch (knack) {
    case "euro_radar":
      return pipe === "international" ? 3.2 : 0;
    case "paint_prophet":
      return pos === "C" ? 2.8 : pos === "PF" ? 1.6 : 0;
    case "guard_tape":
      return pos === "PG" || pos === "SG" ? 2.6 : 0;
    case "wing_translator":
      return pos === "SF" || pos === "SG" ? 2.2 : 0;
    case "sleeper_sniffer":
      return fog >= 0.55 ? 2.0 : 0;
    default:
      return 0.2;
  }
}

/** Growth / decline multiplier from a PD knack. 1 = neutral. */
export function devKnackGrowthMul(
  knack: DevKnackId | undefined | null,
  player: GmPlayer,
  growing: boolean
): number {
  if (!knack) return 1;
  const pos = player.position;
  const trait = player.sheet?.potential?.trait;
  const yearsIn =
    player.draftYear != null ? Math.max(0, (player.age - 19) /* rough */) : 99;

  switch (knack) {
    case "guard_whisperer":
      if (!(pos === "PG" || pos === "SG")) return 1;
      return growing ? 1.16 : 1;
    case "big_whisperer":
      if (!(pos === "PF" || pos === "C")) return 1;
      return growing ? 1.16 : 1;
    case "wing_forge":
      if (!(pos === "SF" || pos === "SG")) return 1;
      return growing ? 1.14 : 1;
    case "rookie_lab":
      if (player.age > 23 && yearsIn > 3) return 1;
      return growing ? 1.18 : 1;
    case "vet_whisperer":
      if (player.age < 29 || player.age > 34) return 1;
      return growing ? 1.04 : 0.88;
    case "shot_kitchen":
    case "two_way_forge":
      return growing ? 1.06 : 1;
    case "star_whisperer": {
      const hot =
        trait === "star" ||
        trait === "superstar" ||
        trait === "xfactor" ||
        (player.ratings.potential ?? 0) >= 7.5;
      return hot && growing ? 1.2 : growing ? 1.02 : 1;
    }
    case "load_gardener":
      return growing ? 1.07 : 0.96;
    default:
      return 1;
  }
}

export function knackMatchesPosition(
  knack: ScoutKnackId | DevKnackId | undefined | null,
  position: GmPosition
): boolean {
  if (!knack) return false;
  if (knack === "guard_tape" || knack === "guard_whisperer") {
    return position === "PG" || position === "SG";
  }
  if (knack === "paint_prophet" || knack === "big_whisperer") {
    return position === "PF" || position === "C";
  }
  if (knack === "wing_translator" || knack === "wing_forge") {
    return position === "SF" || position === "SG";
  }
  return false;
}
