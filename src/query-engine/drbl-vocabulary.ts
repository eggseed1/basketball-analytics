/**
 * ASK DRBL metric vocabulary + claim safety (P17.1).
 * Canonical vs diagnostic labels; never invent model equivalences.
 */

export type DrblVocabTier = "canonical" | "diagnostic";

export type DrblVocabEntry = {
  id:
    | "drbl100"
    | "r1_points"
    | "r1_win_eq"
    | "drbl_o"
    | "drbl_d"
    | "drbl_p"
    | "drbl_ln"
    | "drbl_b";
  label: string;
  tier: DrblVocabTier;
  /** Safe one-liner for methodology / glossary answers. */
  glossary: string;
  synonyms: string[];
};

/** Public ASK vocabulary — diagnostic components are labeled, not fused. */
export const DRBL_VOCABULARY: DrblVocabEntry[] = [
  {
    id: "drbl100",
    label: "DRBL/100",
    tier: "canonical",
    glossary:
      "DRBL/100 estimates impact per 100 possessions — the primary ability-rate ranking number.",
    synonyms: [
      "drbl/100",
      "drbl 100",
      "drbl100",
      "validated drbl",
      "ability rate",
      "drbl ability",
      "drbl",
    ],
  },
  {
    id: "r1_points",
    label: "R1 Points",
    tier: "diagnostic",
    glossary:
      "R1 Points are advanced accounting behind Wins Above R1 (same ranking). Prefer Wins Above R1 on public boards.",
    synonyms: ["r1 points", "r1 pts", "r1 point"],
  },
  {
    id: "r1_win_eq",
    label: "Wins Above R1",
    tier: "canonical",
    glossary:
      "Wins Above R1 is how much season value the player accumulated, in win-equivalent units. Not traditional WAR.",
    synonyms: [
      "wins above r1",
      "war1",
      "r1 win equivalents",
      "r1 win eq",
      "r1 wineq",
      "win equivalents",
      "r1 wins",
      "r1 winequivalents",
    ],
  },
  {
    id: "drbl_o",
    label: "Offense",
    tier: "canonical",
    glossary:
      "Offense (DRBL-O) is DRBL’s offensive split. It is not a substitute for overall DRBL/100.",
    synonyms: ["drbl-o", "drbl o", "drblo", "drbl offense", "offense"],
  },
  {
    id: "drbl_d",
    label: "Defense",
    tier: "canonical",
    glossary:
      "Defense (DRBL-D) is DRBL’s defensive split. It is not a substitute for overall DRBL/100.",
    synonyms: ["drbl-d", "drbl d", "drbld", "drbl defense", "defense"],
  },
  {
    id: "drbl_p",
    label: "DRBL-P",
    tier: "diagnostic",
    glossary:
      "DRBL-P is a diagnostic possession-attribution component. It is not additive with LN and B into DRBL/100. Learn: /learn/drbl-p",
    synonyms: ["drbl-p", "drbl p", "drblp"],
  },
  {
    id: "drbl_ln",
    label: "DRBL-LN",
    tier: "diagnostic",
    glossary:
      "Some value shows up in lineup results even when box scores miss it. DRBL-LN is that lineup diagnostic — not proven off-ball value, and not additive with P and B into DRBL/100. Learn: /learn/drbl-ln",
    synonyms: ["drbl-ln", "drbl ln", "drblln"],
  },
  {
    id: "drbl_b",
    label: "DRBL-B",
    tier: "diagnostic",
    glossary:
      "DRBL-B is a box/behavior diagnostic — not optical tracking. It is not additive with P and LN into DRBL/100. Learn: /learn/drbl-b",
    synonyms: ["drbl-b", "drbl b", "drblb"],
  },
];

/** Phrases ASK must never affirm as product truth. */
export const FORBIDDEN_DRBL_CLAIMS = [
  "LN+P+B=DRBL",
  "LN + P + B = DRBL",
  "P+LN+B equals DRBL",
  "R1 is replacement",
  "R1=replacement",
  "WinEq is WAR",
  "Win Equivalents are WAR",
  "R1 Win Equivalents = WAR",
  "UIR is off-ball",
  "UIR=off-ball",
  "DRBL beats DARKO",
  "DRBL is better than DARKO",
] as const;

export const NON_ADDITIVE_COMPONENT_WARNING =
  "DRBL-P, DRBL-LN, and DRBL-B are diagnostic disclosures — they do not sum to DRBL/100.";

export function glossaryForMetricId(id: string): string | null {
  return DRBL_VOCABULARY.find((v) => v.id === id)?.glossary ?? null;
}

export function isForbiddenDrblClaimText(text: string): boolean {
  const hay = text.toLowerCase().replace(/\s+/g, " ");
  return FORBIDDEN_DRBL_CLAIMS.some((claim) =>
    hay.includes(claim.toLowerCase().replace(/\s+/g, " "))
  );
}

/** Detect methodology / “what is …” questions for DRBL vocabulary. */
export function matchDrblGlossaryQuery(raw: string): DrblVocabEntry | null {
  const lower = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const looksLikeDef =
    /^(what\s+is|what's|whats|define|explain|how\s+(is|does|do)\b|tell\s+me\s+about)\b/.test(
      lower
    ) || /\b(mean|means|definition|methodology)\b/.test(lower);
  if (!looksLikeDef) return null;

  let best: DrblVocabEntry | null = null;
  let bestScore = 0;
  for (const entry of DRBL_VOCABULARY) {
    for (const syn of entry.synonyms) {
      if (lower.includes(syn.toLowerCase())) {
        const score = syn.length;
        if (score > bestScore) {
          best = entry;
          bestScore = score;
        }
      }
    }
  }
  return best;
}
