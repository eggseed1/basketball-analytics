import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = process.cwd();
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/react-state.tsx"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "test-navigation",
    setup(bundler) {
      bundler.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "navigation-test" }));
      bundler.onLoad({ filter: /.*/, namespace: "navigation-test" }, args => ({
        loader: "jsx",
        resolveDir: root,
        contents: args.path.endsWith("navigation") ? `
          import { useSyncExternalStore } from 'react';
          let path = '/one'; const listeners = new Set();
          export function navigate(next) { path = next; for (const listener of listeners) listener(); }
          const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
          export function usePathname() { return useSyncExternalStore(subscribe, () => path); }
          export function useSearchParams() { return new URLSearchParams(); }
          const router = { push: navigate, replace: navigate, prefetch() {} };
          export function useRouter() { return router; }
        ` : `
          export default function Link({ href, prefetch, scroll, replace, ...props }) { return <a href={href} {...props} />; }
        `,
      }));
    },
  }],
});

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const value = label => page.getByLabel(label, { exact: true }).textContent();
  const expectValue = async (label, expected) => {
    await page.waitForFunction(({ label, expected }) => document.querySelector(`[aria-label="${label}"]`)?.textContent === expected, { label, expected });
    assert.equal(await value(label), expected);
  };
  await expectValue("Player data", "seed-one");
  await page.getByRole("button", { name: "Enable live", exact: true }).click();
  await expectValue("Player data", "polled-one");
  await expectValue("Play data", "polled-one");
  await page.getByRole("button", { name: "Older server seed", exact: true }).click();
  await expectValue("Play data", "polled-one");
  await page.getByRole("button", { name: "Newer server seed", exact: true }).click();
  await expectValue("Play data", "newer-server");
  await page.getByRole("button", { name: "Another game", exact: true }).click();
  await expectValue("Play data", "seed-two");
  await expectValue("Player data", "seed-two");

  await expectValue("Chart data", "0:0");
  await page.getByRole("button", { name: "Refresh chart content", exact: true }).click();
  await expectValue("Chart data", "0:1");
  await page.getByRole("button", { name: "Next filter", exact: true }).click();
  await page.getByRole("button", { name: "Next filter", exact: true }).click();
  await expectValue("Chart data", "2:1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Next filter", exact: true }).click();
  await expectValue("Chart data", "3:1");
  await page.getByRole("button", { name: /^2027-28: paid/ }).click();
  assert.equal(await page.getByRole("button", { name: /^2027-28: paid/ }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Change preferred season", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: /^2026-27: paid/ }).getAttribute("aria-pressed"), "true");

  await page.getByRole("button", { name: "Start navigation", exact: true }).click();
  await expectValue("Route pending", "pending");
  await page.getByRole("button", { name: "Finish navigation", exact: true }).click();
  await expectValue("Route pending", "idle");
  await page.getByRole("button", { name: "Return navigation", exact: true }).click();
  await expectValue("Route pending", "idle");
  await page.getByRole("link", { name: "Local navigation", exact: true }).click();
  assert.notEqual(await page.getByRole("link", { name: "Local navigation", exact: true }).getAttribute("aria-busy"), "true");
  assert.deepEqual(errors, [], "State changes must not trigger browser render errors");
  console.log("React state checks passed: live data ownership/freshness, chart swaps, preferred seasons and navigation resets.");
} finally {
  await browser.close();
}
