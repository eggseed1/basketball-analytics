/**
 * PBP coverage report — corpus attach status + declarative manifest counts.
 * Does not scan event files. Does not unlock ASK PBP execution.
 * Run: npm run report:pbp-coverage
 */
import { getPbpCapability } from "../src/pbp";
import { getPbpCorpusStatus } from "../src/pbp/corpus";

async function main() {
  const status = await getPbpCorpusStatus();
  const capability = getPbpCapability();
  const m = status.manifest;

  const report = {
    asOf: new Date().toISOString().slice(0, 10),
    attachment: status.attachment,
    dataPath: status.dataPath,
    envPath: status.envPath,
    errors: status.errors,
    capability,
    executable: status.executable,
    availability: {
      local: status.attachment === "attached" ? "manifest-attached" : "not-attached",
      preview: "unknown — corpus must be mounted/configured on the host",
      production: "not-configured — do not treat local attach as prod-ready",
    },
    corpus: m
      ? {
          source: m.source,
          version: m.version,
          format: m.format,
          importedAt: m.importedAt,
          games: m.games,
          events: m.events,
          seasons: m.seasons,
          earliestSeason: m.earliestSeason,
          latestSeason: m.latestSeason,
          fileCount: m.fileCount,
          notes: m.notes ?? [],
          countProvenance: "manifest-declared",
        }
      : null,
    identity: {
      playerMapping: "not-audited — no event scan until corpus format is known",
      teamMapping: "not-audited — reuse canonical team + team-era after format known",
      gameMapping: "not-audited",
      distinction: {
        absentFromSource: "field never present in source files",
        presentUnnormalized: "present in source, not yet mapped to canonical IDs",
        presentNormalized: "mapped and validated",
      },
    },
    shotZones: {
      vocabularyObserved: [] as string[],
      geometryObserved: "unknown — no event schema inspected",
      collegeThreeSupported: false,
      note: "college_three remains ASK AST / unsupported until verified source zones or geometry exist.",
    },
    clock: {
      semantics: "unknown — no event corpus",
      note: "Do not implement under-6:00 Q4 filters until clock audit against real rows.",
    },
    nextStep:
      status.attachment === "attached"
        ? "Re-audit event schema, identity maps, clock/zone fields; keep capability false until Phase B."
        : "Set PBP_DATA_PATH (or write data/pbp/manifest.json) after external import lands, then re-run this report.",
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
