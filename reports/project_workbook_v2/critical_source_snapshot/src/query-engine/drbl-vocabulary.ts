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
      "DRBL/100 is the validated ability rate (impact per 100 combined possession appearances versus the role-matched R1 reference). It is the canonical ranking statistic — not DARKO, WAR, or a box-score composite.",
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
    tier: "canonical",
    glossary:
      "R1 Points are realized attributed point residuals above the R1 reference over the player’s actual season exposure — accounting value, not latent ability.",
    synonyms: ["r1 points", "r1 pts", "r1 point"],
  },
  {
    id: "r1_win_eq",
    label: "R1 Win Equivalents",
    tier: "canonical",
    glossary:
      "R1 Win Equivalents convert R1 Points with a frozen points-per-win factor. They are not WAR and not a claim about roster replacement causality.",
    synonyms: [
      "r1 win equivalents",
      "r1 win eq",
      "r1 wineq",
      "win equivalents",
      "r1 wins",
    ],
  },
  {
    id: "drbl_o",
    label: "DRBL-O",
    tier: "canonical",
    glossary:
      "DRBL-O is the offensive split of validated DRBL ability. It is not a substitute for DRBL/100 overall.",
    synonyms: ["drbl-o", "drbl o", "drblo", "drbl offense"],
  },
  {
    id: "drbl_d",
    label: "DRBL-D",
    tier: "canonical",
    glossary:
      "DRBL-D is the defensive split of validated DRBL ability. It is not a substitute for DRBL/100 overall.",
    synonyms: ["drbl-d", "drbl d", "drbld", "drbl defense"],
  },
  {
    id: "drbl_p",
    label: "DRBL-P",
    tier: "diagnostic",
    glossary:
      "DRBL-P is a diagnostic possession-attribution component. It is not additive with LN and B into DRBL/100.",
    synonyms: ["drbl-p", "drbl p", "drblp"],
  },
  {
    id: "drbl_ln",
    label: "DRBL-LN",
    tier: "diagnostic",
    glossary:
      "DRBL-LN is a diagnostic lineup-context component. It is not additive with P and B into DRBL/100.",
    synonyms: ["drbl-ln", "drbl ln", "drblln"],
  },
  {
    id: "drbl_b",
    label: "DRBL-B",
    tier: "diagnostic",
    glossary:
      "DRBL-B is a diagnostic behavior/shot-decision component. It is not additive with P and LN into DRBL/100.",
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
