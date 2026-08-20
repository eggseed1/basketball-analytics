import { createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const UA = "Mozilla/5.0 (compatible; basketball-analytics/p18b4)";

async function main() {
  const out: unknown[] = [];
  for (const [id, slug] of [
    ["2202", "jason-richardson"],
    ["2072", "michael-redd"],
    ["959", "steve-nash"],
  ] as const) {
    const page = `https://www.nba.com/player/${id}/${slug}`;
    const r = await fetch(page, { headers: { "User-Agent": UA } });
    const html = await r.text();
    const imgs = [
      ...html.matchAll(/https:\/\/cdn\.nba\.com\/headshots[^"'\\\s)]+/g),
    ].map((m) => m[0]);
    const og = [...html.matchAll(/property="og:image"\s+content="([^"]+)"/g)].map(
      (m) => m[1]
    );
    const og2 = [...html.matchAll(/content="(https:\/\/[^"]+)"[^>]*property="og:image"/g)].map(
      (m) => m[1]
    );
    // also look for i.cdn or nba.com images
    const anyImg = [
      ...html.matchAll(/https:\/\/[^"'\\\s)]+(?:headshot|Headshot|player)[^"'\\\s)]+\.(?:png|jpg|jpeg|webp)/gi),
    ].map((m) => m[0]);
    console.log(
      JSON.stringify({
        id,
        status: r.status,
        imgs: [...new Set(imgs)].slice(0, 15),
        og,
        og2,
        anyImg: [...new Set(anyImg)].slice(0, 15),
      })
    );
    out.push({ id, imgs: [...new Set(imgs)], og, anyImg: [...new Set(anyImg)].slice(0, 20) });
  }

  // ESPN athletes search
  for (const q of ["Jason Richardson", "Michael Redd", "Steve Nash"]) {
    const url = `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=5&type=player`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    const j = (await r.json()) as {
      items?: Array<{ id?: string; displayName?: string; type?: string }>;
    };
    const items = (j.items ?? []).slice(0, 5);
    console.log(JSON.stringify({ q, items }));
    for (const it of items) {
      if (!it.id) continue;
      const img = `https://a.espncdn.com/i/headshots/nba/players/full/${it.id}.png`;
      const hr = await fetch(img, { method: "HEAD", headers: { "User-Agent": UA } });
      console.log(
        JSON.stringify({
          name: it.displayName,
          espnId: it.id,
          imgStatus: hr.status,
          cl: hr.headers.get("content-length"),
        })
      );
    }
  }

  // Hash placeholder reference
  const stub = await fetch(
    "https://cdn.nba.com/headshots/nba/latest/260x190/2202.png",
    { headers: { "User-Agent": UA } }
  );
  const buf = Buffer.from(await stub.arrayBuffer());
  const placeholder = {
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
  console.log(JSON.stringify({ placeholder }));
  out.push({ placeholder });

  mkdirSync("reports/p18b4", { recursive: true });
  writeFileSync(join("reports/p18b4", "_find_media.json"), JSON.stringify(out, null, 2));
}

main();
