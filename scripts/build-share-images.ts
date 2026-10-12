/**
 * Share images (1200x630 PNG) for player, team and game pages, written to
 * public/og/ as static assets so the Worker bundle doesn't carry an image
 * renderer. The manifest lists only images that rendered; pages without one
 * keep the site image.
 *
 *   npx tsx --require ./scripts/lib/stub-server-only.cjs scripts/build-share-images.ts [--limit=20] [--only=players,teams,games]
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement as h, type ReactNode } from "react";
import { ImageResponse } from "next/og";

import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { fetchScoreboardDay } from "@/data/providers/nba/scoreboard-client";
import { getBundledBrefPeerBoard } from "@/data/runtime/bref-advanced-snapshot";
import { listBundledEspnRosterEntries } from "@/data/runtime/current-roster-snapshot";
import { getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { getRuntimeStandings } from "@/data/runtime/standings-snapshot";
import type { Game } from "@/data/types";
import { TEAM_BRANDS, resolveTeamBrand, teamLogoUrl, type TeamBrand } from "@/lib/nba-brand";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { priorSeasonForStats } from "@/lib/player-board-season";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public/og");
const MANIFEST = path.join(ROOT, "src/data/runtime/share-images.json");
const W = 1200;
const H = 630;
const BG = "#0c0d11";
const CONCURRENCY = 6;
/** Players need this many games before the current season's line replaces last season's. */
const MIN_GAMES = 10;

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k!, v ?? "true"] as const;
  })
);
const LIMIT = args.has("limit") ? Number(args.get("limit")) : Infinity;
const ONLY = new Set((args.get("only") ?? "players,teams,games").split(","));

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

async function loadFonts(): Promise<Font[]> {
  const regular = await readFile(path.join(ROOT, "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"));
  const fonts: Font[] = [{ name: "Geist", data: regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength) as ArrayBuffer, weight: 400, style: "normal" }];
  const cache = path.join(os.homedir(), ".cache/drbl-og/Geist-Bold.ttf");
  try {
    let bold: Buffer;
    if (existsSync(cache)) {
      bold = await readFile(cache);
    } else {
      const css = await (await fetch("https://fonts.googleapis.com/css2?family=Geist:wght@700", { headers: { "User-Agent": "Mozilla/4.0" } })).text();
      const url = css.match(/src: url\((https:[^)]+\.ttf)\)/)?.[1];
      if (!url) throw new Error("no ttf in font css");
      bold = Buffer.from(await (await fetch(url)).arrayBuffer());
      await mkdir(path.dirname(cache), { recursive: true });
      await writeFile(cache, bold);
    }
    fonts.push({ name: "Geist", data: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) as ArrayBuffer, weight: 700, style: "normal" });
  } catch (error) {
    console.warn(`[og] bold font unavailable, using regular: ${(error as Error).message}`);
  }
  return fonts;
}

const imageCache = new Map<string, Promise<string | null>>();

/** Remote image as a data URI, or null; satori would otherwise fail the whole card on a 404. */
function dataUri(url: string | undefined | null): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  let hit = imageCache.get(url);
  if (!hit) {
    hit = (async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const type = res.headers.get("content-type") ?? "image/png";
        if (!type.startsWith("image/")) return null;
        return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
      } catch {
        return null;
      }
    })();
    imageCache.set(url, hit);
  }
  return hit;
}

function frame(accent: string, accent2: string, children: ReactNode): ReactNode {
  return h(
    "div",
    {
      style: {
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        background: BG,
        backgroundImage: `radial-gradient(circle at 0% 0%, ${accent}55 0%, transparent 55%), radial-gradient(circle at 100% 100%, ${accent2}40 0%, transparent 50%)`,
        color: "#f5f5f7",
        fontFamily: "Geist",
        padding: "56px 64px",
      },
    },
    h("div", { style: { display: "flex", height: 8, width: 160, borderRadius: 4, background: `linear-gradient(90deg, ${accent}, ${accent2})` } }),
    h("div", { style: { display: "flex", flex: 1, alignItems: "center" } }, children),
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 26, color: "#a1a1aa" } },
      h("span", { style: { fontWeight: 700, color: "#f5f5f7" } }, "DRBL"),
      h("span", null, "drbl.io")
    )
  );
}

