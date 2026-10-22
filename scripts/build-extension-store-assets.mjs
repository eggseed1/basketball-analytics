#!/usr/bin/env node
/**
 * Build Chrome Web Store graphic assets + zip for DRBL Live.
 * Outputs under extension/drbl-live/store/dist/
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ext = join(root, "extension/drbl-live");
const store = join(ext, "store");
const dist = join(store, "dist");
const icon128 = join(ext, "icons/icon128.png");

mkdirSync(dist, { recursive: true });

function svgPromo({ w, h, title, subtitle }) {
  const cx = Math.round(w * 0.22);
  const cy = Math.round(h * 0.5);
  const mark = Math.round(Math.min(h * 0.42, 168));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c1630"/>
      <stop offset="55%" stop-color="#152447"/>
      <stop offset="100%" stop-color="#3a1520"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="18%" r="55%">
      <stop offset="0%" stop-color="#c8102e" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#c8102e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <circle cx="${w - 80}" cy="${h - 40}" r="120" fill="#1d428a" opacity="0.22"/>
  <g transform="translate(${cx - mark / 2} ${cy - mark / 2})">
    <rect width="${mark}" height="${mark}" rx="${Math.round(mark * 0.22)}" fill="#eff2f8"/>
    <g transform="translate(${mark * 0.16} ${mark * 0.16}) scale(${mark / 32 * 0.68})">
      <path d="M10 6.5c7.2 0 13 5.8 13 13" fill="none" stroke="#1d428a" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M10 11c4.7 0 8.5 3.8 8.5 8.5" fill="none" stroke="#5681b5" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M10 6.5v13" fill="none" stroke="#2c3240" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="22.5" cy="19.2" r="2.35" fill="#c8102e"/>
    </g>
  </g>
  <text x="${cx + mark * 0.7}" y="${cy - 8}" fill="#f4f6fb" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="${Math.round(h * 0.16)}" font-weight="800" letter-spacing="-1.5">${title}</text>
  <text x="${cx + mark * 0.7}" y="${cy + Math.round(h * 0.12)}" fill="#b8c0d4" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="${Math.round(h * 0.07)}" font-weight="600">${subtitle}</text>
</svg>`;
}

async function writePromo(name, w, h, title, subtitle) {
  const out = join(dist, name);
  await sharp(Buffer.from(svgPromo({ w, h, title, subtitle }))).png().toFile(out);
  console.log("wrote", out);
}

async function screenshotPreviews() {
  const browser = await chromium.launch({ headless: true });
  try {
    const shots = [
      { file: "screenshot-popup-light.png", url: pathToFileURL(join(store, "preview-popup.html")).href },
      { file: "screenshot-popup-dark.png", url: pathToFileURL(join(store, "preview-popup.html")).href + "?theme=dark" },
      { file: "screenshot-options.png", url: pathToFileURL(join(store, "preview-options.html")).href },
    ];
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      await page.goto(shot.url, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const out = join(dist, shot.file);
      await page.screenshot({ path: out, type: "png" });
      await page.close();
      console.log("wrote", out);
    }
  } finally {
    await browser.close();
  }
}

function packageZip() {
  const zipPath = join(dist, "drbl-live-chrome-web-store.zip");
  if (existsSync(zipPath)) rmSync(zipPath);
  const include = [
    "manifest.json",
    "background.js",
    "shared.js",
    "popup.html",
    "popup.js",
    "options.html",
    "options.js",
    "style.css",
    "README.md",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
  ];
  const result = spawnSync("zip", ["-q", "-X", zipPath, ...include], {
    cwd: ext,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "zip failed");
  }
  console.log("wrote", zipPath);
}

copyFileSync(icon128, join(dist, "store-icon-128.png"));
await writePromo("promo-small-440x280.png", 440, 280, "DRBL Live", "NBA scores from drbl.io");
await writePromo("promo-marquee-1400x560.png", 1400, 560, "DRBL Live", "Live NBA scores · favorite-team finals");
await screenshotPreviews();
packageZip();

const check = spawnSync("node", ["--check", join(ext, "background.js")], { encoding: "utf8" });
if (check.status !== 0) {
  console.error(check.stderr);
  process.exit(1);
}
console.log("store assets ready in", dist);
