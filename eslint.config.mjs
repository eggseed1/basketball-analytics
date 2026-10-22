import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext / wrangler build output.
    ".open-next/**",
    ".wrangler/**",
    // Chrome extension Node tests use require() by design.
    "**/*.cjs",
    "extension/**/tests/**",
  ]),
]);

export default eslintConfig;
