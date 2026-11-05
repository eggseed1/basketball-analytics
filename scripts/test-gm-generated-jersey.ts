import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FRANCHISES } from "../src/gm/seed/franchises";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { applyTrade } from "../src/gm/engine/trades";
import { generatedJerseyStyle } from "../src/gm/lib/generated-player-jersey";
import { generatedPortraitRecipe, GmGeneratedPortrait } from "../src/gm/ui/gm-generated-portrait";
import { portraitSeedForId } from "../src/gm/lib/generated-player-identity";
import { resolveTeamBrand } from "../src/lib/nba-brand";
import type { GmPlayer } from "../src/gm/types";

const id = "prospect-2035-17-jersey-test";
const original = {
  id, name: "Malik Adeyemi", teamId: "bos", age: 19, jersey: "23",
  identity: { version: 1, countryCode: "US", hometown: "Chicago, IL",
    portraitSeed: portraitSeedForId(id), temperament: "Team-first", interest: "Gym rat" },
} as GmPlayer;
const html = (player: GmPlayer, size: "xs" | "sm" | "md" | "lg" | "xl" = "xl") =>
  renderToStaticMarkup(createElement(GmGeneratedPortrait, {
    player, size, name: player.name,
  }));
const originalHtml = html(original);
const faceRegion = (markup: string) => {
  const a = markup.indexOf('<g data-face-layer="true">');
  const b = markup.indexOf("<text", a);
  assert.ok(a > 0 && b > a, "rendered SVG must contain isolated facial artwork and uniform lettering");
  return markup.slice(a, b);
};

assert.match(originalHtml, /data-portrait-version="2"/);
assert.match(originalHtml, /data-jersey-layer="true"/);
assert.match(originalHtml, /data-face-layer="true"/);
assert.match(originalHtml, /stroke-width="6.5"/,
  "jersey collar must have a prominent ribbed trim");
assert.match(originalHtml, /M30 164L35 143/,
  "jersey must have a proper sleeveless shoulder and V-neck silhouette");
assert.match(originalHtml, /data-generated-portrait="true"/);
assert.match(originalHtml, /data-jersey-team="bos"/);
assert.match(originalHtml, /data-jersey-color="#007A33"/);
assert.match(originalHtml, />BOS<\/text>/);
assert.match(originalHtml, />23<\/text>/);
assert.match(originalHtml, /aria-label="Malik Adeyemi illustrated portrait in BOS jersey"/);

for (const team of FRANCHISES) {
  const changed = { ...original, teamId: team.id, age: 35 };
  const updatedHtml = html(changed);
  const jersey = generatedJerseyStyle(team.id);
  const brand = resolveTeamBrand(team.id)!;
  assert.equal(jersey.teamId, brand.id);
  assert.equal(jersey.base.toLowerCase(), brand.primary.toLowerCase(),
    "every jersey must follow the team's primary palette");
  assert.equal(jersey.abbreviation, team.abbr);
  assert.ok(jersey.lettering && jersey.piping);
  assert.match(updatedHtml, new RegExp(`data-jersey-team="${brand.id}"`));
  assert.ok(updatedHtml.includes(`>${team.abbr}</text>`),
    "each team's abbreviation must appear on its jersey");
  assert.equal(faceRegion(originalHtml), faceRegion(updatedHtml),
    "aging and changing teams must never alter facial artwork");
  assert.deepEqual(generatedPortraitRecipe(original.identity!.portraitSeed),
    generatedPortraitRecipe(changed.identity!.portraitSeed));
}
const unsigned = html({ ...original, teamId: null });
assert.match(unsigned, /data-jersey-team="free-agent"/);
assert.match(unsigned, /data-jersey-color="#4b5563"/);
assert.match(unsigned, />FA<\/text>/);
assert.equal(faceRegion(unsigned), faceRegion(originalHtml),
  "free agency must remove club colors without altering identity");
const small = html(original, "xs");
assert.match(small, /data-jersey-color="#007A33"/);
assert.ok(!small.includes(">BOS</text>"),
  "smallest portraits should stay clear instead of rendering illegible text");
const compact = html(original, "sm");
assert.ok(!compact.includes(">BOS</text>") && !compact.includes(">23</text>"),
  "small portraits must emphasize faces instead of micro-jersey lettering");
const medium = html(original, "md");
assert.ok(!medium.includes(">BOS</text>"), "medium avatars avoid illegible uniform lettering");
const largeOther = html({ ...original, teamId: "lal" }, "xl");
assert.match(largeOther, /data-jersey-color="#552583"/);
assert.match(largeOther, />LAL<\/text>/);
assert.equal(faceRegion(largeOther), faceRegion(originalHtml));
assert.notEqual(originalHtml, largeOther, "uniform must visibly change on trade");
assert.ok(!html({ ...original, jersey: "suspicious<script>" }).includes("suspicious"),
  "only valid numeric jersey numbers are rendered");
assert.ok(!html({ ...original, jersey: "" }).includes(">23</text>"),
  "player's actual jersey should disappear when unset");
// The real trade engine moves the player via teamId. Portrait props should
// pick up that change, without an explicit avatar refresh or save rewrite.
const league = createGeneratedLeague({ userTeamId: "bos", season: 2029, seed: 1788 });
const candidate = league.players.find(p => p.teamId === "bos" && p.identity)!;
assert.ok(candidate);
const traded = applyTrade(league, {
  fromTeamId: "bos", toTeamId: "lal",
  fromAssets: [{ type: "player", id: candidate.id }],
  toAssets: [],
});
const moved = traded.players.find(p => p.id === candidate.id)!;
assert.equal(moved.teamId, "lal");
assert.deepEqual(moved.identity, candidate.identity);
assert.equal(faceRegion(html({ ...candidate, jersey: "12" })),faceRegion(html({ ...moved, jersey: "12" })));
assert.match(html({ ...candidate, jersey: "12" }), /data-jersey-team="bos"/);
assert.match(html({ ...moved, jersey: "12" }), /data-jersey-team="lal"/);
const recipes = Array.from({ length: 750 }, (_, index) =>
  generatedPortraitRecipe(portraitSeedForId("procedural-variety-" + index)));
const signatures = new Set(recipes.map(r => [
  r.headWidth,r.jawWidth,r.chinDepth,r.cheekWidth,r.noseWidth.toFixed(1),
  r.noseLength.toFixed(1),r.eyeSpacing,r.eyeHeight,r.eyeTilt,r.browThickness.toFixed(1),
  r.lipWidth.toFixed(1),r.style,r.beard,r.glasses,
].join(":")));
assert.ok(signatures.size >= 740, "750 generated rookies must look distinctly different");
assert.ok(new Set(recipes.map(r=>r.style)).size >= 12, "the hair system must offer twelve distinct silhouettes");
assert.ok(new Set(recipes.map(r=>r.jawWidth)).size >= 8, "jaw shape should vary across the league");
assert.ok(recipes.some(r=>r.glasses) && recipes.some(r=>r.freckles), "minor details must be seed-driven");
const otherIdentity = { ...original, identity: {
  ...original.identity!, countryCode: "JP", hometown: "Osaka" } };
assert.equal(faceRegion(html(otherIdentity)), faceRegion(originalHtml),
  "nationality cannot alter complexion, facial morphology or hair");
console.log("Generated jerseys and faces: 30 team uniforms, stable trades, 750 diverse identities, facial independence and jersey safety passed");
