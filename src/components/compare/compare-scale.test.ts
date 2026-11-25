import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ComparisonDimension } from "@/analytics";
import {
  compareEdge,
  compareScore,
} from "@/components/compare/compare-scale";

function dim(
  partial: Partial<ComparisonDimension> & Pick<ComparisonDimension, "id">
): ComparisonDimension {
  return {
    label: partial.id,
    aDisplay: String(partial.aValue ?? "—"),
    bDisplay: String(partial.bValue ?? "—"),
    ...partial,
  };
}

describe("compareScore", () => {
  it("falls back to relative bars for zero-centered impact without percentiles", () => {
    const d = dim({
      id: "drbl100",
      aValue: 1.5,
      bValue: 3.0,
      aBar: 50,
      bBar: 100,
      delta: -1.5,
    });
    assert.equal(compareScore(d, "a"), 50);
    assert.equal(compareScore(d, "b"), 100);
  });

  it("uses peer percentiles when both sides have them", () => {
    const d = dim({
      id: "pts",
      aValue: 25,
      bValue: 20,
      aPercentile: 90,
      bPercentile: 70,
      delta: 20,
    });
    assert.equal(compareScore(d, "a"), 90);
    assert.equal(compareScore(d, "b"), 70);
  });
});

describe("compareEdge", () => {
  it("marks a clear percentile leader", () => {
    const d = dim({
      id: "darko",
      aValue: 4,
      bValue: 2,
      aPercentile: 95,
      bPercentile: 60,
      delta: 35,
    });
    assert.equal(compareEdge(d), "a");
  });

  it("treats small percentile gaps as even", () => {
    const d = dim({
      id: "war1",
      aValue: 2,
      bValue: 1.9,
      aPercentile: 80,
      bPercentile: 78,
      delta: 2,
    });
    assert.equal(compareEdge(d), "even");
  });

  it("does not call both sides winners on a raw lead", () => {
    const d = dim({
      id: "pts",
      aValue: 30,
      bValue: 22,
      delta: 8,
    });
    assert.equal(compareEdge(d), "a");
  });
});