function statBlock(value: string, label: string): ReactNode {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", marginRight: 48 } },
    h("span", { style: { fontSize: 72, fontWeight: 700, lineHeight: 1 } }, value),
    h("span", { style: { fontSize: 24, color: "#a1a1aa", marginTop: 8 } }, label)
  );
}

async function render(node: ReactNode, fonts: Font[], file: string): Promise<boolean> {
  try {
    const res = new ImageResponse(node as React.ReactElement, { width: W, height: H, fonts });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buf);
    return true;
  } catch (error) {
    console.warn(`[og] ${path.relative(ROOT, file)}: ${(error as Error).message}`);
    return false;
  }
}

async function pool<T>(items: T[], fn: (item: T) => Promise<boolean>): Promise<number> {
  let next = 0;
  let ok = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        if (await fn(items[next++]!)) ok += 1;
      }
    })
  );
  return ok;
}

function signed1(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}

function brandFor(teamId: string | null | undefined): TeamBrand | null {
  return teamId ? (resolveTeamBrand(teamId) ?? null) : null;
}

// ---- players

type PlayerCard = { id: string; name: string; teamId: string; teamName: string; pos: string | null };

function statLine(espnId: string, season: string) {
  const pick = (s: string) => {
    const row = getBundledBrefPeerBoard(s).find((r) => r.playerId === espnId);
    return row && row.gamesPlayed > 0 ? { season: s, row } : null;
  };
  const now = pick(season);
  if (now && now.row.gamesPlayed >= MIN_GAMES) return now;
  return pick(priorSeasonForStats(season)) ?? now;
}

function drbl(espnId: string, season: string) {
  const nbaId = getBundledPlayerIdAliasIndex().byEspn.get(espnId)?.nbaPlayerId ?? espnId;
  for (const s of [season, priorSeasonForStats(season)]) {
    const row = getBundledDrblSeason(s).find((r) => r.playerId === nbaId);
    if (row && row.possessions > 0 && Number.isFinite(row.drbl100)) return { season: s, value: row.drbl100 };
  }
  return null;
}

async function playerImage(p: PlayerCard, season: string, fonts: Font[]): Promise<boolean> {
  const brand = brandFor(p.teamId);
  const accent = brand?.primary ?? "#2f6fdb";
  const accent2 = brand?.secondary ?? "#7a4fd6";
  const [photo, logo] = await Promise.all([
    dataUri(`https://a.espncdn.com/i/headshots/nba/players/full/${p.id}.png`),
    dataUri(teamLogoUrl(brand?.id, 500)),
  ]);
  const line = statLine(p.id, season);
  const rating = drbl(p.id, season);
  const stats: ReactNode[] = [];
  if (line) {
    const gp = line.row.gamesPlayed;
    stats.push(statBlock((line.row.points / gp).toFixed(1), "PTS"));
    stats.push(statBlock((line.row.rebounds / gp).toFixed(1), "REB"));
    stats.push(statBlock((line.row.assists / gp).toFixed(1), "AST"));
  }
  if (rating) stats.push(statBlock(signed1(rating.value), "DRBL/100"));
  const seasonNote = [line ? `${line.season} per game` : null, rating && rating.season !== line?.season ? `DRBL ${rating.season}` : null]
    .filter(Boolean)
    .join(" · ");

  const portrait = photo
    ? h("img", { src: photo, width: 380, height: 277, style: { objectFit: "cover" } })
    : h("span", { style: { fontSize: 120, fontWeight: 700 } }, p.name.split(" ").map((s) => s[0]).join("").slice(0, 2));

  const node = frame(
    accent,
    accent2,
    h(
      "div",
      { style: { display: "flex", alignItems: "center", width: "100%" } },
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            width: 340,
            height: 340,
            borderRadius: 170,
            overflow: "hidden",
            background: `${accent}33`,
            border: `6px solid ${accent}`,
            marginRight: 56,
            flexShrink: 0,
          },
        },
        portrait
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", fontSize: 28, color: "#d4d4d8", marginBottom: 12 } },
          logo ? h("img", { src: logo, width: 44, height: 44, style: { marginRight: 14 } }) : null,
          h("span", null, [p.teamName, p.pos].filter(Boolean).join(" · "))
        ),
        h("div", { style: { display: "flex", fontSize: p.name.length > 18 ? 64 : 80, fontWeight: 700, lineHeight: 1.05, marginBottom: 36 } }, p.name),
        stats.length ? h("div", { style: { display: "flex" } }, ...stats) : null,
        seasonNote ? h("span", { style: { fontSize: 22, color: "#a1a1aa", marginTop: 18 } }, seasonNote) : null
      )
    )
  );
  return render(node, fonts, path.join(OUT, "players", `${p.id}.png`));
}

