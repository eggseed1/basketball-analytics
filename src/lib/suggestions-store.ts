import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY = "site:suggestions:v1";
const FILE = path.join(process.cwd(), ".tmp", "suggestions.json");
const MAX_NOTES = 300;
const MAX_CHARS = 1500;

export type Suggestion = {
  id: string;
  text: string;
  page: string;
  createdAt: string;
};

type PageCache = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

async function kv(): Promise<PageCache | null> {
  try {
    const { getCloudflareContext } = (await import("@opennextjs/cloudflare")) as {
      getCloudflareContext: () => { env?: { PAGE_CACHE?: PageCache } };
    };
    return getCloudflareContext()?.env?.PAGE_CACHE ?? null;
  } catch {
    return null;
  }
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.length > MAX_CHARS) return null;
  return text;
}

function cleanPage(value: unknown): string {
  if (typeof value !== "string") return "";
  const page = value.trim().slice(0, 180);
  if (!page.startsWith("/")) return "";
  return page;
}

function parseList(raw: string | null): Suggestion[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown[];
    if (!Array.isArray(list)) return [];
    return list.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Partial<Suggestion>;
      const text = cleanText(item.text);
      if (!text || typeof item.id !== "string" || typeof item.createdAt !== "string") return [];
      return [{ id: item.id, text, page: cleanPage(item.page), createdAt: item.createdAt }];
    });
  } catch {
    return [];
  }
}

async function readFileNotes(): Promise<Suggestion[]> {
  try {
    return parseList(await readFile(FILE, "utf8"));
  } catch {
    return [];
  }
}

async function writeFileNotes(notes: Suggestion[]) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(notes));
}

export async function readSuggestions(): Promise<{ notes: Suggestion[]; unavailable: boolean }> {
  const cache = await kv();
  if (cache) {
    try {
      return { notes: parseList(await cache.get(KEY)), unavailable: false };
    } catch {
      return { notes: [], unavailable: true };
    }
  }
  if (process.env.NODE_ENV === "production") return { notes: [], unavailable: true };
  return { notes: await readFileNotes(), unavailable: false };
}

export async function addSuggestion(raw: {
  text?: unknown;
  page?: unknown;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const text = cleanText(raw.text);
  if (!text) {
    return { ok: false, status: 400, error: "Write a little more than a few words, and keep it under 1,500 characters." };
  }
  const current = await readSuggestions();
  if (current.unavailable) {
    return { ok: false, status: 503, error: "Suggestions are not reachable right now." };
  }
  const note: Suggestion = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    page: cleanPage(raw.page),
    createdAt: new Date().toISOString(),
  };
  const notes = [note, ...current.notes].slice(0, MAX_NOTES);
  const cache = await kv();
  try {
    if (cache) await cache.put(KEY, JSON.stringify(notes));
    else await writeFileNotes(notes);
  } catch {
    return { ok: false, status: 503, error: "That note could not be saved." };
  }
  return { ok: true };
}

/** Dev is open. Production needs SUGGESTIONS_READ_KEY, sent as x-suggestions-key. */
export function suggestionsReadAllowed(headerKey: string | null): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.SUGGESTIONS_READ_KEY?.trim();
  if (!expected) return false;
  return headerKey === expected;
}
