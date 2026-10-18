/**
 * Writes the iOS launch images that replace the black screen
 * when the site is opened from the home screen.
 * Run: npx tsx scripts/build-apple-splash.tsx
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import React from "react";

import { ImageResponse } from "next/og";

import { APPLE_STARTUP_SCREENS } from "../src/lib/apple-startup";

function splash(width: number, height: number, dark: boolean) {
  const mark = Math.round(Math.min(width, height) * 0.14);
  const bg = dark ? "#0c0d11" : "#f2f2f7";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="#E85D04" />
          <path
            d="M32 4v56M6 32h52M14 12c10 10 10 30 0 40M50 12c-10 10-10 30 0 40"
            fill="none"
            stroke="#1a1a1a"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="32" cy="32" r="28" fill="none" stroke="#1a1a1a" strokeWidth="1.6" />
        </svg>
      </div>
    ),
    { width, height }
  );
}

async function main() {
  const dir = path.join(process.cwd(), "public/apple-splash");
  await mkdir(dir, { recursive: true });
  for (const screen of APPLE_STARTUP_SCREENS) {
    for (const dark of [false, true]) {
      const name = `${screen.width}x${screen.height}${dark ? "-dark" : ""}.png`;
      const response = splash(screen.width, screen.height, dark);
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path.join(dir, name), bytes);
      console.log(name, bytes.length);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
