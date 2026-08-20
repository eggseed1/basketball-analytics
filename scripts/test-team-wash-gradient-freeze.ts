/**
 * Freeze regression: team-color wash gradients must stay strong plateaus.
 * Run: npm run test:team-wash-gradient
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CSS_PATH = path.join(ROOT, "src", "app", "globals.css");
const FREEZE_PATH = path.join(
  ROOT,
  "reports",
  "team_wash_gradient_freeze",
  "00_freeze.json"
);

type FreezeDoc = {
  blockSha256: string;
  contract: {
    angle: string;
    lightMixPct: Record<string, number[]>;
    darkMixPct: Record<string, number[]>;
  };
};

function extractWashBlock(css: string): string {
  const start = css.indexOf("/* Soft dual-team wash");
  const end = css.indexOf("/* Left accent stripe");
  assert.ok(start >= 0, "missing wash block start marker");
  assert.ok(end > start, "missing wash block end marker");
  return css.slice(start, end).trimEnd() + "\n";
}

function mixesInSelector(block: string, selector: string): number[] {
  const re = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[\\s\\S]*?\\}`,
    "m"
  );
  const m = block.match(re);
  assert.ok(m, `missing selector ${selector}`);
  const mixes = [...m[0].matchAll(/\)\s+(\d+)%\s*,/g)].map((x) =>
    Number(x[1])
  );
  // color-mix(... N%, ...) - capture the team-color percentage
  const pcts = [
    ...m[0].matchAll(
      /color-mix\(in oklab,\s*var\(--(?:away|home)-color[^)]*\)\s+(\d+)%/g
    ),
  ].map((x) => Number(x[1]));
  assert.equal(pcts.length, 4, `${selector} must have 4 mix plateaus`);
  return pcts;
}

function main() {
  const freeze = JSON.parse(readFileSync(FREEZE_PATH, "utf8")) as FreezeDoc;
  const css = readFileSync(CSS_PATH, "utf8");
  const block = extractWashBlock(css);
  const hash = createHash("sha256").update(block).digest("hex");

  assert.equal(
    hash,
    freeze.blockSha256,
    `Wash CSS block hash mismatch.\n expected ${freeze.blockSha256}\n actual   ${hash}\nIf intentional, update reports/team_wash_gradient_freeze after explicit unfreeze.`
  );

  assert.match(block, /90deg/);
  assert.doesNotMatch(
    block,
    /105deg/,
    "frozen washes use 90deg, not the legacy 105deg hollow fade"
  );

  // Forbidden hollow mid: pure card stop without team tint in the plateau pattern
  assert.doesNotMatch(
    block,
    /var\(--card[^)]*\)\s+4[0-9]%\s*,/,
    "hollow mid card stop is forbidden"
  );
  assert.doesNotMatch(
    block,
    /transparent\)\s+3[0-9]%/,
    "transparent mid fades are forbidden"
  );

  for (const [sel, expected] of Object.entries(freeze.contract.lightMixPct)) {
    const selector = sel.startsWith(".") ? sel : `.${sel}`;
    assert.deepEqual(
      mixesInSelector(block, selector),
      expected,
      `${selector} light mix freeze`
    );
  }
  for (const [sel, expected] of Object.entries(freeze.contract.darkMixPct)) {
    const selector = `.dark .${sel.replace(/^\./, "")}`;
    assert.deepEqual(
      mixesInSelector(block, selector),
      expected,
      `${selector} dark mix freeze`
    );
  }

  console.log("test-team-wash-gradient-freeze: ok", hash.slice(0, 12));
}

main();
