/**
 * Adds new English keys (and optional per-locale translations) to every catalog.
 *
 *   node scripts/sync-i18n-new-keys.mjs scripts/i18n-overlays/<file>.json
 *
 * Overlay shape:
 *   { "en": { Namespace: { key: "English" } },
 *     "locales": { es: { Namespace: { key: "Traducción" } } } }
 *
 * - en.json gets the English overlay (overwrites existing keys).
 * - Each other locale keeps its existing translations. New keys use the locale
 *   override when given, otherwise the English text (a "pending translation").
 * - en-XA is regenerated for the overlay keys.
 * - Pending keys are recorded in src/i18n/pending-translation.ts so
 *   `npm run test:i18n` does not flag them as accidental English.
 */
import fs from "fs";

const overlayPath = process.argv[2];
if (!overlayPath) {
  console.error("usage: node scripts/sync-i18n-new-keys.mjs <overlay.json>");
  process.exit(1);
}
const overlay = JSON.parse(fs.readFileSync(overlayPath, "utf8"));
const LOCALES = ["es", "fr", "de", "pt-BR", "ko", "ja", "zh-Hans", "zh-Hant"];
const PENDING_FILE = "src/i18n/pending-translation.ts";

function flat(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...flat(v, p));
    else out.push([p, v]);
  }
  return out;
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    if (typeof cur[part] !== "object" || cur[part] === null) cur[part] = {};
    cur = cur[part];
  }
  cur[parts.at(-1)] = value;
}

function pseudo(value) {
  return value.replace(/\{[^}]+\}|[^{]+/g, (chunk) =>
    chunk.startsWith("{") ? chunk : `【${chunk}】 ···`
  );
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

const enEntries = flat(overlay.en);
const en = read("messages/en.json");
for (const [key, value] of enEntries) setPath(en, key, value);
write("messages/en.json", en);

const pending = new Set();
for (const locale of LOCALES) {
  const file = `messages/${locale}.json`;
  const data = read(file);
  const localized = overlay.locales?.[locale] ?? {};
  let filled = 0;
  for (const [key, english] of enEntries) {
    const override = getPath(localized, key);
    if (override !== undefined) {
      setPath(data, key, override);
    } else if (getPath(data, key) === undefined) {
      setPath(data, key, english);
      pending.add(key);
      filled += 1;
    }
  }
  write(file, data);
  console.log(`${locale}: english-filled ${filled}`);
}

const xaFile = "messages/en-XA.json";
const xa = read(xaFile);
for (const [key, value] of enEntries) setPath(xa, key, pseudo(value));
write(xaFile, xa);

const existing = fs.existsSync(PENDING_FILE)
  ? [...fs.readFileSync(PENDING_FILE, "utf8").matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1])
  : [];
const all = [...new Set([...existing, ...pending])].sort();
fs.writeFileSync(
  PENDING_FILE,
  `/**
 * Keys added in English first. Non-English catalogs carry the English text until
 * a translation lands, so test:i18n must not flag them as accidental copies.
 * Written by scripts/sync-i18n-new-keys.mjs. Remove a key here once every locale
 * has a real translation.
 */
export const PENDING_TRANSLATION_KEYS: ReadonlySet<string> = new Set([
${all.map((k) => `  "${k}",`).join("\n")}
]);
`
);
console.log(`en keys written: ${enEntries.length}; pending keys total: ${all.length}`);
