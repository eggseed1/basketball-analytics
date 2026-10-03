/**
 * Acquisition paths: ESPN ledger text rules and the how-they-got-him story.
 * Run: npx tsx scripts/test-acquisition-paths.ts
 */
import assert from "node:assert/strict";
import Module from "node:module";

import { parseRosterMoves, parseTradeText } from "../src/lib/espn-ledger-text";

process.env.DRBL_LIVE_TRANSACTIONS = "off";

const receipts = (description: string, team: string) =>
  parseTradeText(description, team).map((r) => `${r.fromTeamId ?? "?"}>${r.teamId ?? "?"}:${r.label}`);

function testTradeText() {
  // "Traded X to Team for Y" (Oklahoma City's half of the 2012 Harden trade).
  assert.deepEqual(
    receipts(
      "Traded G James Harden to Houston for G Kevin Martin, G Jeremy Lamb, two first-round draft picks and a second-round draft pick. Waived G Andy Rautins.",
      "25"
    ),
    [
      "25>10:James Harden",
      "10>25:Kevin Martin",
      "10>25:Jeremy Lamb",
      "10>25:two first-round draft picks",
      "10>25:a second-round draft pick",
    ]
  );

  // "Received X from Team in exchange for Y" (Dallas's half of the Luka trade).
  assert.deepEqual(
    receipts(
      "Received G Max Christie, F Anthony Davis and a 2029 first-round draft pick from the Los Angeles Lakers in exchange for Fs Luka Doncic, Maxi Kleber and Markieff Morris.",
      "6"
    ),
    [
      "13>6:Max Christie",
      "13>6:Anthony Davis",
      "13>6:a 2029 first-round draft pick",
      "6>13:Luka Doncic",
      "6>13:Maxi Kleber",
      "6>13:Markieff Morris",
    ]
  );

  // Third-person "Team sent X to Team2" (Golden State's row on the Brooks trade).
  assert.deepEqual(
    receipts(
      "Sent G Toney Douglas to Miami, who sent C Joel Anthony, a 2015 first-round draft pick and cash considerations to Boston. Boston sent Gs Jordan Crawford and MarShon Brooks to Golden State.",
      "9"
    ),
    [
      "9>14:Toney Douglas",
      "14>2:Joel Anthony",
      "14>2:a 2015 first-round draft pick",
      "14>2:cash considerations",
      "2>9:Jordan Crawford",
      "2>9:MarShon Brooks",
    ]
  );

  // Old position words and a "Jr." mid-package.
  assert.deepEqual(
    receipts(
      "Acquired forward Kevin Garnett from the Minnesota Timberwolves for forwards Al Jefferson, Gerald Green and Ryan Gomes, guard Sebastian Telfair, center Theo Ratliff and two first-round picks.",
      "2"
    ),
    [
      "16>2:Kevin Garnett",
      "2>16:Al Jefferson",
      "2>16:Gerald Green",
      "2>16:Ryan Gomes",
      "2>16:Sebastian Telfair",
      "2>16:Theo Ratliff",
      "2>16:two first-round picks",
    ]
  );
  assert.deepEqual(
    receipts(
      "Acquired Fs Giannis Antetokounmpo and Bobby Portis from the Milwaukee Bucks in exchange for Gs Tyler Herro, Jaime Jaquez Jr. and Kasparas Jakucionis, C Kel'el Ware and draft considerations.",
      "14"
    ).slice(2, 4),
    ["14>15:Tyler Herro", "14>15:Jaime Jaquez Jr."]
  );

  // "Acquired X in exchange for Y" with no sending team named.
  assert.deepEqual(
    receipts("Acquired G James Harden in exchange for C Jarrett Allen and G Caris LeVert.", "17"),
    ["?>17:James Harden", "17>?:Jarrett Allen", "17>?:Caris LeVert"]
  );

  // A second "were returned ... in exchange for ..." clause is dropped, not misread.
  assert.deepEqual(
    receipts(
      "Acquired Fs P.J. Tucker and Rodions Kurucs from Houston in exchange for G D.J. Augustin and F D.J. Wilson and were returned their own 2022 first-round draft pick and a Houston 2021 second-round draft pick in exchange for Milwaukee's 2021 and 2023 first-round draft picks.",
      "15"
    ),
    ["10>15:P.J. Tucker", "10>15:Rodions Kurucs", "15>10:D.J. Augustin", "15>10:D.J. Wilson"]
  );

  // Old team names.
  assert.deepEqual(receipts("Acquired G Ray Allen from Seattle for G Delonte West.", "2"), [
    "25>2:Ray Allen",
    "2>25:Delonte West",
  ]);
}

