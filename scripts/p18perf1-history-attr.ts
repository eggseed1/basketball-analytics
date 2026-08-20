/**
 * Attribute /history/2005-06 HTML weight by section markers.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "reports", "p18perf1");
mkdirSync(OUT, { recursive: true });

async function main() {
  const url = `${BASE}/history/2005-06`;
  const res = await fetch(url);
  const html = await res.text();
  const bytes = Buffer.byteLength(html, "utf8");

  const gameLinkCount = (html.match(/\/games\/00205/g) ?? []).length;
  const playerLinkCount = (html.match(/\/players\/\d+/g) ?? []).length;
  const totalLinks = (html.match(/<a\s/gi) ?? []).length;
  const liCount = (html.match(/<li\b/gi) ?? []).length;

  const gameLis = html.match(/href="\/games\/00205[^"]*"[\s\S]*?<\/a>/g) ?? [];
  const gamesBytes = gameLis.reduce(
    (n, s) => n + Buffer.byteLength(s, "utf8"),
    0
  );

  const playerLis =
    html.match(/href="\/players\/\d+\?season=2005-06[^"]*"[\s\S]*?<\/a>/g) ??
    [];
  const playersBytes = playerLis.reduce(
    (n, s) => n + Buffer.byteLength(s, "utf8"),
    0
  );

  const formMatch = html.match(/<form[\s\S]*?<\/form>/);
  const formBytes = formMatch
    ? Buffer.byteLength(formMatch[0], "utf8")
    : 0;

  const remainder = Math.max(0, bytes - gamesBytes - playersBytes - formBytes);
  const report = {
    url,
    status: res.status,
    htmlBytes: bytes,
    gameLinkCount,
    playerLinkCount,
    totalLinks,
    liCount,
    attributionBytes: {
      gameRowAnchors: gamesBytes,
      playerRowAnchors: playersBytes,
      filterForm: formBytes,
      remainderApprox: remainder,
    },
    pct: {
      gameRowAnchors: +((gamesBytes / bytes) * 100).toFixed(1),
      playerRowAnchors: +((playersBytes / bytes) * 100).toFixed(1),
      filterForm: +((formBytes / bytes) * 100).toFixed(1),
      remainder: +((remainder / bytes) * 100).toFixed(1),
    },
    sampleGameAnchorBytes: gameLis[0]
      ? Buffer.byteLength(gameLis[0], "utf8")
      : 0,
  };

  writeFileSync(
    path.join(OUT, "02_history_baseline.json"),
    JSON.stringify(report, null, 2)
  );

  const md = `# History HTML attribution — /history/2005-06

Measured against production server \`${BASE}\`.

| Metric | Value |
|--------|------:|
| HTML bytes | ${bytes} (${(bytes / 1024 / 1024).toFixed(2)} MB) |
| Game links (\`/games/00205\`) | ${gameLinkCount} |
| Player links | ${playerLinkCount} |
| Total \`<a\` tags | ${totalLinks} |
| \`<li\` count | ${liCount} |

## Estimated byte contribution

| Slice | Bytes | % of HTML |
|-------|------:|----------:|
| Game row anchors | ${gamesBytes} | ${report.pct.gameRowAnchors}% |
| Player row anchors | ${playersBytes} | ${report.pct.playerRowAnchors}% |
| Filter form | ${formBytes} | ${report.pct.filterForm}% |
| Remainder (shell/RSC/nav/etc.) | ${remainder} | ${report.pct.remainder}% |

## Conclusion

**Dominant cost: full-season game list** (~${gameLinkCount} rows, ~${report.pct.gameRowAnchors}% of document via game anchors alone; ~${report.sampleGameAnchorBytes} bytes/row sample).

Players section (100/page) is secondary (~${report.pct.playerRowAnchors}%).

**Fix:** server-side paginate games; replace full player directory with discovery link + small sample.
`;

  writeFileSync(path.join(OUT, "03_history_html_attribution.md"), md);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
