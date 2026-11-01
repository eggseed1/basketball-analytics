import { ADVISOR, ASSETS, makeAgent, mix, newFinance } from "./finance";
import { earningsOf, MAX_BOARD, placeOnBoard, rankByEarnings } from "./leaderboard";
import { hashString, streamSeed } from "./rng";
import type { CareerSummary } from "./report";
import { SCHEMA_VERSION, type AdvisorStyle, type LegacyBias, type LifeState } from "./types";
import { WORLD_VERSION } from "./world";

export const SAVE_KEY = "drbl.oneShot.save";
export const CAREERS_KEY = "drbl.oneShot.careers";
export const BOARD_KEY = "drbl.oneShot.earnings";
export const PREFS_KEY = "drbl.oneShot.prefs";
export const LEGACY_KEY = "drbl.oneShot.legacy";
export const MAX_CAREERS = 15;

/**
 * Daily life: the seed comes from the UTC calendar date and the world
 * snapshot version, so everyone gets the same birth on the same UTC day. The
 * day rolls over at 00:00 UTC.
 */
export function dailyDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dailySeed(date: string): number {
  return hashString(`one-shot:daily:${date}:${WORLD_VERSION}`);
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0]!;
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** schemaVersion N -> N+1. Add an entry when the state shape changes. */
const MIGRATIONS: Record<number, Migration> = {
  1: (d) => {
    const seed = typeof d.seed === "number" ? d.seed : 0;
    const rng = { ...(d.rng as Record<string, unknown>) };
    rng.finance ??= streamSeed(seed, "finance");
    rng.intl ??= streamSeed(seed, "intl");
    const flags = { ...((d.flags as Record<string, unknown>) ?? {}) };
    const family = (d.family as { means?: number }) ?? {};
    const finance = newFinance(family.means ?? 3);
    if (flags.agent) finance.agent = makeAgent("Your agent", "a regional agency", 0.05, "regional", typeof d.ageMonths === "number" ? d.ageMonths : 0);
    delete flags.agent;
    return {
      ...d,
      schemaVersion: 2,
      rng,
      flags,
      gameLog: d.lastGame ? [d.lastGame] : [],
      finance,
      international: { countryId: null, caps: 0, tournaments: [], declined: 0 },
    };
  },
  2: (d) => {
    const seed = typeof d.seed === "number" ? d.seed : 0;
    const rng = { ...(d.rng as Record<string, unknown>) };
    rng.after ??= streamSeed(seed, "after");
    const old = (d.finance as Record<string, unknown>) ?? {};
    const fresh = newFinance(3);
    const advisor = (old.advisor as AdvisorStyle | null) ?? null;
    const target = advisor ? { ...ADVISOR[advisor].target } : fresh.target;
    const amount = typeof old.invested === "number" ? old.invested : 0;
    const holdings = mix({});
    for (const k of ASSETS) holdings[k] = (amount * target[k]) / 100;
    const { invested: _drop, ...rest } = old;
    void _drop;
    return {
      ...d,
      schemaVersion: 3,
      rng,
      after: null,
      finance: { ...fresh, ...rest, holdings, target, autoInvest: advisor !== null, market: fresh.market },
    };
  },
  3: (d) => {
    const counters = { ...((d.counters as { entry: number; decision: number; offer: number }) ?? { entry: 0, decision: 0, offer: 0 }) };
    const seen = new Set<string>();
    const history = ((d.history as { id: string }[]) ?? []).map((h) => {
      if (!seen.has(h.id)) {
        seen.add(h.id);
        return h;
      }
      const id = `h${++counters.entry}`;
      seen.add(id);
      return { ...h, id };
    });
    return {
      ...d,
      schemaVersion: 4,
      counters,
      history,
      draft: { stock: 0, combine: null, interviews: [], workouts: null, promise: null, board: null, ...((d.draft as Record<string, unknown>) ?? {}) },
    };
  },
  4: (d) => {
    const seed = typeof d.seed === "number" ? d.seed : 0;
    const rng = { ...(d.rng as Record<string, unknown>) };
    rng.nba ??= streamSeed(seed, "nba");
    return { ...d, schemaVersion: 5, rng };
  },
  5: (d) => {
    const peers = ((d.peers as { rival?: boolean; potential?: number }[]) ?? []).map((p) => ({ ...p }));
    if (peers.length && !peers.some((p) => p.rival)) {
      let best = 0;
      for (let i = 1; i < peers.length; i++) if ((peers[i]!.potential ?? 0) > (peers[best]!.potential ?? 0)) best = i;
      peers[best]!.rival = true;
    }
    return { ...d, schemaVersion: 6, challenge: (d.challenge as string | null | undefined) ?? null, peers };
  },
  6: (d) => {
    const finance = { ...((d.finance as Record<string, unknown>) ?? {}) };
    const holdings = (finance.holdings as Record<string, number> | undefined) ?? {};
    const basis: Record<string, number> = {};
    for (const k of ASSETS) basis[k] = typeof holdings[k] === "number" ? holdings[k]! : 0;
    const market = { ...((finance.market as Record<string, unknown>) ?? {}) };
    market.regime ??= "neutral";
    market.regimeMonths ??= 0;
    market.headline ??= "Markets open quietly.";
    const ytd = { ...((finance.ytd as Record<string, unknown>) ?? {}) };
    ytd.dividends ??= 0;
    const years = ((finance.years as Record<string, unknown>[]) ?? []).map((y) => ({ ...y, dividends: typeof y.dividends === "number" ? y.dividends : 0 }));
    return {
      ...d,
      schemaVersion: 7,
      finance: { ...finance, basis, reserveMonths: typeof finance.reserveMonths === "number" ? finance.reserveMonths : 6, market, ytd, years },
    };
  },
};