function testRosterMoves() {
  const moves = (d: string) => parseRosterMoves(d).map((m) => `${m.kind}:${m.label}`);
  assert.deepEqual(
    moves("Signed forward Al Jefferson and guards Delonte West and Tony Allen, their first-round picks in the 2004 draft."),
    ["draft:Al Jefferson", "draft:Delonte West", "draft:Tony Allen"]
  );
  assert.deepEqual(
    moves("Signed forward Kris Humphries and guard Kirk Snyder, their 2004 first-round picks, to three-year contracts."),
    ["draft:Kris Humphries", "draft:Kirk Snyder"]
  );
  // An option exercise is not an arrival; only the signing clause counts.
  assert.deepEqual(
    moves("Exercised their 2007-08 club options on guards Delonte West, Gerald Green and Sebastian Telfair and forward Al Jefferson; signed guard Allan Ray."),
    ["signing:Allan Ray"]
  );
  assert.deepEqual(moves("Signed G Kyrie Irving and C DeAndre Jordan."), [
    "signing:Kyrie Irving",
    "signing:DeAndre Jordan",
  ]);
  assert.deepEqual(moves("Signed F Kevin Garnett to a five-year contract extension."), [
    "re-signing:Kevin Garnett",
  ]);
  assert.deepEqual(moves("Re-signed G Kyrie Irving to a contract."), ["re-signing:Kyrie Irving"]);
  assert.deepEqual(moves("Signed Gs Rob Dillingham and Terrence Shannon Jr. to rookie scale contracts."), [
    "draft:Rob Dillingham",
    "draft:Terrence Shannon Jr.",
  ]);
  assert.deepEqual(moves("Waived G Andy Rautins, C Daniel Orton and F Hollis Thompson."), [
    "waive:Andy Rautins",
    "waive:Daniel Orton",
    "waive:Hollis Thompson",
  ]);
  assert.deepEqual(moves("Claimed F Jordan Hamilton off waivers from Houston."), ["claim:Jordan Hamilton"]);
}

