/**
 * Deterministic detection of player on/off questions. Pure: no data access.
 */

export type AskOnOffView = "clean" | "all" | "clutch";
export type AskOnOffPhase = "regular" | "playoffs";

export type OnOffIntent = {
  view: AskOnOffView;
  phase: AskOnOffPhase;
  /** Question text with the on/off vocabulary removed, for player and clause detection. */
  residual: string;
};

const ON_OFF_RE =
  /\bon[\s/-]?off\b|\bon[\s/-]court\s+(vs\.?|versus|and)\s+off[\s/-]court\b|\b(with|without)\s+.+?\s+(on|off)\s+the\s+(floor|court)\b|\b(on|off)\s+the\s+(floor|court)\b/i;

const STRIP: RegExp[] = [
  /\bon[\s/-]?off\b/gi,
  /\bon[\s/-]court\b|\boff[\s/-]court\b/gi,
  /\b(on|off)\s+the\s+(floor|court)\b/gi,
  /\bclutch\b/gi,
  /\bplayoffs?\b|\bpostseason\b/gi,
  /\ball\s+possessions?\b|\bgarbage\s+time\b|\bfiltered\b|\bper\s+100(\s+possessions?)?\b/gi,
  /\b(net\s+rating|swing|impact|numbers?|splits?|split|stats?|differential)\b/gi,
];

export function matchOnOffQuery(text: string): OnOffIntent | null {
  if (!ON_OFF_RE.test(text)) return null;
  const view: AskOnOffView = /\bclutch\b/i.test(text)
    ? "clutch"
    : /\b(all\s+possessions?|including\s+garbage\s+time|with\s+garbage\s+time)\b/i.test(text)
      ? "all"
      : "clean";
  const phase: AskOnOffPhase = /\b(playoffs?|postseason)\b/i.test(text) ? "playoffs" : "regular";
  let residual = text;
  for (const re of STRIP) residual = residual.replace(re, " ");
  residual = residual.replace(/\s+/g, " ").trim();
  return { view, phase, residual };
}

export function onOffViewLabel(view: AskOnOffView): string {
  return view === "clutch" ? "Clutch" : view === "all" ? "All possessions" : "Filtered (no garbage time)";
}
