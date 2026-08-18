/**
 * Canonical Learn registry + explanation adapter + wiring helper tests.
 * Run: npx tsx scripts/test-learn-explanations.ts
 */
import assert from "node:assert/strict";

import { explainMetric, listExplainedMetrics } from "../src/analytics/explanations";
import {
  getLearnConcept,
  learnHrefFor,
  searchLearnConcepts,
} from "../src/content/learn/registry";
import { listAllLearnSlugs, resolveLearnPage } from "../src/content/learn/resolve";
import {
  conceptIdForAskMetric,
  conceptIdForAskStatus,
  conceptIdForColumnLabel,
  conceptIdForFactorId,
} from "../src/lib/learn-column-concepts";

function main() {
  // Alias resolution
  assert.equal(getLearnConcept("trueShooting")?.id, "ts");
  assert.equal(getLearnConcept("ts_pct")?.id, "ts");
  assert.equal(getLearnConcept("usage")?.id, "usg");
  assert.equal(
    getLearnConcept("essentially_even")?.id,
    "essentially_even"
  );
  assert.equal(getLearnConcept("insufficient_data")?.id, "insufficient_evidence");

  // explainMetric derives from registry / guides
  const ts = explainMetric("trueShooting");
  assert.ok(ts);
  assert.equal(ts!.learnHref, "/learn/true-shooting");
  assert.ok(ts!.plain.length > 10);

  const efg = explainMetric("efg");
  assert.ok(efg);
  assert.equal(efg!.learnHref, "/learn/effective-field-goal");

  const cpi = explainMetric("cpi");
  assert.ok(cpi);
  assert.equal(cpi!.learnHref, "/learn/cpi");

  // Unknown / missing concept
  assert.equal(explainMetric("not_a_real_metric_xyz"), null);
  assert.equal(getLearnConcept("not_a_real_metric_xyz") ?? null, null);

  // Every tooltip concept with a learn slug resolves to a page
  for (const c of listExplainedMetrics()) {
    if (!c.learnHref) continue;
    const slug = c.learnHref.replace("/learn/", "");
    assert.ok(resolveLearnPage(slug), `missing page for ${c.id} → ${slug}`);
  }

  // Static params cover guides + topics
  const slugs = listAllLearnSlugs();
  assert.ok(slugs.includes("true-shooting"));
  assert.ok(slugs.includes("cpi"));
  assert.ok(slugs.includes("copeland"));
  assert.ok(slugs.includes("transaction-layers"));
  assert.ok(slugs.includes("trade-exception"));
  assert.ok(slugs.includes("salary-fit-vs-legality"));
  assert.ok(slugs.includes("game-lab"));
  assert.ok(slugs.includes("peak-prime-longevity"));
  assert.ok(slugs.includes("career-arc"));
  assert.ok(slugs.includes("career-self-comparison"));
  assert.ok(slugs.includes("career-resume"));

  // Career arc / Peak · Prime · Longevity education
  assert.equal(getLearnConcept("peak")?.id, "career_peak");
  assert.equal(getLearnConcept("prime")?.id, "career_prime");
  assert.equal(getLearnConcept("longevity")?.id, "career_longevity");
  assert.equal(getLearnConcept("rise")?.id, "career_development");
  assert.equal(getLearnConcept("career_self")?.id, "career_self_comparison");
  assert.equal(
    learnHrefFor("career_peak"),
    "/learn/peak-prime-longevity"
  );
  assert.equal(learnHrefFor("career_arc"), "/learn/career-arc");
  assert.equal(
    learnHrefFor("career_self_comparison"),
    "/learn/career-self-comparison"
  );

  const peakTopic = resolveLearnPage("peak-prime-longevity");
  assert.ok(peakTopic && peakTopic.kind === "topic");
  if (peakTopic?.kind === "topic") {
    const text = [
      peakTopic.topic.oneSentence,
      ...peakTopic.topic.howToInterpret,
      ...peakTopic.topic.caveats,
    ].join(" ");
    assert.match(text, /overlap|⊂|nest/i);
    assert.match(text, /Longevity-only|70–89|70-89/i);
    assert.match(text, /contiguous/i);
    assert.match(text, /percentile/i);
    assert.match(text, /durability|years played/i);
  }

  const arc = resolveLearnPage("career-arc");
  assert.ok(arc && arc.kind === "topic");
  if (arc?.kind === "topic") {
    const text = [...arc.topic.howDrblUses, ...arc.topic.caveats].join(" ");
    assert.match(text, /not part of Career Resume methodology v1/i);
    assert.match(text, /Development/i);
  }

  const self = explainMetric("career_self_comparison");
  assert.ok(self);
  assert.match(self!.plain, /own peak|career_self|percentile/i);

  const longevityOnly = explainMetric("longevity_only");
  assert.ok(longevityOnly);
  assert.match(longevityOnly!.plain, /70|89|longevity/i);

  // Search
  const hits = searchLearnConcepts("Copeland");
  assert.ok(hits.some((h) => h.id === "copeland"));
  const tsHits = searchLearnConcepts("TS%");
  assert.ok(tsHits.some((h) => h.id === "ts"));

  assert.equal(learnHrefFor("darko"), "/learn/darko");
  assert.equal(learnHrefFor("pts"), null);

  // Column / factor / ASK helpers (header-level wiring)
  assert.equal(conceptIdForColumnLabel("TS%"), "ts");
  assert.equal(conceptIdForColumnLabel("eFG%"), "efg");
  assert.equal(conceptIdForColumnLabel("+/-"), "plus_minus");
  assert.equal(conceptIdForColumnLabel("AST/TO"), "ast_to");
  assert.equal(conceptIdForColumnLabel("Player"), null);
  assert.equal(conceptIdForFactorId("efg"), "efg");
  assert.equal(conceptIdForFactorId("ts"), "ts");
  assert.equal(conceptIdForAskMetric("ts_pct"), "ts");
  assert.equal(conceptIdForAskMetric("cpi"), "cpi");
  assert.equal(conceptIdForAskMetric(undefined), null);
  assert.equal(conceptIdForAskStatus("insufficient_data"), "insufficient_evidence");
  assert.equal(conceptIdForAskStatus("ok"), null);

  // Registry consistency: tooltip text shared via explainMetric aliases
  const a = explainMetric("ts")!.plain;
  const b = explainMetric("trueShooting")!.plain;
  const c = explainMetric("ts_pct")!.plain;
  assert.equal(a, b);
  assert.equal(a, c);

  assert.equal(learnHrefFor("drbl"), "/learn/drbl-100");
  assert.equal(learnHrefFor("r1_win_eq"), "/learn/drbl/war1");
  assert.equal(learnHrefFor("drbl_p"), "/learn/drbl-p");
  assert.ok(resolveLearnPage("drbl")?.kind === "portal");
  for (const slug of [
    "drbl-100",
    "war1",
    "wins-above-r1",
    "drbl-o",
    "drbl-d",
    "drbl-p",
    "drbl-ln",
    "drbl-b",
    "r1",
    "r1-points",
    "how-drbl-works",
    "drbl-validation",
    "drbl-historical-data",
    "drbl-limitations",
  ]) {
    assert.ok(resolveLearnPage(slug), `missing DRBL learn page ${slug}`);
  }
  assert.equal(resolveLearnPage("war1")?.kind, "guide");
  assert.equal(resolveLearnPage("wins-above-r1")?.kind, "guide");
  const war1 = resolveLearnPage("war1");
  if (war1?.kind === "guide") {
    assert.equal(war1.guide.name, "WAR1");
    assert.equal(war1.guide.slug, "war1");
  }

  console.log("test-learn-explanations: all assertions passed");
}

main();
