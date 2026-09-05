/**
 * Deploy-baked draft year map for explore board draftClass filters on Cloudflare.
 * Keys: NBA PERSON_ID, ESPN athlete id, and espn:{id}.
 */
import snapshot from "./draft-year-snapshot.json";

type DraftYearFile = {
  version?: number;
  generatedAt?: string;
  count?: number;
  years?: Record<string, number>;
};

const data = snapshot as DraftYearFile;
const yearsRecord =
  data?.years && typeof data.years === "object" ? data.years : {};

let cachedMap: Map<string, number> | null = null;

export function getBundledDraftYearMap(): Map<string, number> {
  if (cachedMap) return cachedMap;
  const map = new Map<string, number>();
  for (const [id, year] of Object.entries(yearsRecord)) {
    const y = Number(year);
    if (!id || !Number.isFinite(y) || y < 1947) continue;
    map.set(String(id), y);
  }
  cachedMap = map;
  return map;
}

export function getBundledDraftYear(
  ...ids: Array<string | null | undefined>
): number | undefined {
  const map = getBundledDraftYearMap();
  for (const id of ids) {
    const key = String(id ?? "").trim();
    if (!key) continue;
    const hit = map.get(key) ?? map.get(`espn:${key}`);
    if (hit != null) return hit;
  }
  return undefined;
}

export function bundledDraftYearMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    count: data.count ?? Object.keys(yearsRecord).length,
  };
}
