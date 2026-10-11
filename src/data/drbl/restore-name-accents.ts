/**
 * DRBL seasons built from the stats.nba.com play-by-play (2020-21 to 2023-24)
 * carry ASCII names ("Nikola Jokic"). The search index has the accented form.
 * A name changes only when exactly one indexed name folds to it.
 */

import { getPlayerSearchIndex } from "@/data/runtime/player-search-snapshot";

const NON_ASCII = /[^\x00-\x7F]/;

const UNDECOMPOSED: Record<string, string> = {
  ł: "l",
  Ł: "L",
  ø: "o",
  Ø: "O",
  đ: "d",
  Đ: "D",
  ı: "i",
};

export function foldAccents(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[łŁøØđĐı]/g, (c) => UNDECOMPOSED[c] ?? c);
}

let byFolded: Map<string, string | null> | null = null;

function accentedByFolded(): Map<string, string | null> {
  if (byFolded) return byFolded;
  const map = new Map<string, string | null>();
  for (const row of getPlayerSearchIndex()) {
    if (!NON_ASCII.test(row.name)) continue;
    const key = foldAccents(row.name);
    if (NON_ASCII.test(key)) continue;
    const prior = map.get(key);
    if (prior === undefined) map.set(key, row.name);
    else if (prior !== row.name) map.set(key, null);
  }
  byFolded = map;
  return map;
}

export function restoreNameAccents(name: string): string {
  if (!name || NON_ASCII.test(name)) return name;
  return accentedByFolded().get(name) ?? name;
}
