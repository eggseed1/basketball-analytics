/**
 * Game-photo portrait fragment + face crop math.
 * Run: npx tsx scripts/test-portrait-photo.ts
 */
import assert from "node:assert/strict";

import {
  encodePortraitPhoto,
  faceCropBox,
  parsePortraitPhoto,
} from "../src/lib/portrait-photo";

const pct = (s: string) => Number(s.replace("%", "")) / 100;

function main() {
  const plain = parsePortraitPhoto("https://cdn.nba.com/headshots/nba/latest/260x190/2544.png");
  assert.equal(plain.crop, null);
  assert.equal(plain.credit, null);

  const credit = "Photo: Tdorante10, CC BY-SA 4.0, via Wikimedia Commons";
  const src = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/X.jpg/960px-X.jpg";
  const crop = { cx: 0.5, cy: 0.38, fh: 0.0973, aspect: 330 / 393 };
  const parsed = parsePortraitPhoto(encodePortraitPhoto(src, crop, credit));
  assert.equal(parsed.src, src);
  assert.equal(parsed.credit, credit);
  assert.ok(parsed.crop && Math.abs(parsed.crop.fh - crop.fh) < 1e-4);

  // Unrelated fragments pass through untouched.
  assert.equal(parsePortraitPhoto(`${src}#page=2`).crop, null);

  for (const c of [
    crop,
    { cx: 0.05, cy: 0.05, fh: 0.3, aspect: 1.5 },
    { cx: 0.95, cy: 0.9, fh: 0.08, aspect: 0.6 },
    { cx: 0.5, cy: 0.5, fh: 0.9, aspect: 1 },
    { cx: 0.5, cy: 0.45, fh: 0.6, aspect: 0.8 },
  ]) {
    const { style } = faceCropBox(c);
    const [w, h, left, top] = [style.width, style.height, style.left, style.top].map(pct);
    assert.ok(h * c.fh <= 0.55 + 1e-4, "face never zoomed past 55% of the circle");
    // Beyond what a photo smaller than the circle forces, gaps stay under 15%.
    const slackX = 0.15 + Math.max(0, 1 - w) + 1e-4;
    const slackY = 0.15 + Math.max(0, 1 - h) + 1e-4;
    assert.ok(left <= slackX && top <= slackY, "gap on the left or top stays small");
    assert.ok(1 - (left + w) <= slackX && 1 - (top + h) <= slackY, "gap on the right or bottom stays small");
  }

  // A small, centered face still covers the circle at the normal face share.
  const normal = faceCropBox(crop);
  assert.equal(normal.covers, true);
  assert.ok(Math.abs(pct(normal.style.height) * crop.fh - 0.4) < 1e-3);

  // A tight crop (face 60% of the photo) stays whole and leaves room for a backdrop.
  const tight = faceCropBox({ cx: 0.5, cy: 0.45, fh: 0.6, aspect: 0.8 });
  assert.equal(tight.covers, false);
  const tightTop = pct(tight.style.top) + (0.45 - 0.3) * pct(tight.style.height);
  assert.ok(tightTop >= 0.1, "forehead stays inside the circle");

  console.log("test-portrait-photo: ok");
}

main();