export type LoadResult = { ok: true; state: LifeState } | { ok: false; reason: string; raw: string | null };

export function parseSave(raw: string | null): LoadResult {
  if (!raw) return { ok: false, reason: "empty", raw };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "The save file is not valid JSON.", raw };
  }
  let v = typeof data.schemaVersion === "number" ? data.schemaVersion : 0;
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) return { ok: false, reason: `No migration from save version ${v}.`, raw };
    data = m(data);
    v = typeof data.schemaVersion === "number" ? data.schemaVersion : v + 1;
  }
  if (v > SCHEMA_VERSION) return { ok: false, reason: `This save comes from a newer version (${v}).`, raw };
  repairHistoryIds(data);
  const problem = validate(data);
  if (problem) return { ok: false, reason: problem, raw };
  return { ok: true, state: data as unknown as LifeState };
}

/**
 * An automatic event used to take the same history id as the injury it logged.
 * The later row keeps that id, because the injury points at it. The earlier row gets a new one.
 */
function repairHistoryIds(data: Record<string, unknown>) {
  const history = data.history;
  if (!Array.isArray(history)) return;
  const counters = (data.counters && typeof data.counters === "object" ? data.counters : null) as { entry?: number } | null;
  let entry = typeof counters?.entry === "number" ? counters.entry : 0;
  const indexById = new Map<string, number>();
  for (let i = 0; i < history.length; i++) {
    const row = history[i];
    if (!row || typeof row !== "object") continue;
    const item = row as { id?: string };
    const id = typeof item.id === "string" ? item.id : "";
    const n = /^h(\d+)$/.exec(id);
    if (n) entry = Math.max(entry, Number(n[1]));
    const earlier = id ? indexById.get(id) : undefined;
    if (id && earlier == null) {
      indexById.set(id, i);
      continue;
    }
    const fresh = `h${++entry}`;
    if (earlier != null) {
      const prior = history[earlier] as { id?: string };
      prior.id = fresh;
      indexById.set(fresh, earlier);
    }
    if (id) indexById.set(id, i);
    else {
      item.id = fresh;
      indexById.set(fresh, i);
    }
  }
  if (counters) counters.entry = Math.max(entry, counters.entry ?? 0);
}

function validate(d: Record<string, unknown>): string | null {
  const need = ["seed", "ageMonths", "identity", "birthplace", "residence", "family", "body", "growth", "skills", "potentials", "traits", "condition", "plan", "placement", "rng", "peers", "history", "achievements", "draft", "counters", "clock", "education", "finance", "international", "gameLog"];
  for (const k of need) if (!(k in d)) return `The save is missing "${k}".`;
  if (typeof d.ageMonths !== "number" || d.ageMonths < 0 || d.ageMonths > 800) return "The save has an impossible age.";
  const rng = d.rng as Record<string, unknown>;
  if (!rng || typeof rng.events !== "number" || !Array.isArray(rng.peers)) return "The save's random streams are damaged.";
  return null;
}

