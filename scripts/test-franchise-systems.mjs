import { spawnSync } from "node:child_process";
const suites = ["attributes", "books", "bracket", "career-overlay", "checkpoints", "cup", "dev-traits", "draft-class", "draft-night", "free-agency", "home-stage", "injury-schedule", "lineup", "offseason", "pace", "pbp", "play-in", "roster-lock", "rotations", "schedule", "scouting-focus", "staff-knacks", "staff", "systems-pass", "trade-fit", "trades", "value"];
for (const suite of suites) {
  const result = spawnSync(process.execPath, ["--import", "tsx", `scripts/test-gm-${suite}.ts`], { encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) { process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? ""); process.exit(result.status ?? 1); }
  console.log(`PASS ${suite}`);
}
console.log(`${suites.length} Franchise Lab system suites passed.`);
