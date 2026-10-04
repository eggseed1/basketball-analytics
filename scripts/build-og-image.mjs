#!/usr/bin/env node
/**
 * Renders the static social share card (src/app/opengraph-image.png).
 * Run after changing the brand mark or tagline: node scripts/build-og-image.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src/app/opengraph-image.png");

const W = 1200;
const H = 630;
const BLUE = "#1d428a";
const RED = "#c8102e";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="0.15" cy="0.1" r="0.8">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.95" cy="1" r="0.7">
      <stop offset="0" stop-color="${RED}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${RED}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a4a8f"/>
      <stop offset="1" stop-color="#151a26"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0c0d11"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>

  <g transform="translate(96 150)">
    <rect width="200" height="200" rx="40" fill="url(#tile)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
    <g transform="translate(0 0) scale(6.25)" fill="none" stroke-linecap="round">
      <path d="M10 6.5c7.2 0 13 5.8 13 13" stroke="#9fb3dc" stroke-width="2.4"/>
      <path d="M10 11c4.7 0 8.5 3.8 8.5 8.5" stroke="#7d93c4" stroke-width="1.7"/>
      <path d="M10 6.5v13" stroke="rgba(242,242,247,0.85)" stroke-width="2.4"/>
      <circle cx="22.5" cy="19.2" r="2.35" fill="${RED}" stroke="none"/>
      <circle cx="22.5" cy="19.2" r="2.35" stroke="rgba(255,255,255,0.4)" stroke-width="0.75"/>
    </g>
  </g>

  <g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" fill="#f2f2f7">
    <text x="344" y="262" font-size="132" font-weight="700" letter-spacing="-5">DRBL</text>
    <text x="350" y="330" font-size="34" font-weight="600" letter-spacing="7" fill="#a1a1aa">BASKETBALL ANALYTICS</text>
  </g>
  <text x="96" y="500" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="38" fill="#d4d4d8">
    NBA scores, shot charts, impact stats, and fan sentiment
  </text>
  <rect x="96" y="540" width="120" height="6" rx="3" fill="${RED}"/>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${path.relative(root, out)}`);
