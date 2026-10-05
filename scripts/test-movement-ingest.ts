/**
 * Movement Center M1: headline classifier, reporter attribution, story
 * clustering, ledger resolution and scoring dedupe.
 * Run: npx tsx scripts/test-movement-ingest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { classifyMovementHeadline } from "../src/movement-center/classify-headline";
import { buildNewsClusters, type MovementNewsRow } from "../src/movement-center/news-claims";
import { extractReporters } from "../src/movement-center/reporters";
import { scoreMovementCluster } from "../src/movement-center/scoring";
import { resolveOpenStoriesWithLedger } from "../src/movement-center/live-resolve";
import { linkLedger, parseTradeRow } from "../src/movement-center/transaction-clusters";
import type { MovementCuratedSnapshot } from "../src/movement-center/types";
import { createHeadlineEntityResolver } from "../src/sentiment/headline-entities";

const roster = [
  { playerId: "3136195", name: "Karl-Anthony Towns", teamId: "18" },
  { playerId: "4433621", name: "Jalen Duren", teamId: "8" },
  { playerId: "3975", name: "Stephen Curry", teamId: "9" },
  { playerId: "6450", name: "Kawhi Leonard", teamId: "28" },
  { playerId: "3032979", name: "Dennis Schröder", teamId: "30" },
  { playerId: "4431941", name: "RayJ Dennis", teamId: "5" },
  { playerId: "2990984", name: "Buddy Hield", teamId: "4" },
  { playerId: "4684275", name: "Rob Dillingham", teamId: "30" },
  { playerId: "4251", name: "Paul George", teamId: "2" },
  { playerId: "3917376", name: "Jaylen Brown", teamId: "20" },
  { playerId: "4397183", name: "Aaron Wiggins", teamId: "1" },
];
const resolve = createHeadlineEntityResolver(roster);
const resolveLedger = createHeadlineEntityResolver(roster, { fullNamesOnly: true });
const names = new Map(roster.map((p) => [p.playerId, p.name]));
const ctx = {
  resolveTitle: resolve,
  playerName: (id: string) => names.get(id),
  teamName: (id: string) => ({ "8": "Pistons", "9": "Warriors", "18": "Knicks", "28": "Raptors", "12": "Clippers", "30": "Hornets", "4": "Bulls" })[id],
};

function classify(title: string, outlet = "CBS Sports") {
  return classifyMovementHeadline({ title, outlet });
}

function testClassifier() {
  const stalled = classify("Knicks, Karl-Anthony Towns extension talks reportedly have stalled: What it means");
  assert.equal(stalled?.claimType, "extension_talks");
  assert.equal(stalled?.evidenceClass, "reported");
  assert.equal(stalled?.negotiationSpecificity, "active_talks");

  const agreed = classify("Stephen Curry, Warriors reportedly agree to $116M extension");
  assert.equal(agreed?.agreement, true);
  assert.equal(agreed?.negotiationSpecificity, "offer");

  assert.equal(classify("Jalen Duren Expected To Skip Pistons Media Day Amid Contract Stalemate", "RealGM")?.provenanceKind, "aggregation");
  assert.equal(classify("KAT itching for Knicks extension: 'I want to play here'", "ESPN")?.provenanceKind, "official_statement");
  assert.equal(classify("Sources: Pistons, Duren far apart on extension", "ESPN")?.provenanceKind, "original_report");
  assert.equal(classify("Bucks deny they are shopping Giannis")?.denial, true);
  assert.equal(classify("Raptors, RJ Barrett haven't engaged in serious extension talks")?.negotiationSpecificity, undefined);

  // Not movement claims.
  for (const title of [
    "Grades for every NBA offseason signing: Why Warriors get a B for extending Steph Curry",
    "Tatum 'comfortable' leading new-look Celtics post-Brown trade",
    "Hornets Sign Wyatt Fricks To Exhibit 10 Contract",
    "Pistons Waive Gary Harris",
    "LeBron James reportedly getting $15 million annually in Polymarket deal",
    "Flagg's 1-of-1 rookie debut patch card sells for record $8.04M",
    "If Jalen Duren won't take Pistons' offer, then it's time for them to consider a trade",
    "Who will be next member from 2023 NBA Draft class to sign a big-money extension?",
    "D'Angelo Russell Signs With Shanghai Sharks Of CBA",
    "Kawhi Leonard contract breakdown: What $115 million extension means",
    "Donovan Mitchell Signs Multi-Year Extension With Adidas",
    "Video shows Ja Morant’s 7-word reaction to being traded by the Grizzlies",
    "Jalen Duren gets roasted after Pistons give big contract to Ausar Thompson",
    "Steph Curry has no interest in the LeBron James approach to free agency",
    "Paul George’s contract is valuable, executive says",
  ]) {
    assert.equal(classify(title), null, title);
  }

  // Possessive apostrophes are not quotes, and an anonymous exec is not on the record.
  assert.equal(classify("Knicks have reportedly made Deuce McBride’s future a trade talking point")?.provenanceKind, "cites_report");
  assert.notEqual(classify("NBA rumors: Warriors rival exec’s Spidey Sense tingling for Kristaps Porzingis trade")?.provenanceKind, "official_statement");
  assert.equal(classify("KAT itching for Knicks extension: 'I want to play here'", "ESPN")?.provenanceKind, "official_statement");
  assert.equal(classify("Lakers have no interest in trading Austin Reaves")?.denial, true);
  // "Interest in" alone needs a named team before it counts.
  assert.equal(classify("Bulls had interest in Jonathan Kuminga with one notable caveat")?.needsTeam, true);
  assert.equal(classify("Kyrie Irving is being linked to 2 teams in trade rumors")?.needsTeam, false);
}

/** A capitalized first name before a surname belongs to someone else. */
function testSurnameGuard() {
  const r = createHeadlineEntityResolver([
    { playerId: "ks", name: "Kobe Sanders" },
    { playerId: "kmid", name: "Khris Middleton" },
    { playerId: "sp", name: "Scotty Pippen Jr." },
  ]);
  assert.deepEqual(r("Deion Sanders tells incredible basketball story during Nuggets visit").playerIds, []);
  assert.deepEqual(r("John Middleton says something about the city").playerIds, []);
  assert.deepEqual(r("Scottie Pippen rips Michael Jordan again").playerIds, []);
  assert.deepEqual(r("Nuggets' Sanders impresses in preseason").playerIds, ["ks"]);
  assert.deepEqual(r("Rookie Sanders impresses in preseason").playerIds, ["ks"]);
  assert.deepEqual(r("Middleton returns for the Wizards").playerIds, ["kmid"]);
  // Title case capitalizes every word, so the guard stays off.
  assert.deepEqual(r("Nuggets Sign Guard Sanders To Two-Way Deal").playerIds, ["ks"]);
}

