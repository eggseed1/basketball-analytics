import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  foldAccents,
  restoreNameAccents,
} from "../../../src/data/drbl/restore-name-accents";

describe("restoreNameAccents (stats.nba.com seasons ship ASCII names)", () => {
  it("restores names the search index spells with accents", () => {
    assert.equal(restoreNameAccents("Nikola Jokic"), "Nikola Jokić");
    assert.equal(restoreNameAccents("Goran Dragic"), "Goran Dragić");
    assert.equal(restoreNameAccents("Davis Bertans"), "Dāvis Bertāns");
  });

  it("leaves plain and already-accented names alone", () => {
    assert.equal(restoreNameAccents("Stephen Curry"), "Stephen Curry");
    assert.equal(restoreNameAccents("Luka Dončić"), "Luka Dončić");
    assert.equal(restoreNameAccents(""), "");
  });

  it("folds letters NFD can't split", () => {
    assert.equal(foldAccents("Łukasz Ødegård"), "Lukasz Odegard");
  });
});
