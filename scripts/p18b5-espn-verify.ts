/**
 * Verify known ESPN IDs + probe historical team-season athletes.
 */
import { createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const UA = "Mozilla/5.0 (compatible; basketball-analytics/p18b5)";

async function headImg(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const buf = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    bytes: buf.length,
    sha: createHash("sha256").update(buf).digest("hex").slice(0, 16),
    ct: r.headers.get("content-type"),
  };
}

async function athlete(id: string) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${id}`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const j = await r.json();
  const a = j.athlete ?? j;
  return {
    status: r.status,
    id: a.id,
    name: a.displayName ?? a.fullName,
    dob: a.dateOfBirth ?? a.birthDate,
    headshot: a.headshot?.href,
    team: a.team?.abbreviation,
  };
}

async function main() {
  // Known / guessed ESPN IDs from public ESPN player URLs
  const probes = [
    ["1018", "Jason Richardson"],
    ["847", "Michael Redd?"],
    ["1007", "Joe Johnson was wrong before"],
    ["170", "Steve Nash?"],
    ["616", "?"],
    ["302", "Steve Nash?"],
    ["110", "?"],
  ];
  for (const [id, label] of probes) {
    const meta = await athlete(id);
    const img = meta.headshot
      ? await headImg(meta.headshot)
      : await headImg(
          `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`
        );
    console.log(JSON.stringify({ label, meta, img }));
  }

  // Historical roster via core API
  const team = 9; // GSW
  const season = 2006;
  const listUrl = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/teams/${team}/athletes?limit=100`;
  const lr = await fetch(listUrl, { headers: { "User-Agent": UA } });
  const lj = await lr.json();
  console.log(JSON.stringify({ listStatus: lr.status, count: lj.count, items: lj.items?.length }));
  const athletes: unknown[] = [];
  for (const it of (lj.items ?? []).slice(0, 20)) {
    const ref = String(it.$ref ?? "").replace("http://", "https://");
    if (!ref) continue;
    const ar = await fetch(ref, { headers: { "User-Agent": UA } });
    const aj = await ar.json();
    // athlete may be nested
    const athleteRef = aj.athlete?.$ref
      ? String(aj.athlete.$ref).replace("http://", "https://")
      : null;
    let detail: any = aj;
    if (athleteRef) {
      const dr = await fetch(athleteRef, { headers: { "User-Agent": UA } });
      detail = await dr.json();
    }
    athletes.push({
      id: detail.id ?? aj.id,
      name: detail.displayName ?? detail.fullName,
      headshot: detail.headshot?.href,
      jersey: detail.jersey ?? aj.jersey,
    });
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(JSON.stringify({ gsw2006: athletes }, null, 2));
  mkdirSync("reports/p18b5", { recursive: true });
  writeFileSync(
    join("reports/p18b5", "_espn_id_verify.json"),
    JSON.stringify({ athletes }, null, 2)
  );
}

main();
