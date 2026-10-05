/**
 * Run every offline `test:*` package script with bounded concurrency.
 * Live-network suites (`*:live-espn`) and composite runners are skipped.
 *
 *   npm test
 *   npm test -- --only=team-identity,ask-drbl
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const SKIP = /:live-espn|identity-regressions/;
const TIMEOUT_MS = 180_000;
const CONCURRENCY = Math.max(2, Math.min(6, os.cpus().length - 1));

const only = process.argv
  .find((arg) => arg.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((name) => `test:${name.replace(/^test:/, "")}`);

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const names = Object.keys(pkg.scripts).filter(
  (name) =>
    name.startsWith("test:") && (only ? only.includes(name) : !SKIP.test(name))
);

function run(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const output = [];
    const child = spawn("npm", ["run", "-s", name], {
      env: { ...process.env, CI: process.env.CI ?? "1" },
    });
    const timer = setTimeout(() => {
      output.push(`\nTIMEOUT after ${TIMEOUT_MS / 1000}s`);
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk) => output.push(chunk.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ name, code: code ?? 1, ms: Date.now() - started, output: output.join("") });
    });
  });
}

const results = [];
let next = 0;
async function worker() {
  while (next < names.length) {
    const result = await run(names[next++]);
    results.push(result);
    const mark = result.code === 0 ? "ok  " : "FAIL";
    console.log(`${mark} ${result.name} (${(result.ms / 1000).toFixed(1)}s)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const failed = results.filter((r) => r.code !== 0);
for (const f of failed) {
  const tail = f.output.trimEnd().split("\n").slice(-40).join("\n");
  console.log(`\n── ${f.name} (exit ${f.code}) ──\n${tail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} test scripts passed`);
process.exit(failed.length ? 1 : 0);
