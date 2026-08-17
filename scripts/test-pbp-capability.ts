/**
 * PBP corpus attach boundary + capability denial.
 * Run: npm run test:pbp-capability
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { getPbpCapability } from "../src/pbp";
import {
  getPbpCorpusManifest,
  getPbpCorpusStatus,
  getPbpGameRecord,
  resolvePbpDataPath,
  validatePbpCorpusManifest,
} from "../src/pbp/corpus";

const fixturesRoot = path.join(process.cwd(), "scripts", "fixtures", "pbp");
const pbpIndexPath = path.join(process.cwd(), "src", "pbp", "index.ts");
const pbpCorpusPath = path.join(process.cwd(), "src", "pbp", "corpus.ts");
const pbpCorpusServerPath = path.join(
  process.cwd(),
  "src",
  "pbp",
  "corpus.server.ts"
);

async function main() {
  // --- Client/server boundary regression ---
  const indexSrc = readFileSync(pbpIndexPath, "utf8");
  const corpusSrc = readFileSync(pbpCorpusPath, "utf8");
  const corpusServerSrc = readFileSync(pbpCorpusServerPath, "utf8");
  // Strip block comments so docs mentioning corpus/fs do not false-positive.
  const indexCode = indexSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const corpusCode = corpusSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(indexCode, /node:fs/);
  assert.doesNotMatch(indexCode, /from ["']\.\/corpus["']/);
  assert.doesNotMatch(indexCode, /from ["']\.\/corpus\.server["']/);
  assert.doesNotMatch(
    indexCode,
    /\b(getPbpCorpusStatus|getPbpCorpusManifest|getPbpGameRecord|resolvePbpDataPath)\b/
  );
  // CLI/tsx path must stay Node-executable (no server-only).
  assert.doesNotMatch(corpusCode, /import ["']server-only["']/);
  assert.match(corpusSrc, /node:fs\/promises/);
  // Next.js application path keeps the server-only guard.
  assert.match(corpusServerSrc, /import ["']server-only["']/);
  assert.match(corpusServerSrc, /from ["']\.\/corpus["']/);

  // --- Capability stays false regardless of attach ---
  const cap = getPbpCapability();
  assert.equal(cap.gamesIndexed, false);
  assert.equal(cap.possessionsDerived, false);
  assert.equal(cap.shotLocations, false);
  assert.equal(cap.lineups, false);

  // --- Default path (no env) ---
  const resolved = resolvePbpDataPath({}, process.cwd());
  assert.ok(resolved.dataPath.endsWith(path.join("data", "pbp")));
  assert.equal(resolved.envPath, null);

  // --- Missing corpus ---
  const missing = await getPbpCorpusStatus({
    env: { PBP_DATA_PATH: path.join(fixturesRoot, "does-not-exist") },
  });
  assert.equal(missing.attachment, "missing");
  assert.equal(missing.manifest, null);
  assert.equal(missing.executable, false);
  assert.ok(missing.errors.length > 0);
  assert.equal(
    await getPbpCorpusManifest({
      env: { PBP_DATA_PATH: path.join(fixturesRoot, "does-not-exist") },
    }),
    null
  );

  // Empty dir without manifest
  const emptyDir = path.join(fixturesRoot, "empty");
  mkdirSync(emptyDir, { recursive: true });
  const empty = await getPbpCorpusStatus({
    env: { PBP_DATA_PATH: emptyDir },
  });
  assert.equal(empty.attachment, "missing");
  assert.equal(empty.manifestPresent, false);

  // --- Malformed manifest ---
  const malformed = await getPbpCorpusStatus({
    env: { PBP_DATA_PATH: path.join(fixturesRoot, "malformed") },
  });
  assert.equal(malformed.attachment, "malformed");
  assert.equal(malformed.manifest, null);
  assert.ok(malformed.errors.some((e) => /games|missing field/i.test(e)));

  // --- Valid synthetic fixture (does NOT unlock capability) ---
  const attached = await getPbpCorpusStatus({
    env: { PBP_DATA_PATH: path.join(fixturesRoot, "valid") },
  });
  assert.equal(attached.attachment, "attached");
  assert.ok(attached.manifest);
  assert.equal(attached.manifest!.games, 2);
  assert.equal(attached.manifest!.events, 10);
  assert.equal(attached.executable, false);
  assert.deepEqual(getPbpCapability(), {
    gamesIndexed: false,
    possessionsDerived: false,
    shotLocations: false,
    lineups: false,
  });

  const manifest = await getPbpCorpusManifest({
    env: { PBP_DATA_PATH: path.join(fixturesRoot, "valid") },
  });
  assert.equal(manifest?.source, "synthetic-fixture");

  // --- Unreadable / bad JSON ---
  const badJsonDir = path.join(tmpdir(), `pbp-bad-json-${process.pid}`);
  mkdirSync(badJsonDir, { recursive: true });
  writeFileSync(path.join(badJsonDir, "manifest.json"), "{not-json", "utf8");
  const badJson = await getPbpCorpusStatus({
    env: { PBP_DATA_PATH: badJsonDir },
  });
  assert.equal(badJson.attachment, "malformed");
  rmSync(badJsonDir, { recursive: true, force: true });

  // --- validatePbpCorpusManifest unit ---
  const bad = validatePbpCorpusManifest({ source: "x" });
  assert.equal(bad.ok, false);

  // --- Game record deferred ---
  assert.equal(await getPbpGameRecord("any"), null);

  // Production default tree must not contain a real event corpus yet.
  const defaultStatus = await getPbpCorpusStatus({
    env: {},
    cwd: process.cwd(),
  });
  assert.notEqual(
    defaultStatus.attachment,
    "attached",
    "Default data/pbp must not advertise an attached production corpus yet"
  );

  console.log(
    "test-pbp-capability: all assertions passed (attach boundary ready; executable=false; @/pbp client-safe)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
