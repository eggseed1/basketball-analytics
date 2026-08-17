/**
 * PlayerIdentity density variants + placement policy.
 * Run: npm run test:player-identity-preview
 */
import assert from "node:assert/strict";

import {
  claimPlayerIdentityPreview,
  getActivePlayerIdentityPreviewId,
  releasePlayerIdentityPreview,
  resetPlayerIdentityPreviewLock,
  subscribePlayerIdentityPreview,
} from "../src/components/players/player-identity-preview-lock";
import type { PlayerIdentityVariant } from "../src/components/players/player-identity";

/** Mirrors VARIANT_CONFIG in player-identity.tsx */
const VARIANT_POLICY: Record<
  PlayerIdentityVariant,
  {
    side: "bottom" | "top" | "right" | "left";
    openDelay: number;
    closeDelay: number;
    rich: boolean;
    tipOnly: boolean;
  }
> = {
  default: {
    side: "bottom",
    openDelay: 160,
    closeDelay: 200,
    rich: true,
    tipOnly: false,
  },
  compact: {
    side: "right",
    openDelay: 120,
    closeDelay: 160,
    rich: false,
    tipOnly: false,
  },
  chip: {
    side: "top",
    openDelay: 100,
    closeDelay: 120,
    rich: false,
    tipOnly: true,
  },
};

function resolveVariant(
  variant?: PlayerIdentityVariant,
  compact?: boolean
): PlayerIdentityVariant {
  if (variant) return variant;
  if (compact) return "compact";
  return "default";
}

function preferredPlayerPreviewSide(space: {
  above: number;
  below: number;
  left: number;
  right: number;
  needH: number;
  needW: number;
  preferred: "bottom" | "top" | "right" | "left";
}): "top" | "bottom" | "left" | "right" {
  const { above, below, left, right, needH, needW, preferred } = space;
  const order: Array<"top" | "bottom" | "left" | "right"> =
    preferred === "right"
      ? ["right", "left", "top", "bottom"]
      : preferred === "top"
        ? ["top", "bottom", "right", "left"]
        : preferred === "left"
          ? ["left", "right", "top", "bottom"]
          : ["bottom", "top", "right", "left"];
  for (const side of order) {
    if (side === "bottom" && below >= needH) return "bottom";
    if (side === "top" && above >= needH) return "top";
    if (side === "right" && right >= needW) return "right";
    if (side === "left" && left >= needW) return "left";
  }
  return below >= above ? "bottom" : "top";
}

function main() {
  console.log("exclusive preview lock…");
  resetPlayerIdentityPreviewLock();
  const seen: Array<string | null> = [];
  const unsub = subscribePlayerIdentityPreview((id) => seen.push(id));
  claimPlayerIdentityPreview("a");
  assert.equal(getActivePlayerIdentityPreviewId(), "a");
  claimPlayerIdentityPreview("b");
  assert.equal(getActivePlayerIdentityPreviewId(), "b");
  releasePlayerIdentityPreview("b");
  assert.equal(getActivePlayerIdentityPreviewId(), null);
  unsub();

  console.log("variant resolution…");
  assert.equal(resolveVariant(), "default");
  assert.equal(resolveVariant(undefined, true), "compact");
  assert.equal(resolveVariant("chip", true), "chip");
  assert.equal(resolveVariant("default", true), "default");

  console.log("default remains rich below…");
  assert.equal(VARIANT_POLICY.default.rich, true);
  assert.equal(VARIANT_POLICY.default.side, "bottom");

  console.log("compact prefers side (minimize table obstruction)…");
  assert.equal(VARIANT_POLICY.compact.side, "right");
  assert.equal(VARIANT_POLICY.compact.rich, false);
  assert.ok(VARIANT_POLICY.compact.openDelay < VARIANT_POLICY.default.openDelay);
  assert.equal(
    preferredPlayerPreviewSide({
      preferred: "right",
      above: 40,
      below: 40,
      left: 40,
      right: 220,
      needH: 72,
      needW: 208,
    }),
    "right"
  );
  assert.equal(
    preferredPlayerPreviewSide({
      preferred: "right",
      above: 40,
      below: 40,
      left: 220,
      right: 20,
      needH: 72,
      needW: 208,
    }),
    "left"
  );

  console.log("chip is tip-only above…");
  assert.equal(VARIANT_POLICY.chip.tipOnly, true);
  assert.equal(VARIANT_POLICY.chip.side, "top");
  assert.equal(VARIANT_POLICY.chip.rich, false);

  console.log("delays documented…");
  assert.deepEqual(
    [VARIANT_POLICY.default.openDelay, VARIANT_POLICY.default.closeDelay],
    [160, 200]
  );
  assert.deepEqual(
    [VARIANT_POLICY.compact.openDelay, VARIANT_POLICY.compact.closeDelay],
    [120, 160]
  );
  assert.deepEqual(
    [VARIANT_POLICY.chip.openDelay, VARIANT_POLICY.chip.closeDelay],
    [100, 120]
  );

  console.log("OK — player-identity-preview");
}

main();
