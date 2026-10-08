/**
 * Builds src/data/runtime/team-leadership.json: owners, executives, head coach,
 * G League affiliate and arena for all 30 teams.
 *
 * Everything comes from each team's Wikipedia infobox, which cites team and
 * NBA sources. ESPN's roster feed fills in a missing head coach and adds his
 * years of experience when both sources name the same coach. ESPN's venue and
 * coach fields lag behind changes, so they never override the infobox.
 * Only names, titles and links are stored.
 *
 *   npx tsx scripts/build-team-leadership.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { LeadershipPerson, TeamLeadership } from "../src/data/runtime/team-leadership";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "drbl.io team leadership builder (https://drbl.io)";
const WIKI_DELAY_MS = 1500;
const OUT = path.join(process.cwd(), "src/data/runtime/team-leadership.json");

const WIKI_TITLE_OVERRIDES: Record<string, string> = {
  "LA Clippers": "Los Angeles Clippers",
};

type Person = LeadershipPerson;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    // Wikipedia asks for an identifying agent; ESPN rejects unfamiliar ones.
    const headers = url.startsWith(WIKI_API) ? { "User-Agent": USER_AGENT } : undefined;
    const res = await fetch(url, { headers });
    const text = await res.text();
    if (res.ok && text.startsWith("{")) return JSON.parse(text) as T;
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`Fetch failed: ${url}`);
}

/** Splits a list-ish infobox value into items: <br>, {{ubl|…}}, {{plainlist|* …}}. */
function splitItems(raw: string): string[] {
  let value = raw
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<ref[\s\S]*$/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{\s*efn\|(?:[^{}]|\{\{[^{}]*\}\})*\}\}/gi, "")
    .replace(/\{\{\s*efn[\s\S]*$/i, "");
  const list = /\{\{\s*(?:ubl|unbulleted list|plainlist|flatlist)\s*\|([\s\S]*)\}\}/i.exec(value);
  if (list) {
    value = list[1]!
      .replace(/\[\[([^\]]*)\]\]/g, (m) => m.replace(/\|/g, "\u0001"))
      .split(/\||\n\s*\*/)
      .join("<br>")
      .replace(/\u0001/g, "|");
  }
  return value
    .split(/<br\s*\/?>/i)
    .map((s) => s.replace(/^\s*\*\s*/, "").trim())
    .filter(Boolean);
}

function person(item: string): Person | null {
  const link = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(item);
  const wiki = link ? `https://en.wikipedia.org/wiki/${encodeURIComponent(link[1]!.trim().replace(/ /g, "_"))}` : undefined;
  const text = item
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{\s*(?:small|nowrap)\s*\|([^}]*)\}\}/gi, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const note = /\(([^)]+)\)\s*$/.exec(text);
  const name = note ? text.slice(0, note.index).trim() : text;
  if (!name) return null;
  return { name, ...(note ? { note: note[1]!.trim() } : {}), ...(wiki && link && !link[1]!.includes("#") ? { wiki } : {}) };
}

function infobox(wikitext: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const m of wikitext.matchAll(/^\s*\|\s*([A-Za-z_ ]+?)\s*=\s*(.*)$/gm)) {
    const key = m[1]!.toLowerCase().replace(/\s+/g, "_");
    if (!fields.has(key)) fields.set(key, m[2]!);
  }
  return fields;
}

function people(fields: Map<string, string>, ...keys: string[]): Person[] {
  for (const key of keys) {
    const raw = fields.get(key);
    if (raw == null || !raw.trim()) continue;
    const out: Person[] = [];
    for (const item of splitItems(raw)) {
      const p = person(item);
      if (p) out.push(p);
      else if (out.length && /^\(.+\)$/.test(item.trim())) {
        const note = person(`x ${item.trim()}`)?.note;
        if (note) out[out.length - 1] = { ...out[out.length - 1]!, note };
      }
    }
    return out;
  }
  return [];
}

/** Accents and punctuation differ between feeds ("Jordi Fernández" vs "Jordi Fernandez"). */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toLowerCase();
  return norm(a) === norm(b);
}

type EspnTeam = { id: string; abbreviation: string; displayName: string };

async function main() {
  const listing = await json<{ sports: Array<{ leagues: Array<{ teams: Array<{ team: EspnTeam }> }> }> }>(
    `${ESPN}/teams`
  );
  const teams = listing.sports[0]!.leagues[0]!.teams.map((t) => t.team);
  const out: TeamLeadership[] = [];

  for (const team of teams) {
    const [roster] = await Promise.all([
      json<{ coach?: Array<{ firstName: string; lastName: string; experience?: number }> }>(
        `${ESPN}/teams/${team.id}/roster`
      ),
    ]);

    const title = WIKI_TITLE_OVERRIDES[team.displayName] ?? team.displayName;
    const wiki = await json<{ parse?: { title: string; wikitext: string } }>(
      `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&section=0&redirects=1&format=json&formatversion=2`
    );
    await sleep(WIKI_DELAY_MS);
    const fields = infobox(wiki.parse?.wikitext ?? "");

    const espnCoach = roster.coach?.[0];
    const espnCoachName = espnCoach ? `${espnCoach.firstName} ${espnCoach.lastName}`.trim() : null;
    const wikiCoach = people(fields, "coach", "head_coach")[0];
    const coachName = wikiCoach?.name ?? espnCoachName;
    const sameCoach = espnCoachName != null && coachName != null && sameName(espnCoachName, coachName);
    const arena = people(fields, "arena")[0];
    const location = people(fields, "location")[0];
    const affiliate = people(fields, "affiliation")[0] ?? null;

    out.push({
      teamId: team.id,
      abbr: team.abbreviation,
      displayName: team.displayName,
      owners: people(fields, "owner", "owners", "ownership"),
      ceo: people(fields, "ceo"),
      president: people(fields, "president", "presidents"),
      generalManager: people(fields, "gm", "general_manager"),
      headCoach: coachName
        ? {
            name: coachName,
            espnExperienceYears: sameCoach ? (espnCoach?.experience ?? null) : null,
            ...(wikiCoach?.wiki ? { wiki: wikiCoach.wiki } : {}),
          }
        : null,
      affiliate,
      arena: arena
        ? {
            name: arena.note ? `${arena.name} (${arena.note})` : arena.name,
            location: location ? [location.name, location.note].filter(Boolean).join(", ") : null,
            ...(arena.wiki ? { wiki: arena.wiki } : {}),
          }
        : null,
      sources: {
        wikipedia: wiki.parse ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.parse.title.replace(/ /g, "_"))}` : null,
        espn: `https://www.espn.com/nba/team/_/name/${team.abbreviation.toLowerCase()}`,
      },
    });
    console.log(`${team.abbreviation}: coach ${coachName ?? "—"}, ${fields.size} infobox fields`);
  }

  out.sort((a, b) => a.abbr.localeCompare(b.abbr));
  writeFileSync(
    OUT,
    `${JSON.stringify({ retrievedAt: new Date().toISOString().slice(0, 10), teams: out }, null, 2)}\n`
  );
  console.log(`Wrote ${out.length} teams to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
