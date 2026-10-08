/**
 * Builds src/data/runtime/team-leadership.json: owners, executives, head coach,
 * G League affiliate and arena for all 30 teams.
 *
 * Runs nightly from scripts/daily-runtime-sync.mjs so front office, coaching
 * and ownership changes reach the Organization tab on the next deploy. A team
 * whose fetch fails, or whose fields look broken, keeps its previous entry.
 *
 * Everything comes from each team's Wikipedia infobox, which cites team and
 * NBA sources. ESPN's roster feed fills in a missing head coach and adds his
 * years of experience when both sources name the same coach. ESPN's venue and
 * coach fields lag behind changes, so they never override the infobox.
 * Only names, titles and links are stored.
 *
 *   npx tsx scripts/build-team-leadership.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
type LeadershipFile = { retrievedAt?: string; teams?: TeamLeadership[] };

/** Fewer fields than this means a failed parse or a blanked page, not a real infobox. */
const MIN_INFOBOX_FIELDS = 10;
/** A normal night changes a handful of teams at most; more means the parser or the page format broke. */
const MAX_TEAMS_CHANGED = 8;

function readPrevious(): LeadershipFile {
  if (!existsSync(OUT)) return {};
  try {
    return JSON.parse(readFileSync(OUT, "utf8")) as LeadershipFile;
  } catch {
    return {};
  }
}

/** Rejects leftovers of markup, links and vandalism-length strings. */
function plausible(name: string | undefined | null): boolean {
  if (!name) return false;
  return name.length <= 90 && !/[{}[\]|<>]|https?:|www\./i.test(name);
}

function keepIfBroken<T>(next: T, prev: T | undefined, names: (v: T) => string[], keepWhenEmpty: boolean): T {
  if (prev === undefined) return next;
  const list = names(next);
  if (!list.length) return keepWhenEmpty && names(prev).length ? prev : next;
  return list.every(plausible) ? next : prev;
}

const personNames = (ps: LeadershipPerson[]) => ps.map((p) => p.name);
const one = <T extends { name: string } | null>(v: T) => (v ? [v.name] : []);

/** Role-level differences, for the run log and the mass-change guard. */
function changes(prev: TeamLeadership | undefined, next: TeamLeadership): string[] {
  if (!prev) return [`${next.abbr}: new entry`];
  const roles: Array<[string, (t: TeamLeadership) => string]> = [
    ["owners", (t) => personNames(t.owners).join("; ")],
    ["CEO", (t) => personNames(t.ceo).join("; ")],
    ["president", (t) => personNames(t.president).join("; ")],
    ["GM", (t) => personNames(t.generalManager).join("; ")],
    ["head coach", (t) => t.headCoach?.name ?? ""],
    ["arena", (t) => t.arena?.name ?? ""],
    ["affiliate", (t) => t.affiliate?.name ?? ""],
  ];
  return roles.flatMap(([label, get]) =>
    get(prev) === get(next) ? [] : [`${next.abbr} ${label}: ${get(prev) || "—"} → ${get(next) || "—"}`]
  );
}

async function buildTeam(team: EspnTeam, today: string): Promise<TeamLeadership | null> {
  const roster = await json<{ coach?: Array<{ firstName: string; lastName: string; experience?: number }> }>(
    `${ESPN}/teams/${team.id}/roster`
  ).catch(() => null);

  const title = WIKI_TITLE_OVERRIDES[team.displayName] ?? team.displayName;
  const wiki = await json<{ parse?: { title: string; wikitext: string } }>(
    `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&section=0&redirects=1&format=json&formatversion=2`
  );
  await sleep(WIKI_DELAY_MS);
  const fields = infobox(wiki.parse?.wikitext ?? "");
  if (fields.size < MIN_INFOBOX_FIELDS) {
    console.warn(`${team.abbreviation}: only ${fields.size} infobox fields, keeping the previous entry`);
    return null;
  }

  const espnCoach = roster?.coach?.[0];
  const espnCoachName = espnCoach ? `${espnCoach.firstName} ${espnCoach.lastName}`.trim() : null;
  const wikiCoach = people(fields, "coach", "head_coach")[0];
  const coachName = wikiCoach?.name ?? espnCoachName;
  const sameCoach = espnCoachName != null && coachName != null && sameName(espnCoachName, coachName);
  if (espnCoachName && wikiCoach && !sameCoach) {
    console.warn(`${team.abbreviation}: ESPN lists ${espnCoachName} as coach, Wikipedia ${wikiCoach.name}; using Wikipedia`);
  }
  const arena = people(fields, "arena")[0];
  const location = people(fields, "location")[0];

  return {
    teamId: team.id,
    abbr: team.abbreviation,
    displayName: team.displayName,
    checkedAt: today,
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
    affiliate: people(fields, "affiliation")[0] ?? null,
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
  };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const previous = readPrevious();
  const prevById = new Map((previous.teams ?? []).map((t) => [t.teamId, t]));

  const listing = await json<{ sports: Array<{ leagues: Array<{ teams: Array<{ team: EspnTeam }> }> }> }>(
    `${ESPN}/teams`
  ).catch(() => null);
  const teams: EspnTeam[] =
    listing?.sports[0]?.leagues[0]?.teams.map((t) => t.team) ??
    (previous.teams ?? []).map((t) => ({ id: t.teamId, abbreviation: t.abbr, displayName: t.displayName }));
  if (!teams.length) throw new Error("No team list from ESPN and no previous file to fall back on");

  const out: TeamLeadership[] = [];
  const changed: string[] = [];
  let kept = 0;

  for (const team of teams) {
    const prev = prevById.get(team.id);
    const fresh = await buildTeam(team, today).catch((error) => {
      console.warn(`${team.abbreviation}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!fresh) {
      if (prev) {
        out.push(prev);
        kept++;
      }
      continue;
    }
    const next: TeamLeadership = {
      ...fresh,
      owners: keepIfBroken(fresh.owners, prev?.owners, personNames, true),
      ceo: keepIfBroken(fresh.ceo, prev?.ceo, personNames, false),
      president: keepIfBroken(fresh.president, prev?.president, personNames, false),
      generalManager: keepIfBroken(fresh.generalManager, prev?.generalManager, personNames, false),
      headCoach: keepIfBroken(fresh.headCoach, prev?.headCoach ?? undefined, one, true),
      affiliate: keepIfBroken(fresh.affiliate, prev?.affiliate ?? undefined, one, false),
      arena: keepIfBroken(fresh.arena, prev?.arena ?? undefined, one, true),
    };
    const diff = changes(prev, next);
    if (diff.length) changed.push(...diff);
    out.push(next);
  }

  const teamsChanged = new Set(changed.map((line) => line.split(" ")[0])).size;
  for (const line of changed) console.log(`changed ${line}`);
  if (prevById.size && teamsChanged > MAX_TEAMS_CHANGED) {
    throw new Error(
      `${teamsChanged} teams changed in one run (limit ${MAX_TEAMS_CHANGED}); not writing. Check the parser against a few infoboxes.`
    );
  }
  if (!out.length) throw new Error("No teams built; not writing");

  out.sort((a, b) => a.abbr.localeCompare(b.abbr));
  writeFileSync(OUT, `${JSON.stringify({ retrievedAt: today, teams: out }, null, 2)}\n`);
  console.log(
    `Wrote ${out.length} teams to ${path.relative(process.cwd(), OUT)}: ${teamsChanged} changed, ${kept} kept from the previous run`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
