/**
 * Run: npx tsx --test src/lib/player-name.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPlayerMastheadShortName,
  normalizePlayerName,
} from "@/lib/player-name";

test("normalizePlayerName strips accents and punctuation", () => {
  assert.equal(normalizePlayerName("Giannis Antetokounmpo"), "giannisantetokounmpo");
  assert.equal(normalizePlayerName("Luka Dončić"), "lukadoncic");
});

test("formatPlayerMastheadShortName uses first initial + family name", () => {
  assert.equal(
    formatPlayerMastheadShortName("Giannis Antetokounmpo"),
    "G. Antetokounmpo"
  );
  assert.equal(formatPlayerMastheadShortName("Luka Doncic"), "L. Doncic");
  assert.equal(
    formatPlayerMastheadShortName("Karl-Anthony Towns"),
    "K. Towns"
  );
});

test("formatPlayerMastheadShortName keeps generational suffixes", () => {
  assert.equal(
    formatPlayerMastheadShortName("Michael Porter Jr."),
    "M. Porter Jr."
  );
  assert.equal(formatPlayerMastheadShortName("Gary Payton II"), "G. Payton II");
});

test("formatPlayerMastheadShortName leaves single tokens alone", () => {
  assert.equal(formatPlayerMastheadShortName("Nene"), "Nene");
  assert.equal(formatPlayerMastheadShortName(""), "");
});