async function testStories() {
  type Loader = (this: unknown, req: string, ...rest: unknown[]) => unknown;
  const mod = Module as unknown as { _load: Loader };
  const origLoad = mod._load;
  mod._load = function (req, ...rest) {
    if (req === "server-only") return {};
    return origLoad.call(this, req, ...rest);
  };
  const { getAcquisitionStory, getLatestArrival } = await import("../src/data/queries/acquisition-paths");
  const storyOf = async (teamId: string, player: string) => {
    const { story } = await getAcquisitionStory({ teamId, player });
    assert.ok(story, `${teamId} ${player} story exists`);
    return story;
  };
  const labels = (assets: { label: string }[]) => assets.map((a) => a.label);

  // Root deal is the 2012 Oklahoma City trade, and the 2021 exit is a trade even
  // though neither row of that four-team deal names the other team.
  const harden = await storyOf("10", "James Harden");
  assert.equal(harden.arrival.how, "trade");
  if (harden.arrival.how === "trade") {
    assert.equal(harden.arrival.date, "2012-10-27");
    assert.equal(harden.arrival.fromTeamId, "25");
    assert.deepEqual(labels(harden.arrival.gave).slice(0, 2), ["Kevin Martin", "Jeremy Lamb"]);
  }
  assert.equal(harden.afterwards.departure.how, "trade");
  if (harden.afterwards.departure.how === "trade") assert.equal(harden.afterwards.departure.toTeamId, "17");

  // Dallas's row says "Received", which the old parser skipped.
  const luka = await storyOf("13", "Luka Doncic");
  assert.ok(luka.player.playerId, "Luka resolves to a player id");
  if (luka.arrival.how === "trade") {
    assert.equal(luka.arrival.fromTeamId, "6");
    assert.deepEqual(labels(luka.arrival.gave), ["Max Christie", "Anthony Davis", "a 2029 first-round draft pick"]);
    const ad = luka.origins.find((o) => o.asset.label === "Anthony Davis");
    assert.equal(ad?.arrival.how, "trade");
    if (ad?.arrival.how === "trade") {
      assert.deepEqual(
        labels(ad.arrival.deal.sides.find((s) => s.teamId === "3")?.receives ?? []).slice(0, 2),
        ["Moritz Wagner", "Jemerrio Jones"],
        "the Pelicans' side lists what the Lakers' row says they gave"
      );
    }
  } else assert.fail("Luka arrived by trade");

  // The whole package, Jr. included, and each piece's draft slot.
  const giannis = await storyOf("14", "Giannis Antetokounmpo");
  if (giannis.arrival.how === "trade") {
    assert.deepEqual(labels(giannis.arrival.gave), [
      "Tyler Herro",
      "Jaime Jaquez Jr.",
      "Kasparas Jakučionis",
      "Kel'el Ware",
      "draft considerations",
    ]);
    const herro = giannis.origins.find((o) => o.asset.label === "Tyler Herro");
    assert.deepEqual(herro?.arrival.how === "draft" ? herro.arrival.draft : null, { year: 2019, round: 1, pick: 13 });
  } else assert.fail("Giannis arrived by trade");

  // Forward from Garnett: the Brooklyn picks become Smart and, two trades later,
  // Kyrie, who leaves in free agency.
  const kg = await storyOf("2", "Kevin Garnett");
  assert.equal(kg.afterwards.departure.how, "trade");
  if (kg.afterwards.departure.how === "trade") assert.equal(kg.afterwards.departure.toTeamId, "17");
  const pick2014 = kg.afterwards.next.find((n) => n.asset.label === "a 2014 first-round draft pick");
  assert.equal(pick2014?.departure.how, "used");
  if (pick2014?.departure.how === "used") assert.ok(pick2014.departure.candidates.some((c) => c.label === "Marcus Smart"));
  const pick2018 = kg.afterwards.next.find((n) => n.asset.label === "a 2018 first-round draft pick");
  const kyrie = pick2018?.next.find((n) => n.asset.label === "Kyrie Irving");
  assert.deepEqual(
    kyrie?.departure.how === "left" ? [kyrie.departure.toTeamId, kyrie.departure.via] : null,
    ["17", "signing"]
  );
  const telfair = kg.origins.find((o) => o.asset.label === "Sebastian Telfair");
  const ratliff = kg.origins.find((o) => o.asset.label === "Theo Ratliff");
  assert.ok(telfair && !telfair.repeat && ratliff?.repeat, "a shared origin deal expands once");

  const bknKg = await storyOf("17", "Kevin Garnett");
  assert.equal(bknKg.arrival.how === "trade" ? bknKg.arrival.date : null, "2013-07-12");

  const horford = await storyOf("2", "Al Horford");
  if (horford.arrival.how === "trade") {
    assert.equal(horford.arrival.date, "2021-06-18");
    assert.deepEqual(labels(horford.arrival.gave), ["Kemba Walker"]);
    const kemba = horford.origins.find((o) => o.asset.label === "Kemba Walker");
    assert.equal(kemba?.arrival.how, "signing");
  } else assert.fail("Horford's 2021 return was a trade");

  const curry = await storyOf("9", "Stephen Curry");
  assert.deepEqual(curry.arrival.how === "draft" ? curry.arrival.draft : null, { year: 2009, round: 1, pick: 7 });
  assert.equal(curry.afterwards.departure.how, "here");

  // Re-signings never open a second stint.
  assert.equal(curry.stints.length, 1);

  const tatumId = (await getAcquisitionStory({ teamId: "2", player: "Jayson Tatum" })).story?.player.playerId;
  assert.ok(tatumId);
  assert.equal((await getLatestArrival("2", tatumId!))?.how, "draft");

  // Never in the log: the baked draft history alone gives him a story.
  const edwards = await storyOf("16", "Anthony Edwards");
  assert.deepEqual(edwards.arrival.how === "draft" ? edwards.arrival.draft : null, { year: 2020, round: 1, pick: 1 });

  // His bio has no draft line; the draft history has the slot.
  const jefferson = await storyOf("2", "Al Jefferson");
  assert.deepEqual(jefferson.arrival.how === "draft" ? jefferson.arrival.draft : null, { year: 2004, round: 1, pick: 15 });

  // The 2018 draft-night swap the log never records.
  const lukaDal = await storyOf("6", "Luka Doncic");
  const drafted = lukaDal.arrival.how === "first-seen" ? lukaDal.arrival.draftedBy : undefined;
  assert.deepEqual(drafted && { ...drafted, swappedFor: labels(drafted.swappedFor ?? []) }, {
    teamId: "1",
    year: 2018,
    round: 1,
    pick: 3,
    swappedFor: ["Trae Young"],
  });

  // First logged seven years after the draft: no swap claim.
  const gordon = await storyOf("7", "Aaron Gordon");
  if (gordon.arrival.how === "first-seen") assert.equal(gordon.arrival.draftedBy?.swappedFor, undefined);
}

testTradeText();
testRosterMoves();
testStories()
  .then(() => console.log("acquisition path tests passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