export function serialize(s: LifeState): string {
  return JSON.stringify(s);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadSave(): LoadResult {
  const st = storage();
  return parseSave(st?.getItem(SAVE_KEY) ?? null);
}

export function writeSave(s: LifeState): boolean {
  try {
    storage()?.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  storage()?.removeItem(SAVE_KEY);
}

export function loadCareers(): CareerSummary[] {
  try {
    const raw = storage()?.getItem(CAREERS_KEY);
    const list = raw ? (JSON.parse(raw) as CareerSummary[]) : [];
    return Array.isArray(list) ? list.slice(0, MAX_CAREERS) : [];
  } catch {
    return [];
  }
}

export function addCareer(c: CareerSummary): CareerSummary[] {
  const list = [c, ...loadCareers().filter((x) => x.runId !== c.runId)].slice(0, MAX_CAREERS);
  try {
    storage()?.setItem(CAREERS_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked; the list still shows for this session */
  }
  return list;
}

function isBoardRow(x: unknown): x is CareerSummary {
  if (!x || typeof x !== "object") return false;
  const c = x as CareerSummary;
  return typeof c.runId === "string" && typeof c.name === "string" && typeof c.finishedAt === "string" && earningsOf(c) !== null;
}

/** Top lives on this device by career earnings before tax. */
export function loadBoard(): CareerSummary[] {
  try {
    const raw = storage()?.getItem(BOARD_KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? rankByEarnings(list.filter(isBoardRow)).slice(0, MAX_BOARD) : [];
  } catch {
    return [];
  }
}

/** Write three initials onto a life already stored on this device, and onto the earnings board when that life is on it. */
export function stampCareer(id: { runId?: string | null; boardId?: string | null }, tag: string): { careers: CareerSummary[]; board: CareerSummary[]; summary: CareerSummary | null } {
  const match = (c: CareerSummary) => (id.runId != null && c.runId === id.runId) || (id.boardId != null && c.boardId === id.boardId);
  const careers = loadCareers().map((c) => (match(c) ? { ...c, tag } : c));
  const board = loadBoard().map((c) => (match(c) ? { ...c, tag } : c));
  const summary = careers.find(match) ?? board.find(match) ?? null;
  try {
    storage()?.setItem(CAREERS_KEY, JSON.stringify(careers));
    storage()?.setItem(BOARD_KEY, JSON.stringify(board));
  } catch {
    /* storage full or blocked; the stamp still shows for this session */
  }
  return { careers, board, summary };
}

export function recordEarnings(c: CareerSummary): CareerSummary[] {
  const list = placeOnBoard(loadBoard(), c);
  try {
    storage()?.setItem(BOARD_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked; the board still shows for this session */
  }
  return list;
}

export interface Prefs {
  units: "metric" | "imperial";
  reducedMotion: boolean | null;
}

export function loadPrefs(): Prefs {
  try {
    const raw = storage()?.getItem(PREFS_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return { units: p.units === "metric" ? "metric" : "imperial", reducedMotion: typeof p.reducedMotion === "boolean" ? p.reducedMotion : null };
  } catch {
    return { units: "imperial", reducedMotion: null };
  }
}

export function savePrefs(p: Prefs) {
  try {
    storage()?.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Soft family/height nudge for the next random birth. Daily lives ignore this. */
export function loadLegacy(): LegacyBias | null {
  try {
    const raw = storage()?.getItem(LEGACY_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as LegacyBias;
    if (!b || typeof b !== "object") return null;
    return {
      meansBoost: b.meansBoost === true,
      heightCm: typeof b.heightCm === "number" && b.heightCm > 150 && b.heightCm < 230 ? b.heightCm : undefined,
      name: typeof b.name === "string" ? b.name : undefined,
    };
  } catch {
    return null;
  }
}

export function saveLegacy(bias: LegacyBias | null) {
  try {
    if (!bias) storage()?.removeItem(LEGACY_KEY);
    else storage()?.setItem(LEGACY_KEY, JSON.stringify(bias));
  } catch {
    /* ignore */
  }
}

/** Build a legacy hint from a finished life. NBA or comfortable means tilt the next birth. */
export function legacyFromLife(s: LifeState): LegacyBias {
  return {
    meansBoost: s.family.means >= 4 || s.achievements.nbaDebut !== null || s.earnings >= 500_000,
    heightCm: Math.round(s.body.heightCm),
    name: s.identity.displayName,
  };
}
