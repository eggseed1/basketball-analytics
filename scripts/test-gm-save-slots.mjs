import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

// Exercise the real slot adapter with a delayed database write. The fake only
// replaces IndexedDB I/O so a switch can happen while an autosave is pending.
const bytes = new Map();
let heldKey, started, release;
const hold = key => {
  heldKey = key;
  let markStarted, releaseWrite;
  started = new Promise(resolve => { markStarted = resolve; });
  const gate = new Promise(resolve => { releaseWrite = resolve; });
  release = () => { heldKey = undefined; releaseWrite(); };
  return { gate, markStarted };
};
let held;
const context = vm.createContext({ Date, Math, JSON, Map, Set, Promise, Error });
let sequence = 0;
const database = new vm.SyntheticModule(["get", "set", "del"], function () {
  this.setExport("get", async key => bytes.get(key));
  this.setExport("set", async (key, value) => {
    if (key === heldKey) { held.markStarted(); await held.gate; }
    bytes.set(key, value);
  });
  this.setExport("del", async key => bytes.delete(key));
}, { context });
const rng = new vm.SyntheticModule(["uid"], function () {
  this.setExport("uid", prefix => prefix + "-" + ++sequence);
}, { context });
const source = stripTypeScriptTypes(readFileSync(new URL("../src/gm/state/gm-saves.ts", import.meta.url), "utf8"), { mode: "strip" });
const saveModule = new vm.SourceTextModule(source, { context });
await saveModule.link(specifier => {
  if (specifier === "idb-keyval") return database;
  if (specifier === "@/gm/engine/rng") return rng;
  throw new Error("Unexpected save adapter dependency: " + specifier);
});
await saveModule.evaluate();
const saves = saveModule.namespace;
const a = saves.createGmSlotStorage("a"), b = saves.createGmSlotStorage("b");
const league = (team, season) => ({ userTeamId: team, season, phase: "regular", updatedAt: "2026-11-01T00:00:00Z", teams: [{ id: team, city: team, name: "Team" }] });
const encode = league => JSON.stringify({ state: { league }, version: 0 });
const first = await saves.allocateNewSave({ userTeamId: "bos", season: 2026 });
await a.setItem("ignored", encode(league("bos", 2026)));

held = hold(saves.layerAKey(first));
const pendingA = a.setItem("ignored", encode(league("bos", 2027)));
await started;
const second = await saves.allocateNewSave({ userTeamId: "nyk", season: 2026 });
await a.setItem("ignored", encode(league("nyk", 2026)));
release(); await pendingA;
assert.equal(JSON.parse(await saves.readLayerARaw(first)).state.league.season, 2027);
assert.equal(JSON.parse(await saves.readLayerARaw(second)).state.league.userTeamId, "nyk");
let index = await saves.readSaveIndex();
assert.equal(index.activeId, second, "an old autosave must not reactivate its slot");
assert.equal(index.saves.find(row => row.id === second).userTeamId, "nyk", "an old autosave must not overwrite the new slot's label");
assert.equal(index.saves.find(row => row.id === first).season, 2027);

// Showing the empty hub or a loading state must not erase an existing save.
await a.setItem("ignored", encode(null));
assert.equal(JSON.parse(await saves.readLayerARaw(second)).state.league.userTeamId, "nyk");
await saves.parkActiveSave();
const hubWrite = a.setItem("ignored", encode(null));
await saves.setActiveSaveId(first);
await hubWrite;
assert.equal(JSON.parse(await saves.readLayerARaw(first)).state.league.season, 2027);

// Layer B belongs to the same captured slot, including a switch during I/O.
held = hold(saves.layerBKey(first));
const pendingB = b.setItem("ignored", "first simulation");
await started;
await saves.setActiveSaveId(second);
await b.setItem("ignored", "second simulation");
release(); await pendingB;
assert.equal(await saves.readLayerBRaw(first), "first simulation");
assert.equal(await b.getItem("ignored"), "second simulation");
await saves.parkActiveSave();
index = await saves.readSaveIndex();
assert.equal(index.activeId, null);
assert.equal(index.saves.length, 2);
console.log("Save slot checks passed: delayed autosaves, slot metadata, empty hub, resumption, and separate simulation layers.");

// A slow earlier day cannot overwrite a later day in the same save slot.
await saves.setActiveSaveId(first);
held = hold(saves.layerAKey(first));
const earlier = a.setItem("ignored", encode({ ...league("bos", 2028), day: 10 }));
await started;
const later = a.setItem("ignored", encode({ ...league("bos", 2028), day: 11 }));
release();
await Promise.all([earlier, later]);
assert.equal(JSON.parse(await saves.readLayerARaw(first)).state.league.day, 11);
console.log("Same-slot autosaves retain the latest simulation day.");
