/**
 * Bake player identity vitals (height, weight, age/DOB, draft, college) for
 * Cloudflare Workers — runtime cannot call ESPN / stats.nba on the player shell.
 *
 *   node scripts/build-runtime-player-bio-snapshot.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "data", "runtime", "player-bio-snapshot.json");
const ALIASES = path.join(ROOT, "data", "impact", "player-id-aliases.json");
const LEGEND_ALIASES = path.join(
  ROOT,
  "data",
  "impact",
  "legend-player-aliases.json"
);

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};
const ESPN_WEB = "https://site.web.api.espn.com";
const ESPN_SITE = "https://site.api.espn.com";
const TEAM_IDS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
];

function s(row, key) {
  const v = row?.[key];
  return v == null ? "" : String(v).trim();
}

function n(row, key) {
  const v = Number(row?.[key]);
  return Number.isFinite(v) ? v : 0;
}

function parseHeightInches(raw) {
  const text = String(raw ?? "").trim();
  const dash = /^(\d+)-(\d+)$/.exec(text);
  if (dash) return Number(dash[1]) * 12 + Number(dash[2]);
  const ft = /(\d+)\s*'\s*(\d+)/.exec(text);
  if (ft) return Number(ft[1]) * 12 + Number(ft[2]);
  const inches = Number(text);
  return inches > 40 && inches < 100 ? Math.round(inches) : undefined;
}

function parseEspnDob(display) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(display ?? "").trim());
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseEspnWeight(display, lbs) {
  if (typeof lbs === "number" && lbs > 100 && lbs < 500) {
    return Math.round(lbs);
  }
  const m = /(\d{2,3})/.exec(String(display ?? ""));
  return m ? Number(m[1]) : undefined;
}

function parseIsoDob(raw) {
  const text = String(raw ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && text !== "0000-00-00"
    ? text
    : undefined;
}

function formatNbaDraft(row) {
  const yearRaw = s(row, "DRAFT_YEAR");
  if (!yearRaw) return undefined;
  if (/^undrafted$/i.test(yearRaw)) return "Undrafted";
  const year = Number(yearRaw);
  if (!Number.isFinite(year) || year < 1947) return undefined;
  const round = Number(s(row, "DRAFT_ROUND"));
  const pick = Number(s(row, "DRAFT_NUMBER"));
  if (!Number.isFinite(round) || !Number.isFinite(pick) || round < 1 || pick < 1) {
    return `Year: ${year}`;
  }
  return `${year}: Rd ${round}, Pk ${pick}`;
}

function compactBio(bio) {
  if (!bio) return null;
  const out = {};
  if (bio.fullName) out.fn = bio.fullName;
  if (bio.position) out.p = bio.position;
  if (bio.birthDate) out.bd = bio.birthDate;
  if (bio.birthPlace) out.bp = bio.birthPlace;
  if (bio.heightInches) out.h = bio.heightInches;
  if (bio.weightLbs) out.w = bio.weightLbs;
  if (bio.college) out.c = bio.college;
  if (bio.draftInfo) out.d = bio.draftInfo;
  if (bio.jersey) out.j = bio.jersey;
  return Object.keys(out).length ? out : null;
}

function expandBio(compact) {
  if (!compact) return null;
  return {
    fullName: compact.fn,
    position: compact.p,
    birthDate: compact.bd,
    birthPlace: compact.bp,
    heightInches: compact.h,
    weightLbs: compact.w,
    college: compact.c,
    draftInfo: compact.d,
    jersey: compact.j,
  };
}

function mergeBio(base, next) {
  if (!base) return next ? { ...next } : null;
  if (!next) return base;
  return {
    fullName: base.fullName || next.fullName,
    position: next.position || base.position,
    birthDate: next.birthDate || base.birthDate,
    birthPlace: next.birthPlace || base.birthPlace,
    heightInches: next.heightInches || base.heightInches,
    weightLbs: next.weightLbs || base.weightLbs,
    college: next.college || base.college,
    draftInfo: next.draftInfo || base.draftInfo,
    jersey: next.jersey || base.jersey,
  };
}

function pickDraftLine(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aTeam = /\([A-Z]{2,3}\)/.test(a);
  const bTeam = /\([A-Z]{2,3}\)/.test(b);
  if (aTeam && !bTeam) return a;
  if (bTeam && !aTeam) return b;
  return a.length >= b.length ? a : b;
}

function mergeBioPreferEspnDraft(base, espn) {
  const merged = mergeBio(base, espn);
  if (!merged) return null;
  if (base?.draftInfo && espn?.draftInfo) {
    merged.draftInfo = pickDraftLine(espn.draftInfo, base.draftInfo);
  }
  return merged;
}

function bioComplete(bio) {
  return Boolean(
    bio?.heightInches &&
      bio?.weightLbs &&
      bio?.birthDate &&
      bio?.draftInfo
  );
}

async function fetchJson(url, headers = {}, timeoutMs = 8_000) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchNbaBio(nbaId) {
  const url = `https://stats.nba.com/stats/commonplayerinfo?PlayerID=${encodeURIComponent(nbaId)}`;
  const payload = await fetchJson(url, NBA_HEADERS, 10_000);
  const set =
    payload?.resultSets?.find((row) => row.name === "CommonPlayerInfo") ??
    payload?.resultSets?.[0];
  const row = set?.rowSet?.[0];
  if (!row || !set?.headers) return null;
  const obj = {};
  set.headers.forEach((header, index) => {
    obj[header] = row[index] ?? null;
  });
  const fullName =
    s(obj, "DISPLAY_FIRST_LAST") ||
    [s(obj, "FIRST_NAME"), s(obj, "LAST_NAME")].filter(Boolean).join(" ");
  if (!fullName) return null;
  return {
    fullName,
    position: s(obj, "POSITION") || s(obj, "POSITION_ABBREVIATION") || undefined,
    birthDate: parseIsoDob(s(obj, "BIRTHDATE")),
    heightInches: parseHeightInches(s(obj, "HEIGHT")),
    weightLbs: n(obj, "WEIGHT") || undefined,
    college: s(obj, "SCHOOL") || undefined,
    draftInfo: formatNbaDraft(obj),
    jersey: s(obj, "JERSEY") || undefined,
  };
}

async function fetchEspnProfile(espnId) {
  const url = `${ESPN_WEB}/apis/common/v3/sports/basketball/nba/athletes/${espnId}`;
  const payload = await fetchJson(url);
  const raw = payload?.athlete;
  if (!raw?.displayName && !raw?.id) return null;
  const dob =
    parseEspnDob(raw.displayDOB) ||
    (raw.dateOfBirth ? parseIsoDob(String(raw.dateOfBirth)) : undefined);
  return {
    fullName: raw.displayName ?? undefined,
    position: raw.position?.abbreviation ?? undefined,
    birthDate: dob,
    birthPlace: raw.displayBirthPlace?.trim() || undefined,
    heightInches: parseHeightInches(raw.displayHeight) ?? parseHeightInches(raw.height),
    weightLbs: parseEspnWeight(raw.displayWeight, raw.weight),
    college:
      raw.college?.name?.trim() ||
      raw.college?.shortName?.trim() ||
      undefined,
    draftInfo: raw.displayDraft?.trim() || undefined,
    jersey:
      String(raw.jersey ?? raw.displayJersey ?? "")
        .replace(/^#/, "")
        .trim() || undefined,
  };
}

function espnRosterBio(athlete) {
  if (!athlete?.displayName && !athlete?.id) return null;
  const dob = athlete.dateOfBirth
    ? parseIsoDob(String(athlete.dateOfBirth))
    : undefined;
  return {
    fullName: athlete.displayName ?? undefined,
    position: athlete.position?.abbreviation ?? undefined,
    birthDate: dob,
    birthPlace: athlete.birthPlace?.city
      ? [
          athlete.birthPlace?.city,
          athlete.birthPlace?.state,
          athlete.birthPlace?.country,
        ]
          .filter(Boolean)
          .join(", ")
      : undefined,
    heightInches:
      typeof athlete.height === "number" && athlete.height > 40
        ? Math.round(athlete.height)
        : parseHeightInches(athlete.displayHeight),
    weightLbs:
      typeof athlete.weight === "number" && athlete.weight > 100
        ? Math.round(athlete.weight)
        : undefined,
    college:
      athlete.college?.name?.trim() ||
      athlete.college?.shortName?.trim() ||
      undefined,
    jersey:
      String(athlete.jersey ?? "")
        .replace(/^#/, "")
        .trim() || undefined,
  };
}

async function mapPool(items, concurrency, worker) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const i = index++;
      await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
}

async function main() {
  /** @type {Record<string, object>} */
  const byId = {};

  function store(ids, bio) {
    if (!bio) return;
    const compact = compactBio(bio);
    if (!compact) return;
    for (const id of ids) {
      const key = String(id ?? "").trim();
      if (!key) continue;
      const prev = byId[key];
      byId[key] = prev
        ? compactBio(mergeBio(expandBio(prev), bio))
        : compact;
    }
  }

  let rosterCount = 0;
  for (const teamId of TEAM_IDS) {
    try {
      const payload = await fetchJson(
        `${ESPN_SITE}/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`
      );
      for (const athlete of payload.athletes ?? []) {
        const espnId = String(athlete.id ?? "").trim();
        if (!espnId) continue;
        store([espnId], espnRosterBio(athlete));
        rosterCount += 1;
      }
    } catch (error) {
      console.warn(
        `[player-bio] roster ${teamId} skipped: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }
  console.log(`[player-bio] espn roster rows=${rosterCount}`);

  let aliases = [];
  try {
    const raw = JSON.parse(await fs.readFile(ALIASES, "utf8"));
    aliases = Array.isArray(raw.aliases) ? raw.aliases : [];
  } catch (error) {
    console.warn(
      `[player-bio] aliases missing: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
  try {
    const legend = JSON.parse(await fs.readFile(LEGEND_ALIASES, "utf8"));
    const legendRows = Array.isArray(legend.aliases) ? legend.aliases : [];
    const legendNba = new Set(
      legendRows.map((row) => String(row.nbaPlayerId ?? "").trim()).filter(Boolean)
    );
    const legendEspn = new Set(
      legendRows.map((row) => String(row.espnPlayerId ?? "").trim()).filter(Boolean)
    );
    aliases = aliases.filter((row) => {
      const nba = String(row.nbaPlayerId ?? "").trim();
      const espn = String(row.espnPlayerId ?? "").trim();
      return !(legendNba.has(nba) || legendEspn.has(espn));
    });
    for (const row of legendRows) aliases.push(row);
    if (legendRows.length) {
      console.log(`[player-bio] merged ${legendRows.length} legend aliases`);
    }
  } catch {
    /* optional */
  }

  const aliasRows = aliases.filter(
    (row) => row?.nbaPlayerId || row?.espnPlayerId
  );
  console.log(`[player-bio] enriching ${aliasRows.length} alias rows…`);

  let done = 0;
  await mapPool(aliasRows, 10, async (row) => {
    const nbaId = String(row.nbaPlayerId ?? "").trim();
    const espnId = String(row.espnPlayerId ?? "").trim();
    let bio =
      expandBio(byId[espnId] ?? byId[nbaId] ?? null) ??
      null;

    if (espnId && !bioComplete(bio)) {
      try {
        bio = mergeBioPreferEspnDraft(bio, await fetchEspnProfile(espnId));
      } catch {
        /* optional */
      }
    }
    if (nbaId && !bioComplete(bio)) {
      try {
        bio = mergeBioPreferEspnDraft(await fetchNbaBio(nbaId), bio);
      } catch {
        /* optional */
      }
    }
    // Always seed a display name for legend rows so CF shells resolve identity
    // even when ESPN/NBA bio endpoints fail for retirees.
    if (!bio && row?.playerName) {
      bio = { fullName: String(row.playerName).trim() };
    } else if (bio && !bio.fullName && row?.playerName) {
      bio = { ...bio, fullName: String(row.playerName).trim() };
    }
    if (bio) {
      const bref =
        row?.brefSlug != null
          ? `bref:${String(row.brefSlug).trim().toLowerCase()}`
          : "";
      store([nbaId, espnId, bref].filter(Boolean), bio);
    }
    done += 1;
    if (done % 50 === 0) {
      console.log(`[player-bio] alias progress ${done}/${aliasRows.length}`);
    }
  });

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    playerCount: Object.keys(byId).length,
    players: byId,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload));
  const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
  console.log(
    `[player-bio] wrote ${OUT} ids=${payload.playerCount} gzip~${gz}`
  );
}

main().catch((error) => {
  console.error("[player-bio] failed", error);
  process.exit(1);
});
