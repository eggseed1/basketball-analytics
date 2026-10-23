import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { downsampleInsightFlowPath } from "./recent-insights";

describe("downsampleInsightFlowPath", () => {
  it("keeps short paths intact", () => {
    const path: [number, number][] = [
      [0, 0],
      [10, 2],
      [20, -1],
    ];
    assert.deepEqual(downsampleInsightFlowPath(path, 96), path);
  });

  it("caps long paths and always keeps endpoints + mark times", () => {
    const path: [number, number][] = Array.from({ length: 400 }, (_, i) => [
      i * 7,
      i % 2 === 0 ? 4 : -3,
    ]);
    const markT = path[250]![0];
    const out = downsampleInsightFlowPath(path, 96, [markT]);
    assert.ok(out.length <= 96);
    assert.deepEqual(out[0], path[0]);
    assert.deepEqual(out.at(-1), path.at(-1));
    assert.ok(out.some(([t]) => t === markT));
  });
});
