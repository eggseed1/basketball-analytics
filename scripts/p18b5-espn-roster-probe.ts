/**
 * Probe ESPN historical roster endpoints for exact athlete IDs.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const UA = "Mozilla/5.0 (compatible; basketball-analytics/p18b5)";

async function get(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const t = await r.text();
  try {
    return { status: r.status, j: JSON.parse(t) };
  } catch {
    return { status: r.status, preview: t.slice(0, 200) };
  }
}

async function main() {
  const out: unknown[] = [];
  // ESPN team ids: GSW=9, MIL=15, PHX=21, SEA historical? OKC=25, NJN/BKN=17, DAL=6
  const urls = [
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/9/roster?season=2006",
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/15/roster?season=2006",
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/21/roster?season=2006",
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/25/roster?season=2006",
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/17/roster?season=2006",
    "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2006/teams/9/athletes?limit=50",
  ];
  for (const url of urls) {
    const r = await get(url);
    const athletes =
      r.j?.athletes ??
      r.j?.entries ??
      r.j?.items ??
      r.j?.roster ??
      null;
    let sample: unknown[] = [];
    if (Array.isArray(athletes)) {
      sample = athletes.slice(0, 5).map((a: any) => ({
        id: a.id ?? a.athlete?.id,
        name: a.displayName ?? a.athlete?.displayName ?? a.fullName,
        headshot: a.headshot?.href ?? a.athlete?.headshot?.href,
      }));
    } else if (athletes?.items) {
      sample = athletes.items.slice(0, 3);
    }
    console.log(JSON.stringify({ url: url.slice(40), status: r.status, keys: r.j ? Object.keys(r.j) : [], sample }));
    out.push({ url, status: r.status, sample });
    await new Promise((r) => setTimeout(r, 400));
  }

  // Direct athlete lookup by known historical ESPN ids (from web knowledge / prior)
  // Probe site.web.api search with sport filter
  for (const q of ["Jason Richardson", "Michael Redd", "Steve Nash"]) {
    const url = `https://site.web.api.espn.com/apis/common/v3/search?region=us&lang=en&query=${encodeURIComponent(q)}&limit=10&type=player`;
    const r = await get(url);
    const items = (r.j?.items ?? []).map((it: any) => ({
      id: it.id,
      name: it.displayName,
      sport: it.sport,
      league: it.league,
      defaultLeagueSlug: it.defaultLeagueSlug,
    }));
    console.log(JSON.stringify({ q, items }));
    out.push({ q, items });
  }

  mkdirSync("reports/p18b5", { recursive: true });
  writeFileSync(join("reports/p18b5", "_espn_roster_probe.json"), JSON.stringify(out, null, 2));
}

main();
