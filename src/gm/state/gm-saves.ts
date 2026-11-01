/**
 * Multi-save slots for Franchise Lab.
 * Active league stays in Zustand; each save has its own IndexedDB layer keys.
 */

import { get, set, del } from "idb-keyval";

import { uid } from "@/gm/engine/rng";
import type { GmLeagueState } from "@/gm/types";

export const GM_LAYER_A = "franchise-lab-gm";
export const GM_LAYER_B = "franchise-lab-myleague";
const INDEX_KEY = "franchise-lab-saves";

export type GmSaveMeta = {
  id: string;
  label: string;
  userTeamId: string;
  season: number;
  phase: string;
  updatedAt: string;
};

export type GmSaveIndex = {
  activeId: string | null;
  saves: GmSaveMeta[];
};

/** Sync mirror of the index activeId for Layer B refs / storage. */
let activeIdSync: string | null = null;
let indexCache: GmSaveIndex | null = null;
let migratePromise: Promise<void> | null = null;

export function layerAKey(id: string): string {
  return `${GM_LAYER_A}:${id}`;
}

export function layerBKey(id: string): string {
  return `${GM_LAYER_B}:${id}`;
}

export function currentActiveSaveId(): string | null {
  return activeIdSync;
}

export function activeLayerARef(): string {
  return activeIdSync ? layerAKey(activeIdSync) : GM_LAYER_A;
}

export function metaFromLeague(league: GmLeagueState, id: string): GmSaveMeta {
  const team = league.teams.find((row) => row.id === league.userTeamId);
  const seasonLabel = `${league.season - 1}-${String(league.season).slice(-2)}`;
  const club = team ? `${team.city} ${team.name}` : league.userTeamId.toUpperCase();
  return {
    id,
    label: `${seasonLabel} ${club}`,
    userTeamId: league.userTeamId,
    season: league.season,
    phase: league.phase,
    updatedAt: league.updatedAt || new Date().toISOString(),
  };
}

function applyIndex(next: GmSaveIndex): GmSaveIndex {
  indexCache = next;
  activeIdSync = next.activeId;
  return next;
}

async function writeIndex(next: GmSaveIndex): Promise<GmSaveIndex> {
  applyIndex(next);
  await set(INDEX_KEY, next);
  return next;
}

function parsePersistedLeague(raw: string): GmLeagueState | null {
  try {
    const parsed = JSON.parse(raw) as {
      state?: { league?: GmLeagueState | null };
      league?: GmLeagueState | null;
    };
    return parsed.state?.league ?? parsed.league ?? null;
  } catch {
    return null;
  }
}

export async function ensureSaveIndexMigrated(): Promise<void> {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    const existing = await get<GmSaveIndex>(INDEX_KEY);
    if (existing && Array.isArray(existing.saves)) {
      applyIndex({
        activeId: existing.activeId ?? null,
        saves: existing.saves,
      });
      return;
    }

    const legacyA = await get<string>(GM_LAYER_A);
    if (legacyA) {
      const league = parsePersistedLeague(legacyA);
      if (league) {
        const id = uid("save");
        await set(layerAKey(id), legacyA);
        const legacyB = await get<string>(GM_LAYER_B);
        if (legacyB) await set(layerBKey(id), legacyB);
        await writeIndex({
          activeId: id,
          saves: [metaFromLeague(league, id)],
        });
        return;
      }
    }

    await writeIndex({ activeId: null, saves: [] });
  })();
  return migratePromise;
}

export async function readSaveIndex(): Promise<GmSaveIndex> {
  await ensureSaveIndexMigrated();
  if (indexCache) return indexCache;
  const raw = await get<GmSaveIndex>(INDEX_KEY);
  return applyIndex(raw ?? { activeId: null, saves: [] });
}

/** Park the active save (keep bytes). Hub can show league=null without wiping. */
export async function parkActiveSave(): Promise<void> {
  const index = await readSaveIndex();
  if (!index.activeId) return;
  await writeIndex({ ...index, activeId: null });
}

/** Open a slot before seeding a brand-new franchise from the hub. */
export async function allocateNewSave(seed: {
  userTeamId: string;
  season?: number;
}): Promise<string> {
  const index = await readSaveIndex();
  const id = uid("save");
  const meta: GmSaveMeta = {
    id,
    label: "New franchise",
    userTeamId: seed.userTeamId,
    season: seed.season ?? new Date().getFullYear(),
    phase: "preseason",
    updatedAt: new Date().toISOString(),
  };
  await writeIndex({
    activeId: id,
    saves: [meta, ...index.saves.filter((row) => row.id !== id)],
  });
  return id;
}

export async function setActiveSaveId(id: string | null): Promise<void> {
  const index = await readSaveIndex();
  if (id && !index.saves.some((row) => row.id === id)) {
    throw new Error("Save not found");
  }
  await writeIndex({ ...index, activeId: id });
}

async function touchSaveMeta(league: GmLeagueState, id: string): Promise<void> {
  await ensureSaveIndexMigrated();
  const index = indexCache!;
  if (!index.saves.some(row => row.id === id)) return;
  const meta = metaFromLeague(league, id);
  await writeIndex({
    ...index,
    saves: index.saves.map((row) => (row.id === id ? meta : row)),
  });
}

export async function deleteSaveSlot(id: string): Promise<void> {
  const index = await readSaveIndex();
  await del(layerAKey(id));
  await del(layerBKey(id));
  await writeIndex({
    activeId: index.activeId === id ? null : index.activeId,
    saves: index.saves.filter((row) => row.id !== id),
  });
}

export async function readLayerARaw(id: string): Promise<string | null> {
  return (await get<string>(layerAKey(id))) ?? null;
}

export async function readLayerBRaw(id: string): Promise<string | null> {
  return (await get<string>(layerBKey(id))) ?? null;
}

type PersistStorage = {
  getItem: (name: string) => Promise<string | null>;
  setItem: (name: string, value: string) => Promise<void>;
  removeItem: (name: string) => Promise<void>;
};

/** Zustand persist adapter: routes the fixed store name to the active slot. */
export function createGmSlotStorage(layer: "a" | "b"): PersistStorage {
  const pending = new Map<string, Promise<void>>();
  const slotKey = (id: string) => (layer === "a" ? layerAKey(id) : layerBKey(id));

  return {
    getItem: async () => {
      await ensureSaveIndexMigrated();
      const index = await readSaveIndex();
      if (!index.activeId) return null;
      return (await get<string>(slotKey(index.activeId))) ?? null;
    },
    setItem: async (_name, value) => {
      // A write belongs to the slot that was active when it began. Switching
      // slots while IndexedDB is pending must not move the write or its label.
      const id = activeIdSync;
      const league = layer === "a" ? parsePersistedLeague(value) : null;
      if (!id || (layer === "a" && !league)) return;
      const key = slotKey(id);
      const previous = pending.get(key) ?? Promise.resolve();
      const write = previous.catch(() => {}).then(async () => {
        await ensureSaveIndexMigrated();
        await set(key, value);
        if (league) await touchSaveMeta(league, id);
      });
      pending.set(key, write);
      try { await write; }
      finally { if (pending.get(key) === write) pending.delete(key); }
    },
    removeItem: async () => {
      const id = activeIdSync;
      if (!id) return;
      await ensureSaveIndexMigrated();
      await del(slotKey(id));
    },
  };
}