// ---- teams

function teamRecord(espnTeamId: string, season: string): { season: string; text: string } | null {
  for (const s of [season, priorSeasonForStats(season)]) {
    const rows = getRuntimeStandings(s)?.conferences.flatMap((c) => c.rows) ?? [];
    const row = rows.find((r) => r.teamId === espnTeamId);
    if (row && row.wins + row.losses > 0) {
      return { season: s, text: `${row.wins}-${row.losses}${row.rank ? `, ${ordinal(row.rank)} in the ${row.conference}` : ""}` };
    }
  }
  return null;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

async function teamImage(brand: TeamBrand, name: string, season: string, fonts: Font[]): Promise<boolean> {
  const logo = await dataUri(teamLogoUrl(brand.id, 500));
  const record = teamRecord(brand.espnTeamId, season);
  const node = frame(
    brand.primary,
    brand.secondary,
    h(
      "div",
      { style: { display: "flex", alignItems: "center", width: "100%" } },
      logo ? h("img", { src: logo, width: 300, height: 300, style: { marginRight: 64 } }) : null,
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", flex: 1 } },
        h("span", { style: { fontSize: 30, color: "#d4d4d8", marginBottom: 12 } }, brand.abbr),
        h("div", { style: { display: "flex", fontSize: name.length > 20 ? 68 : 84, fontWeight: 700, lineHeight: 1.05 } }, name),
        record ? h("span", { style: { fontSize: 34, color: "#d4d4d8", marginTop: 28 } }, `${record.season}: ${record.text}`) : null
      )
    )
  );
  return render(node, fonts, path.join(OUT, "teams", `${brand.espnTeamId}.png`));
}

// ---- games

