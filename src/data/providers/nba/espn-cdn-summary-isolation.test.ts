/**
 * Box and PBP ESPN CDN loads must not share one in-flight promise, and
 * box-primary callers must hit /boxscore before the heavy /game package.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cdnPackageUrls,
  coalesceKeyFor,
} from "./espn-cdn-summary";

describe("ESPN CDN summary isolation", () => {
  it("uses distinct coalesce keys for plays, box, and shell", () => {
    const id = "401914126";
    const plays = coalesceKeyFor(id, { preferPlays: true });
    const box = coalesceKeyFor(id, { preferBox: true });
    const shell = coalesceKeyFor(id, { timeoutMs: 2_000, maxUrls: 1 });
    const plain = coalesceKeyFor(id);
    assert.equal(plays, `${id}:plays`);
    assert.equal(box, `${id}:box`);
    assert.equal(shell, `${id}:shell`);
    assert.equal(plain, id);
    assert.notEqual(plays, box);
    assert.notEqual(plays, shell);
    assert.notEqual(box, shell);
  });

  it("orders boxscore first for preferBox and shell maxUrls", () => {
    const id = "401914126";
    const boxUrls = cdnPackageUrls(id, { preferBox: true });
    const shellUrls = cdnPackageUrls(id, { maxUrls: 1 });
    const playsUrls = cdnPackageUrls(id, { preferPlays: true });
    assert.match(boxUrls[0]!, /\/boxscore\?/);
    assert.match(shellUrls[0]!, /\/boxscore\?/);
    assert.match(playsUrls[0]!, /\/playbyplay\?/);
  });
});
