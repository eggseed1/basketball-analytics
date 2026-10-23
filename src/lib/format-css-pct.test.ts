import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cssPct } from "./format";

describe("cssPct", () => {
  it("rounds fractions to one decimal percent", () => {
    assert.equal(cssPct(0.5852352941176471), "58.5%");
    assert.equal(cssPct(1), "100%");
    assert.equal(cssPct(0), "0%");
  });

  it("accepts already-percent values", () => {
    assert.equal(cssPct(79.3103448275862, { unit: "percent" }), "79.3%");
  });
});