function testReporters() {
  assert.deepEqual(
    extractReporters("Negotiations are ongoing, sources told Joe Vardon and Matt Slater of The Athletic."),
    [
      { name: "Joe Vardon", outlet: "The Athletic" },
      { name: "Matt Slater", outlet: "The Athletic" },
    ]
  );
  assert.deepEqual(extractReporters("per ESPN's Shams Charania"), [{ name: "Shams Charania", outlet: "ESPN" }]);
  // Unknown names need a recognized outlet.
  assert.deepEqual(extractReporters("according to Some Person of Random Blog"), []);
  assert.deepEqual(extractReporters("according to Pat Writer of the Miami Herald"), [
    { name: "Pat Writer", outlet: "Miami Herald" },
  ]);
}

const rows: MovementNewsRow[] = [
  { id: "a", url: "https://x/a", outlet: "CBS Sports", publishedAt: "2026-09-21T10:00:00Z", title: "NBA rumors: Pistons up Jalen Duren offer, but still no deal" },
  { id: "b", url: "https://x/b", outlet: "RealGM", publishedAt: "2026-09-28T10:00:00Z", title: "Jalen Duren Expected To Skip Pistons Media Day Amid Contract Stalemate" },
  { id: "c", url: "https://x/c", outlet: "RealGM", publishedAt: "2026-09-30T10:00:00Z", title: "Knicks Hoping For Karl-Anthony Towns Extension Closer To $200M", reporters: [{ name: "Jake Fischer", outlet: "The Stein Line" }] },
  { id: "d", url: "https://x/d", outlet: "Yahoo Sports", publishedAt: "2026-09-30T12:00:00Z", title: "Karl-Anthony Towns extension talks with Knicks reportedly stall", reporters: [{ name: "Jake Fischer", outlet: "The Stein Line" }] },
  { id: "e", url: "https://x/e", outlet: "CBS Sports", publishedAt: "2026-09-26T10:00:00Z", title: "Stephen Curry, Warriors reportedly agree to $116M extension" },
  { id: "f", url: "https://x/f", outlet: "CBS Sports", publishedAt: "2026-09-15T10:00:00Z", title: "Clippers, Raptors agree to Kawhi Leonard trade again" },
  { id: "g", url: "https://x/g", outlet: "CBS Sports", publishedAt: "2026-06-01T10:00:00Z", title: "Kawhi Leonard trade talks reportedly heating up" },
];

