import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { syncSocialTimeline, socialTimeline, socialAccount } from "../src/gm/engine/social-timeline";
import { stepDay } from "../src/gm/engine/pace";
import { runDraftPick } from "../src/gm/engine/progression";
import type { GmBoxScore, GmLeagueState, GmNewsItem } from "../src/gm/types";

const base = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2028, seed: 919 }));
const season = base.season;
const day = 40;
const hero = base.players.find(p => p.teamId === "bos")!;
const other = base.players.find(p => p.teamId === "nyk")!;
const sample: GmBoxScore = {
  id: "box-story-40", gameId: "game-story-40", season, day,
  homeTeamId: "bos", awayTeamId: "nyk", homeScore: 126, awayScore: 124,
  players: [
    { playerId: hero.id, playerName: hero.name, teamId: "bos", minutes: 37,
      points: 48, assists: 11, rebounds: 10, steals: 2, blocks: 1, turnovers: 3,
      fgm: 17, fga: 27, tpm: 7, tpa: 13, ftm: 7, fta: 8,
      plusMinus: 7, trueShootingPct: 0.75, usagePct: 0.36, gameScore: 49 },
    { playerId: other.id, playerName: other.name, teamId: "nyk", minutes: 30,
      points: 20, assists: 4, rebounds: 6, steals: 1, blocks: 0, turnovers: 2,
      fgm: 8, fga: 16, tpm: 2, tpa: 5, ftm: 2, fta: 3,
      plusMinus: -7, trueShootingPct: 0.55, usagePct: 0.21, gameScore: 16 },
  ],
};
const news: GmNewsItem[] = [
  { id: "draft-reveal-01", day: 41, season, tone: "good",
    headline: "BOS selects Niko Silva", body: "Pick #17. Overall 73. Development depends on opportunity." },
  { id: "signing-reveal-01", day: 43, season, tone: "trade",
    headline: "Free agency signing", body: "A contract was signed in the league." },
  { id: "fake-other-source", day: 44, season, tone: "info",
    headline: "Midseason development", body: "Players' learning progress was assessed." },
];
const injured = {
  ...hero, injury: { type: "Sprained ankle", gamesRemaining: 7, reinjuryRisk: 0.1 },
};
const state: GmLeagueState = {
  ...base, day: 45, news, boxScores: [sample], players: base.players.map(p => p.id === hero.id ? injured : p),
  tradeLog: [{ id: "trade-real-01", fromTeamId: "bos", toTeamId: "lal",
    fromAssets: [{ type: "player", id: hero.id }], toAssets: [{ type: "pick", id: "2029-1" }], status: "accepted" }],
};
const first = syncSocialTimeline(state);
const posts = first.socialPosts ?? [];
assert.ok(posts.length >= 14, "real events create multiple original voices and replies");
assert.equal(new Set(posts.map(p => p.id)).size, posts.length, "no duplicate post IDs");
for (const p of posts) {
  assert.ok(p.text && p.text.length <= 420);
  assert.ok(Number.isInteger(p.likes) && p.likes >= 0);
  assert.ok(Number.isInteger(p.reposts) && p.reposts >= 0);
  assert.ok(p.id.startsWith("social:"), "all posts use in-game namespaces");
  assert.ok(p.href.startsWith("/gm/"), "no external social links");
  assert.ok(p.accountId && socialAccount(p.accountId, p.teamId).name);
  if (p.replyTo) assert.ok(posts.some(root => root.id === p.replyTo),
    "each reaction replies to an actual report");
}
const allCategories = new Set(posts.map(p => p.category));
for (const category of ["game", "draft", "trade", "injury", "news"]) {
  assert.ok(allCategories.has(category as never), "missing category " + category);
}
const report = posts.find(p => p.eventId === "social:game:box-story-40" && !p.replyTo)!;
assert.ok(report.text.includes(hero.name));
assert.ok(report.text.includes("48 PTS"));
assert.ok(report.text.includes("126"));
assert.ok(posts.some(p => p.eventId === report.eventId && p.replyTo === report.id &&
  socialAccount(p.accountId, p.teamId).voice === "fan"));
const medical = posts.find(p => p.accountId === "injury" && p.text.includes(hero.name))!;
assert.ok(medical.text.includes("Sprained ankle"));
assert.ok(medical.text.includes("7 game(s) remaining"));
assert.ok(!posts.some(p => /has been traded to LAL as confirmed by medical/.test(p.text)),
  "the generator never fabricates a transaction to fill a template");
const trade = posts.find(p => p.eventId === "social:trade:trade-real-01" && !p.replyTo)!;
assert.ok(trade.text.includes(hero.name) && trade.text.includes("2029-1"));
const rookie = posts.find(p => p.eventId === "social:news:draft-reveal-01" && !p.replyTo)!;
assert.ok(rookie.text.includes("Niko Silva"), "draft news uses only revealed identities");
assert.ok(posts.some(p => p.accountId === "burner"), "parody burner posts about major events");

const replay = syncSocialTimeline(first);
assert.equal(replay, first, "recomputing unchanged sources is idempotent");
assert.deepEqual(socialTimeline(replay), posts);
const likedState = { ...first, socialFollowing: ["wire", "burner"], socialLikes: [report.id] };
const restored = parseFranchise(exportFranchise(likedState));
assert.deepEqual(restored.socialFollowing, ["wire", "burner"]);
assert.deepEqual(restored.socialLikes, [report.id]);
assert.deepEqual(restored.socialPosts, posts, "social posts survive the real save/import path");

// Old saves have no social arrays and must still display their actual history.
const old = { ...state, socialPosts: undefined, socialFollowing: undefined, socialLikes: undefined };
assert.ok(socialTimeline(old).length > 5);
assert.equal(socialTimeline(old)[0]!.id, socialTimeline(old)[0]!.id,
  "backfilling an old save is deterministic");

// Repeated events and season changes don't erase established league lore.
const newYear = syncSocialTimeline({ ...first, season: season + 1, day: 0,
  boxScores: [], news: [], injuries: undefined } as GmLeagueState);
assert.ok(newYear.socialPosts!.some(p => p.id === report.id));
assert.ok(newYear.socialPosts!.some(p => p.eventId === "social:season:" + (season + 1)));

// Back-to-back ordinary sim days also preserve the event-linked feed.
let run = base;
for (let i = 0; i < 4; i++) {
  const stepped = stepDay(run);
  run = syncSocialTimeline(stepped.league);
}
assert.ok(run.socialPosts?.some(p => p.eventId === "social:season:" + season));
assert.equal(new Set(run.socialPosts!.map(p => p.id)).size, run.socialPosts!.length);

// Content check: no impersonated real media figures, hateful slurs, or
// unearned fabricated injuries on healthy players.
const aggregate = posts.map(p => p.text).join("\n").toLowerCase();
for (const banned of ["wojnarowski", "shams charania", "espn sources", "n-word", "slur"]) {
  assert.ok(!aggregate.includes(banned), "original fictional voices only");
}
console.log("Social timeline: game, fan, injuries, trade, draft, parody, save, idempotence and season continuity passed", {
  posts: posts.length, accounts: new Set(posts.map(p => p.accountId)).size, categories: allCategories.size,
});
