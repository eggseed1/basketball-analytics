import type { RecentInsight } from "@/lib/recent-insights";

type FindingsTranslator = {
  (key: string): string;
  has: (key: string) => boolean;
};

const CATEGORY_MESSAGE_KEYS: Record<string, string> = {
  "above his norm": "category.aboveHisNorm",
  "big night": "category.bigNight",
  scoring: "category.scoring",
  playmaking: "category.playmaking",
  rebounding: "category.rebounding",
  defense: "category.defense",
  efficiency: "category.efficiency",
  offense: "category.offense",
  margin: "category.margin",
  clutch: "category.clutch",
  pace: "category.pace",
  comeback: "category.comeback",
  run: "category.run",
  seesaw: "category.seesaw",
  "late winner": "category.lateWinner",
  "biggest lead": "category.biggestLead",
  takeover: "category.takeover",
  "big quarter": "category.bigQuarter",
  shooting: "category.shooting",
  "last 5": "category.last5",
  streak: "category.streak",
};

/** Pass the `Findings` translator to localize; without it the English tail is returned. */
export function insightCategoryLabel(
  category: string,
  t?: FindingsTranslator
): string {
  const tail = category.split("·")[1]?.trim() ?? category;
  const messageKey = CATEGORY_MESSAGE_KEYS[tail.toLowerCase()];
  if (t && messageKey && t.has(messageKey)) return t(messageKey);
  return tail.charAt(0) + tail.slice(1).toLowerCase();
}

/** Tag ink follows the category, the same color for every team. */
const TAG_INK: Record<string, string> = {
  scoring: "light-dark(#9a3412, #fdba74)",
  playmaking: "light-dark(#1d4ed8, #93c5fd)",
  rebounding: "light-dark(#047857, #6ee7b7)",
  defense: "light-dark(#4338ca, #a5b4fc)",
  efficiency: "light-dark(#0f766e, #5eead4)",
  "big night": "light-dark(#b45309, #fcd34d)",
  "above his norm": "light-dark(#6d28d9, #c4b5fd)",
  takeover: "light-dark(#c2410c, #fdba74)",
  clutch: "light-dark(#be123c, #fda4af)",
  pace: "light-dark(#0369a1, #7dd3fc)",
  comeback: "light-dark(#15803d, #86efac)",
  run: "light-dark(#1d4ed8, #93c5fd)",
  seesaw: "light-dark(#7e22ce, #d8b4fe)",
  "late winner": "light-dark(#a16207, #fde68a)",
  "biggest lead": "light-dark(#334155, #cbd5e1)",
};

export function insightTagColor(category: string): string {
  const tail = (category.split("·")[1]?.trim() ?? category).toLowerCase();
  return TAG_INK[tail] ?? "light-dark(#3f3f46, #d4d4d8)";
}

export function insightCategoryLabelFor(
  insight: RecentInsight,
  t?: FindingsTranslator
): string {
  return insightCategoryLabel(insight.category, t);
}
