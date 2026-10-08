import { hashString } from "./rng";
import type { CareerSummary } from "./report";
import { SCHEMA_VERSION, type LifeState } from "./types";
import { WORLD_VERSION } from "./world";

export const SAVE_KEY = "drbl.oneShot.save";
export const CAREERS_KEY = "drbl.oneShot.careers";
export const PREFS_KEY = "drbl.oneShot.prefs";
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
const MIGRATIONS: Record<number, Migration> = {};

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
  const problem = validate(data);
  if (problem) return { ok: false, reason: problem, raw };
  return { ok: true, state: data as unknown as LifeState };
}

function validate(d: Record<string, unknown>): string | null {
  const need = ["seed", "ageMonths", "identity", "birthplace", "residence", "family", "body", "growth", "skills", "potentials", "traits", "condition", "plan", "placement", "rng", "peers", "history", "achievements", "draft", "counters", "clock", "education"];
  for (const k of need) if (!(k in d)) return `The save is missing "${k}".`;
  if (typeof d.ageMonths !== "number" || d.ageMonths < 0 || d.ageMonths > 600) return "The save has an impossible age.";
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