function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function tipLabel(game: Game): string {
  if (!game.tipOffAt) return dayLabel(game.gameDate);
  const clock = new Date(game.tipOffAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${dayLabel(game.gameDate)} · ${clock} ET`;
}

async function gameImage(game: Game, fonts: Font[]): Promise<boolean> {
  const away = brandFor(game.awayTeamId);
  const home = brandFor(game.homeTeamId);
  const [awayLogo, homeLogo] = await Promise.all([dataUri(teamLogoUrl(away?.id, 500)), dataUri(teamLogoUrl(home?.id, 500))]);
  const final = game.status === "final";
  const kind = game.gameType === "preseason" ? "Preseason" : game.gameType === "playoff" ? "Playoffs" : game.gameType === "play-in" ? "Play-in" : null;
  const side = (abbr: string, logo: string | null, score: number | null, won: boolean) =>
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", alignItems: "center", width: 300 } },
      logo ? h("img", { src: logo, width: 200, height: 200 }) : h("div", { style: { display: "flex", width: 200, height: 200 } }),
      h("span", { style: { fontSize: 40, fontWeight: 700, marginTop: 16 } }, abbr),
      score != null
        ? h("span", { style: { fontSize: 96, fontWeight: 700, lineHeight: 1, marginTop: 8, color: won ? "#f5f5f7" : "#8e8e93" } }, String(score))
        : null
    );
  const awayAbbr = game.awayTeamAbbr ?? away?.abbr ?? "AWAY";
  const homeAbbr = game.homeTeamAbbr ?? home?.abbr ?? "HOME";
  const node = frame(
    away?.primary ?? "#2f6fdb",
    home?.primary ?? "#7a4fd6",
    h(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" } },
      side(awayAbbr, awayLogo, final ? game.awayScore : null, game.awayScore > game.homeScore),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "center" } },
        h("span", { style: { fontSize: 44, fontWeight: 700 } }, final ? "Final" : "at"),
        h("span", { style: { fontSize: 26, color: "#a1a1aa", marginTop: 12 } }, final ? dayLabel(game.gameDate) : tipLabel(game)),
        kind ? h("span", { style: { fontSize: 24, color: "#a1a1aa", marginTop: 8 } }, kind) : null
      ),
      side(homeAbbr, homeLogo, final ? game.homeScore : null, game.homeScore > game.awayScore)
    )
  );
  return render(node, fonts, path.join(OUT, "games", `${game.id}.png`));
}

function dateKeyShift(today: string, delta: number): string {
  const d = new Date(Date.parse(`${today}T12:00:00Z`) + delta * 86_400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function recentGames(season: string): Promise<Game[]> {
  const today = nbaTodayIso();
  const days = await Promise.all(
    [-3, -2, -1, 0, 1, 2].map((d) => fetchScoreboardDay({ dateKey: dateKeyShift(today, d), season }).catch(() => [] as Game[]))
  );
  return days.flat().filter((g) => g.status === "final" || g.status === "scheduled");
}

// ---- main

type Manifest = { generatedAt: string | null; version: string | null; players: string[]; teams: string[]; games: string[] };

async function main() {
  const started = Date.now();
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  const fonts = await loadFonts();
  const done: Manifest = { generatedAt: new Date().toISOString(), version: nbaTodayIso().replace(/-/g, ""), players: [], teams: [], games: [] };
  await rm(OUT, { recursive: true, force: true });

  if (ONLY.has("players")) {
    const players: PlayerCard[] = listBundledEspnRosterEntries()
      .map(([id, e]) => ({ id, name: e.name ?? "", teamId: e.teamId, teamName: e.teamName, pos: e.pos ?? null }))
      .filter((p) => p.name && /^\d+$/.test(p.id))
      .slice(0, LIMIT);
    await pool(players, async (p) => {
      const ok = await playerImage(p, season, fonts);
      if (ok) done.players.push(p.id);
      return ok;
    });
  }

  if (ONLY.has("teams")) {
    const brands = Object.values(TEAM_BRANDS).filter((b, i, all) => all.findIndex((x) => x.espnTeamId === b.espnTeamId) === i);
    const names = new Map(listBundledEspnRosterEntries().map(([, e]) => [e.teamId, e.teamName] as const));
    await pool(brands.slice(0, LIMIT), async (b) => {
      const ok = await teamImage(b, names.get(b.espnTeamId) || b.abbr, season, fonts);
      if (ok) done.teams.push(b.espnTeamId);
      return ok;
    });
  }

  if (ONLY.has("games")) {
    const games = (await recentGames(season)).slice(0, LIMIT);
    await pool(games, async (g) => {
      const ok = await gameImage(g, fonts);
      if (ok) done.games.push(g.id);
      return ok;
    });
  }

  for (const key of ["players", "teams", "games"] as const) done[key].sort();
  await writeFile(MANIFEST, `${JSON.stringify(done)}\n`);
  console.log(
    `[og] ${done.players.length} players, ${done.teams.length} teams, ${done.games.length} games in ${((Date.now() - started) / 1000).toFixed(0)}s`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