function testClustering() {
  const news = buildNewsClusters(rows, ctx);
  const byPlayer = (id: string) => news.clusters.filter((c) => c.linkedPlayerIds.includes(id));
  assert.equal(byPlayer("4433621").length, 1, "Duren reports merge into one story");
  assert.equal(byPlayer("4433621")[0]!.claimIds.length, 2);
  assert.equal(byPlayer("4433621")[0]!.headline, "Jalen Duren: extension talks with the Pistons");
  assert.equal(byPlayer("3975")[0]!.headline, "Stephen Curry: reported extension with the Warriors");
  // Kawhi reports 106 days apart are separate stories.
  assert.equal(byPlayer("6450").length, 2);
  // Every claim links back to the publisher.
  assert.ok(news.claims.every((c) => c.sourceUrl?.startsWith("https://")));

  // Two outlets relaying one insider corroborate once.
  const kat = byPlayer("3136195")[0]!;
  const katClaims = news.claims.filter((c) => c.clusterId === kat.id);
  const score = scoreMovementCluster(kat, katClaims, news.sources, new Date("2026-09-30T13:00:00Z"));
  assert.equal(score.components.independentCorroboration, 5);
}

function testLedger() {
  const news = buildNewsClusters(rows, ctx);
  const linked = linkLedger(
    {
      newsClusters: news.clusters,
      newsClaims: news.claims,
      families: news.families,
      ledger: [
        { id: "t1", date: "2026-09-27", teamIds: ["30"], description: "Acquired G Rob Dillingham from Chicago Bulls for G Buddy Hield." },
        { id: "t2", date: "2026-09-27", teamIds: ["4"], description: "Acquired G Buddy Hield from Charlotte in exchange for G Rob Dillingham." },
        { id: "t3", date: "2026-08-20", teamIds: ["30"], description: "Acquired G Dennis Schroder from Cleveland." },
        { id: "t4", date: "2026-09-29", teamIds: ["9"], description: "Re-signed G Stephen Curry to a contract extension. Waived G Someone Else." },
        { id: "t5", date: "2026-09-25", teamIds: ["8"], description: "Waived F Jalen Duren." },
        { id: "t6", date: "2026-07-06", teamIds: ["2"], description: "Acquired F Paul George from the Philadelphia 76ers in exchange for draft considerations." },
        { id: "t7", date: "2026-07-06", teamIds: ["20"], description: "Acquired G Jaylen Brown from the Boston Celtics." },
        { id: "t8", date: "2026-07-06", teamIds: ["1"], description: "Acquired G Aaron Wiggins from the Oklahoma City Thunder in exchange for draft considerations." },
        { id: "t9", date: "2026-07-06", teamIds: ["25"], description: "Acquired draft considerations from Atlanta Hawks for G Aaron Wiggins." },
      ],
      tradeWindowStart: "2026-06-01",
      now: new Date("2026-09-30T13:00:00Z"),
    },
    { resolveText: resolveLedger, playerName: ctx.playerName, teamName: ctx.teamName }
  );

  const curry = linked.clusters.find((c) => c.linkedPlayerIds.includes("3975"))!;
  assert.equal(curry.state, "completed", "extension in the ledger resolves the story");
  assert.ok(linked.resolutions.some((r) => r.clusterId === curry.id && r.outcome === "materialized" && r.transactionRef === "t4"));

  const duren = linked.clusters.find((c) => c.linkedPlayerIds.includes("4433621"))!;
  assert.equal(duren.state, "unresolved", "a waiver is not a signing");

  const kawhiOld = linked.clusters.find((c) => c.linkedPlayerIds.includes("6450") && c.firstSeenAt.startsWith("2026-06"))!;
  assert.equal(kawhiOld.state, "expired", "no reports for 60+ days");

  const hornetsBulls = linked.clusters.filter((c) => c.linkedPlayerIds.includes("2990984"));
  assert.equal(hornetsBulls.length, 1, "both sides of one trade form one cluster");
  assert.equal(hornetsBulls[0]!.state, "completed");
  assert.deepEqual(
    hornetsBulls[0]!.deal?.sides.map((s) => [s.teamId, s.receives.map((a) => a.label)]),
    [
      ["30", ["Rob Dillingham"]],
      ["4", ["Buddy Hield"]],
    ]
  );

  // Half-entries that don't mirror: Boston's line alone says it sent draft
  // considerations, Philadelphia's own entry doesn't list them.
  const sidesOf = (teamId: string) =>
    linked.clusters.find((c) => c.deal?.sides.some((s) => s.teamId === teamId))!.deal!;
  const brownGeorge = sidesOf("20");
  assert.deepEqual(
    brownGeorge.sides.map((s) => [s.teamId, s.receives.map((a) => a.label)]),
    [
      ["2", ["Paul George"]],
      ["20", ["Jaylen Brown"]],
    ]
  );
  assert.deepEqual(brownGeorge.unconfirmed, [
    { label: "draft considerations", nonPlayer: true, claimedByTeamId: "2", toTeamId: "20" },
  ]);

  // Mirrored entries confirm each other, so nothing is held back.
  const wiggins = sidesOf("25");
  assert.deepEqual(
    wiggins.sides.map((s) => [s.teamId, s.receives.map((a) => a.label)]),
    [
      ["1", ["Aaron Wiggins"]],
      ["25", ["draft considerations"]],
    ]
  );
  assert.equal(wiggins.unconfirmed, undefined);

  // A one-sided ledger row keeps the other team blank, not empty-handed.
  const schroderSides = linked.clusters.find((c) => c.linkedPlayerIds.includes("3032979"))!.deal!.sides;
  assert.deepEqual(schroderSides.map((s) => [s.teamId, s.receives.length]), [["30", 1], ["5", 0]]);

  // Full names only in ledger text: "Dennis Schroder" is not RayJ Dennis.
  const schroder = linked.clusters.find((c) => c.linkedPlayerIds.includes("3032979"))!;
  assert.deepEqual(schroder.linkedPlayerIds, ["3032979"]);
}

