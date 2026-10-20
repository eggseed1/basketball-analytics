/**
 * Geo streaming partners + official watch URL mapping.
 * Run: npx tsx scripts/test-nba-streaming.ts
 */
import assert from "node:assert/strict";

import {
  countryFromRequestHeaders,
  howToWatchUrlForSeason,
  LEAGUE_PASS_BLOCKED,
  NBA_HOW_TO_WATCH_2025,
  NBA_LEAGUE_PASS,
  NBA_WATCH_HUB,
  officialWatchUrlForLabel,
  streamingEraForSeason,
  streamingRegionForCountry,
} from "../src/lib/nba-streaming";
import {
  mapEspnBroadcasts,
  resolveWatchAvailability,
} from "../src/lib/game-watch";

function headers(map: Record<string, string>) {
  return {
    get(name: string) {
      return map[name.toLowerCase()] ?? map[name] ?? null;
    },
  };
}

function main() {
  assert.equal(streamingEraForSeason("2024-25"), "pre-2025");
  assert.equal(streamingEraForSeason("2025-26"), "2025-media");
  assert.equal(streamingEraForSeason("2030-31"), "2025-media");

  assert.equal(
    officialWatchUrlForLabel("ESPN", "2025-26"),
    "https://www.espn.com/watch/"
  );
  assert.equal(
    officialWatchUrlForLabel("Prime Video", "2025-26"),
    "https://www.primevideo.com/"
  );
  assert.equal(
    officialWatchUrlForLabel("Peacock", "2025-26"),
    "https://www.peacocktv.com/sports/nba"
  );
  assert.equal(
    officialWatchUrlForLabel("NBC", "2025-26"),
    "https://www.nbc.com/sports/nba"
  );
  assert.equal(officialWatchUrlForLabel("YES Network", "2025-26"), null);
  assert.equal(
    officialWatchUrlForLabel("TNT", "2024-25"),
    "https://www.tntdrama.com/sports/nba"
  );

  assert.equal(howToWatchUrlForSeason("2025-26"), NBA_HOW_TO_WATCH_2025);
  assert.equal(howToWatchUrlForSeason("2024-25"), NBA_WATCH_HUB);

  assert.equal(
    countryFromRequestHeaders(headers({ "cf-ipcountry": "ca" })),
    "CA"
  );
  assert.equal(
    countryFromRequestHeaders(headers({ "x-vercel-ip-country": "GB" })),
    "GB"
  );
  assert.equal(
    countryFromRequestHeaders(headers({ "cf-ipcountry": "XX" })),
    null
  );

  const us = streamingRegionForCountry("US");
  assert.equal(us.label, "United States");
  assert.ok(us.partners.some((p) => /peacock/i.test(p.name)));
  assert.ok(us.partners.some((p) => /prime/i.test(p.name)));
  assert.equal(us.leaguePassAvailable, true);

  const ca = streamingRegionForCountry("CA");
  assert.ok(ca.partners.some((p) => /sportsnet/i.test(p.name)));
  assert.ok(ca.partners.some((p) => /tsn/i.test(p.name)));

  const uk = streamingRegionForCountry("GB");
  assert.ok(uk.partners.some((p) => /sky/i.test(p.name)));

  for (const blocked of LEAGUE_PASS_BLOCKED) {
    const region = streamingRegionForCountry(blocked);
    assert.equal(region.leaguePassAvailable, false, blocked);
  }

  const mapped = mapEspnBroadcasts({
    broadcasts: [{ market: "national", names: ["Prime Video"] }],
    season: "2025-26",
  });
  assert.equal(mapped[0]?.watchUrl, "https://www.primevideo.com/");

  const usRows = resolveWatchAvailability({
    broadcasts: mapped,
    countryCode: "US",
    locationLabel: "Boston, MA",
    season: "2025-26",
  });
  const lp = usRows.find((r) => r.kind === "league_pass");
  assert.ok(lp);
  assert.equal(lp!.option.watchUrl, NBA_LEAGUE_PASS);
  assert.equal(lp!.availability, "blackout_possible");
  assert.ok(usRows.some((r) => r.option.label === "Prime Video"));
  assert.ok(usRows.every((r) => !r.option.watchUrl || /^https:\/\//.test(r.option.watchUrl)));

  const caRows = resolveWatchAvailability({
    broadcasts: mapped,
    countryCode: "CA",
    season: "2025-26",
  });
  assert.ok(caRows.some((r) => /sportsnet/i.test(r.option.label)));
  assert.ok(caRows.some((r) => r.kind === "league_pass"));

  const cnRows = resolveWatchAvailability({
    broadcasts: [],
    countryCode: "CN",
    season: "2025-26",
  });
  const cnLp = cnRows.find((r) => r.kind === "league_pass");
  assert.equal(cnLp?.availability, "unavailable");
  assert.equal(cnLp?.option.watchUrl, null);

  // NBC + Peacock + regional NBC/Peacock package → one family, no repeats.
  const nbcDup = mapEspnBroadcasts({
    geoBroadcasts: [
      { media: { shortName: "NBC" }, market: { type: "National" }, type: { shortName: "TV" } },
      { media: { shortName: "Peacock" }, market: { type: "National" }, type: { shortName: "Streaming" } },
    ],
    season: "2025-26",
  });
  assert.equal(nbcDup.length, 1, "NBC and Peacock collapse to one listing");
  const nbcRows = resolveWatchAvailability({
    broadcasts: nbcDup,
    countryCode: "US",
    season: "2025-26",
  });
  const nbcFamily = nbcRows.filter((r) =>
    /nbc|peacock/i.test(r.option.label)
  );
  assert.equal(nbcFamily.length, 1, "US package must not re-list NBC/Peacock");

  // All partner URLs in region packages must be https official hosts.
  for (const code of ["US", "CA", "GB", "AU", "DE", "FR", "BR", "MX", "JP"]) {
    const region = streamingRegionForCountry(code);
    for (const partner of region.partners) {
      assert.match(partner.watchUrl, /^https:\/\//, partner.watchUrl);
      assert.ok(
        /nba\.com|espn\.|abc\.com|peacocktv|primevideo|amazon\.com|sportsnet|tsn\.ca|sky|kayo|bein|movistar|espn\.com\.br|espn\.com\.mx/i.test(
          partner.watchUrl
        ),
        `unexpected host for ${partner.name}: ${partner.watchUrl}`
      );
    }
  }

  console.log("test-nba-streaming: ok");
}

main();