function testDealSides() {
  const ledgerCtx = { resolveText: resolveLedger, playerName: ctx.playerName, teamName: ctx.teamName };
  const row = (teamId: string, description: string) => ({ id: "x", date: "2026-07-06", teamIds: [teamId], description });
  const pairs = (rowsOut: ReturnType<typeof parseTradeRow>) =>
    rowsOut.map((r) => `${r.fromTeamId ?? "?"}>${r.teamId}:${r.label}`);

  assert.deepEqual(
    pairs(parseTradeRow(row("14", "Re-signed F Andrew Wiggins to a veteran extension. Acquired Fs Giannis Antetokounmpo and Bobby Portis from the Milwaukee Bucks in exchange for Gs Tyler Herro, Jaime Jaquez Jr. and Kasparas Jakucionis, C Kel'el Ware and draft considerations."), ledgerCtx)),
    [
      "15>14:Giannis Antetokounmpo",
      "15>14:Bobby Portis",
      "14>15:Tyler Herro",
      "14>15:Jaime Jaquez Jr.",
      "14>15:Kasparas Jakucionis",
      "14>15:Kel'el Ware",
      "14>15:draft considerations",
    ]
  );
  assert.deepEqual(
    pairs(parseTradeRow(row("1", "Acquired G Ryan Nembhard from Dallas and G Luguentz Dort from Oklahoma City in a three-team trade that sent F Zaccharie Risacher to Dallas. Dallas received draft consideration from Atlanta, while Oklahoma City received draft considerations from Atlanta and Dallas."), ledgerCtx)),
    [
      "1>6:Zaccharie Risacher",
      "6>1:Ryan Nembhard",
      "25>1:Luguentz Dort",
      "1>6:draft consideration",
      "?>25:draft considerations",
    ]
  );
  assert.deepEqual(
    pairs(parseTradeRow(row("27", "Acquired G Tre Mann from Charlotte. Received draft considerations from LA Clippers."), ledgerCtx)),
    ["30>27:Tre Mann", "12>27:draft considerations"]
  );
  // "L.A." does not end the sentence.
  assert.deepEqual(
    pairs(parseTradeRow(row("8", "Acquired F John Collins from the L.A. Clippers. Acquired F Taurean Prince from Milwaukee."), ledgerCtx)),
    ["12>8:John Collins", "15>8:Taurean Prince"]
  );
}

/** Stories complete only when the move lands with a named team; otherwise they fall through. */
function testOutcomes() {
  const teamNames: Record<string, string> = {
    "2": "Celtics", "4": "Bulls", "8": "Pistons", "12": "Clippers", "13": "Lakers", "18": "Knicks", "28": "Raptors",
  };
  const ledgerCtx = { resolveText: resolveLedger, playerName: ctx.playerName, teamName: (id: string) => teamNames[id] };
  const run = (newsRows: MovementNewsRow[], ledger: Parameters<typeof linkLedger>[0]["ledger"], now: string) => {
    const news = buildNewsClusters(newsRows, { ...ctx, teamName: ledgerCtx.teamName });
    return linkLedger(
      { newsClusters: news.clusters, newsClaims: news.claims, families: news.families, ledger, tradeWindowStart: "2026-06-01", now: new Date(now) },
      ledgerCtx
    );
  };
  const story = (linked: ReturnType<typeof run>, playerId: string) =>
    linked.clusters.find((c) => c.linkedPlayerIds.includes(playerId) && !c.id.startsWith("mv-tx-"))!;

  const kawhiTrade = [
    { id: "nba-tx-tor", date: "2026-09-14", teamIds: ["28"], description: "Acquired forward Kawhi Leonard from LA Clippers in exchange for guard Gradey Dick and draft consideration." },
    { id: "nba-tx-lac", date: "2026-09-14", teamIds: ["12"], description: "Acquired guard Gradey Dick and draft consideration from Toronto Raptors in exchange for forward Kawhi Leonard." },
  ];

  // NBA.com gap rows resolve a story ESPN never logged.
  const done = run(rows.filter((r) => r.id === "f" || r.id === "g"), kawhiTrade, "2026-09-30T12:00:00Z");
  const agreed = done.clusters.find((c) => c.linkedPlayerIds.includes("6450") && c.firstSeenAt.startsWith("2026-09"))!;
  assert.equal(agreed.state, "completed");
  assert.ok(done.claims.some((c) => c.clusterId === agreed.id && c.sourceLabel === "Player movement log"));
  assert.ok(done.sources["ledger:nba-player-movement"]);
  // The June story went quiet for 60+ days before the trade, so it expires instead.
  const june = done.clusters.find((c) => c.linkedPlayerIds.includes("6450") && c.firstSeenAt.startsWith("2026-06"))!;
  assert.equal(june.state, "expired");
  assert.equal(done.clusters.filter((c) => c.id.startsWith("mv-tx-")).length, 0, "the story owns the deal");

  // Traded, but not to the team the reports named.
  const lakers: MovementNewsRow = { id: "l", url: "https://x/l", outlet: "ESPN", publishedAt: "2026-09-10T10:00:00Z", title: "Sources: Lakers in talks to acquire Kawhi Leonard" };
  const elsewhere = run([lakers], kawhiTrade, "2026-09-30T12:00:00Z");
  const missed = story(elsewhere, "6450");
  assert.equal(missed.state, "fell_through");
  assert.equal(missed.resolutionNote, "Traded to the Raptors. Reports had named the Lakers.");
  assert.equal(elsewhere.resolutions.find((r) => r.clusterId === missed.id)?.outcome, "partially_materialized");
  assert.equal(elsewhere.fellThrough, 1);

  // Signed with a team the reports didn't name.
  const kat = rows.filter((r) => r.id === "c" || r.id === "d");
  const signedElsewhere = run(kat, [{ id: "s1", date: "2026-10-02", teamIds: ["2"], description: "Signed C Karl-Anthony Towns to a contract." }], "2026-10-03T12:00:00Z");
  assert.equal(story(signedElsewhere, "3136195").state, "fell_through");
  assert.equal(story(signedElsewhere, "3136195").resolutionNote, "Signed with the Celtics. Reports had named the Knicks.");

  // Re-signing with the team in talks completes it.
  const resigned = run(kat, [{ id: "s2", date: "2026-10-02", teamIds: ["18"], description: "Re-signed C Karl-Anthony Towns to a contract extension." }], "2026-10-03T12:00:00Z");
  assert.equal(story(resigned, "3136195").state, "completed");

  // Traded away before an extension with the Knicks.
  const tradedAway = run(
    kat,
    [
      { id: "k1", date: "2026-10-02", teamIds: ["4"], description: "Acquired C Karl-Anthony Towns from the New York Knicks in exchange for G Buddy Hield." },
      { id: "k2", date: "2026-10-02", teamIds: ["18"], description: "Acquired G Buddy Hield from the Chicago Bulls in exchange for C Karl-Anthony Towns." },
    ],
    "2026-10-03T12:00:00Z"
  );
  const katStory = story(tradedAway, "3136195");
  assert.equal(katStory.state, "fell_through");
  assert.equal(katStory.resolutionNote, "Traded to the Bulls before a new deal with the Knicks.");
  assert.equal(tradedAway.resolutions.find((r) => r.clusterId === katStory.id)?.outcome, "did_not_materialize");
  assert.ok(tradedAway.clusters.some((c) => c.id.startsWith("mv-tx-")), "the trade still gets its own card");
  assert.equal(new Set(tradedAway.claims.map((c) => c.id)).size, tradedAway.claims.length, "claim ids stay unique");

  // Trade stories close when the deadline passes with no deal, after a two-day grace.
  const winter: MovementNewsRow = { id: "w", url: "https://x/w", outlet: "ESPN", publishedAt: "2027-01-20T10:00:00Z", title: "Sources: Lakers in talks to acquire Kawhi Leonard" };
  assert.equal(story(run([winter], [], "2027-02-12T20:00:00Z"), "6450").state, "unresolved");
  const closed = story(run([winter], [], "2027-02-14T12:00:00Z"), "6450");
  assert.equal(closed.state, "fell_through");
  assert.equal(closed.resolutionNote, "No trade by the Feb 11, 2027 deadline.");
}

/** A signing ESPN posts after the bake closes the open story at request time. */
function testLiveResolve() {
  const baked = JSON.parse(
    readFileSync("data/movement-center/v1/snapshot.json", "utf8")
  ) as MovementCuratedSnapshot;
  const id = "mv-contract-4433621-20260921";
  const isLedger = (claimId: string) => claimId.startsWith("mv-espn-tx-");
  const snapshot: MovementCuratedSnapshot = {
    ...baked,
    clusters: [
      {
        id,
        headline: "Jalen Duren: contract talks with the Pistons",
        primaryClaimId: "mv-fdd1a0413a00cec6",
        claimIds: ["mv-fdd1a0413a00cec6"],
        evidenceClass: "reported",
        state: "unresolved",
        firstSeenAt: "2026-09-21T21:08:33.000Z",
        lastMeaningfulAt: "2026-09-30T22:22:41.000Z",
        linkedPlayerIds: ["4433621"],
        linkedTeamIds: ["8"],
      },
    ],
    claims: baked.claims.filter((c) => c.clusterId === id && !isLedger(c.id)),
    resolutions: [],
  };

  const signing = {
    id: "espn-tx-48599cfb4807969c",
    date: "2026-10-02",
    description: "Re-signed C Jalen Duren to a contract.",
    teamIds: ["8"],
  };
  const now = new Date("2026-10-02T20:00:00Z");
  const out = resolveOpenStoriesWithLedger(snapshot, [signing], (pid) => names.get(pid), now);
  const story = out.clusters.find((c) => c.id === id)!;
  assert.equal(story.state, "completed");
  assert.ok(story.claimIds.includes(`mv-${signing.id}`));
  assert.equal(out.resolutions?.find((r) => r.clusterId === id)?.outcome, "materialized");
  assert.equal(out.clusters.length, snapshot.clusters.length);
  assert.equal(snapshot.clusters.find((c) => c.id === id)?.state, "unresolved", "input not mutated");

  // Running it again on the result adds nothing.
  const again = resolveOpenStoriesWithLedger(out, [signing], (pid) => names.get(pid), now);
  assert.equal(again.claims.length, out.claims.length);

  // A waiver is not a signing.
  const waived = { ...signing, id: "espn-tx-waived", description: "Waived C Jalen Duren." };
  const untouched = resolveOpenStoriesWithLedger(snapshot, [waived], (pid) => names.get(pid), now);
  assert.equal(untouched.clusters.find((c) => c.id === id)?.state, "unresolved");
}

testClassifier();
testSurnameGuard();
testReporters();
testDealSides();
testClustering();
testLedger();
testOutcomes();
testLiveResolve();
console.log("movement ingest tests passed");
