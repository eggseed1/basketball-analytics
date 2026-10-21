/**
 * Locale matching, catalog validation (before English merge), preference precedence.
 * Run: npx tsx scripts/test-i18n.ts
 *
 * Validates original locale catalogs against English: key parity, ICU/interpolation
 * variables, empty strings, accidental English copies (allowlist), and plural forms.
 * Runtime still merges with English for resilience — this gate catches gaps before merge.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_LOCALE,
  FORCE_LOCALE_ENV,
  LOCALE_AUTO,
  LOCALES,
  PSEUDO_LOCALE,
  isAppLocale,
  isLocalePreference,
} from "../src/i18n/config";
import { isAllowedIdentical } from "../src/i18n/allowlist";
import {
  normalizeLanguageTag,
  preferencesFromAcceptLanguage,
  resolveFromAcceptLanguage,
  resolveFromPreferences,
} from "../src/i18n/match";
import { mergeMessages } from "../src/i18n/messages";
import { localeCacheKeySegment } from "../src/i18n/locale-cache-key";

function flatEntries(
  obj: Record<string, unknown>,
  prefix = ""
): Array<{ key: string; value: unknown }> {
  const out: Array<{ key: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatEntries(v as Record<string, unknown>, next));
    } else {
      out.push({ key: next, value: v });
    }
  }
  return out;
}

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return flatEntries(obj, prefix).map((e) => e.key);
}

/** ICU / next-intl style placeholders: {name} and # in plurals. */
function interpolationVars(message: string): string[] {
  const vars = new Set<string>();
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)(?:,[^}]*)?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    vars.add(m[1]);
  }
  return [...vars].sort();
}

function looksLikeIcuPlural(message: string): boolean {
  return /\{[a-zA-Z_][a-zA-Z0-9_]*,\s*plural\s*,/.test(message);
}

const root = path.join(process.cwd(), "messages");
const en = JSON.parse(fs.readFileSync(path.join(root, "en.json"), "utf8")) as Record<
  string,
  unknown
>;
const enEntries = flatEntries(en);
const enKeys = enEntries.map((e) => e.key);
const enMap = new Map(enEntries.map((e) => [e.key, e.value]));

const issues: string[] = [];

for (const locale of [...LOCALES, PSEUDO_LOCALE]) {
  if (locale === "en") continue;
  const file = path.join(root, `${locale}.json`);
  assert.ok(fs.existsSync(file), `missing catalog ${locale}`);
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const entries = flatEntries(data);
  const keys = entries.map((e) => e.key);
  const map = new Map(entries.map((e) => [e.key, e.value]));

  const missing = enKeys.filter((k) => !map.has(k));
  const unexpected = keys.filter((k) => !enMap.has(k));
  if (missing.length) {
    issues.push(`${locale}: missing keys (${missing.length}): ${missing.slice(0, 8).join(", ")}`);
  }
  if (unexpected.length) {
    issues.push(
      `${locale}: unexpected keys (${unexpected.length}): ${unexpected.slice(0, 8).join(", ")}`
    );
  }

  for (const key of enKeys) {
    const enVal = enMap.get(key);
    const locVal = map.get(key);
    if (typeof enVal !== "string") continue;
    if (locVal === undefined) continue;
    if (typeof locVal !== "string") {
      issues.push(`${locale}: ${key} is not a string`);
      continue;
    }
    if (!locVal.trim()) {
      issues.push(`${locale}: ${key} is empty`);
      continue;
    }

    const enVars = interpolationVars(enVal);
    const locVars = interpolationVars(locVal);
    if (enVars.join(",") !== locVars.join(",")) {
      issues.push(
        `${locale}: ${key} vars mismatch en=[${enVars}] loc=[${locVars}]`
      );
    }

    if (looksLikeIcuPlural(enVal) && !looksLikeIcuPlural(locVal) && locale !== PSEUDO_LOCALE) {
      // Soft: Some locales use separate One/Many keys instead of ICU; flag for review.
      // Only hard-fail when English uses ICU plural and translation dropped the selectarg entirely.
      if (enVars.some((v) => enVal.includes(`${v}, plural`)) && !locVal.includes("plural")) {
        issues.push(`${locale}: ${key} lost ICU plural`);
      }
    }

    if (
      locale !== PSEUDO_LOCALE &&
      locVal === enVal &&
      !isAllowedIdentical(key, enVal, locVal)
    ) {
      issues.push(`${locale}: ${key} still English (not allowlisted)`);
    }
  }
}

assert.equal(
  issues.length,
  0,
  `catalog validation failed:\n${issues.slice(0, 40).join("\n")}${
    issues.length > 40 ? `\n…and ${issues.length - 40} more` : ""
  }`
);

assert.equal(normalizeLanguageTag("zh-TW"), "zh-Hant");
assert.equal(normalizeLanguageTag("zh-CN"), "zh-Hans");
assert.equal(normalizeLanguageTag("zh-HK"), "zh-Hant");
assert.equal(normalizeLanguageTag("zh"), "zh-Hans");
assert.equal(normalizeLanguageTag("pt"), "pt-BR");
assert.equal(normalizeLanguageTag("pt-PT"), "pt-BR");
assert.equal(normalizeLanguageTag("en-GB"), "en");
assert.equal(normalizeLanguageTag("de-AT"), "de");

assert.equal(resolveFromPreferences(["fr-CA", "en"]), "fr");
assert.equal(resolveFromPreferences(["xx-YY", "de-DE"]), "de");
assert.equal(resolveFromPreferences(["xx"]), DEFAULT_LOCALE);
assert.equal(resolveFromPreferences(["zh-TW"]), "zh-Hant");
assert.equal(resolveFromPreferences(["zh-CN"]), "zh-Hans");

const weighted = preferencesFromAcceptLanguage("fr-CH,fr;q=0.9,en;q=0.5,de;q=0.1");
assert.equal(weighted[0]?.startsWith("fr"), true);
assert.equal(resolveFromAcceptLanguage("ja,en;q=0.8"), "ja");
assert.equal(resolveFromAcceptLanguage(""), DEFAULT_LOCALE);
assert.equal(resolveFromAcceptLanguage(null), DEFAULT_LOCALE);

assert.equal(isAppLocale("es"), true);
assert.equal(isAppLocale("pt-BR"), true);
assert.equal(isAppLocale("auto"), false);
assert.equal(isLocalePreference(LOCALE_AUTO), true);
assert.equal(isLocalePreference("nope"), false);
assert.equal(FORCE_LOCALE_ENV, "DRBL_FORCE_LOCALE");

const merged = mergeMessages(
  { Nav: { home: "Home", games: "Games" }, Common: { all: "All" } },
  { Nav: { home: "Inicio" } }
) as { Nav: { home: string; games: string }; Common: { all: string } };
assert.equal(merged.Nav.home, "Inicio");
assert.equal(merged.Nav.games, "Games");
assert.equal(merged.Common.all, "All");

// Explicit preference must win over Accept-Language (documented contract).
// Automatic: non-English Accept-Language wins; otherwise nav hint; else default.
function resolveLikeRequest(
  cookie: string | undefined,
  accept: string | null,
  force?: string | null,
  navHint?: string | null
): string {
  if (force && isAppLocale(force)) return force;
  if (cookie === PSEUDO_LOCALE) return PSEUDO_LOCALE;
  if (isLocalePreference(cookie) && cookie !== LOCALE_AUTO && isAppLocale(cookie)) {
    return cookie;
  }
  const fromAccept = resolveFromAcceptLanguage(accept);
  if (fromAccept !== DEFAULT_LOCALE) return fromAccept;
  if (isAppLocale(navHint)) return navHint;
  return fromAccept;
}
assert.equal(resolveLikeRequest("de", "fr,en;q=0.8"), "de");
assert.equal(resolveLikeRequest("auto", "fr,en;q=0.8"), "fr");
assert.equal(resolveLikeRequest(undefined, "ko"), "ko");
assert.equal(resolveLikeRequest("auto", "xx"), DEFAULT_LOCALE);
assert.equal(resolveLikeRequest("auto", "en", null, "ko"), "ko");
assert.equal(resolveLikeRequest("auto", "fr", null, "ko"), "fr");
assert.equal(resolveLikeRequest("de", "fr", "en"), "en");
assert.equal(resolveLikeRequest("en-XA", "fr", "en"), "en");

// Edge cache key isolation
assert.equal(
  localeCacheKeySegment(
    new Request("https://example.com/", {
      headers: { cookie: "DRBL_LOCALE=de", "accept-language": "fr" },
    })
  ),
  "de"
);
assert.equal(
  localeCacheKeySegment(
    new Request("https://example.com/", {
      headers: { "accept-language": "ja,en;q=0.8" },
    })
  ),
  "ja"
);
assert.equal(
  localeCacheKeySegment(
    new Request("https://example.com/", {
      headers: { cookie: "DRBL_LOCALE=de", "accept-language": "fr" },
    }),
    { forceLocale: "en" }
  ),
  "en"
);
assert.equal(
  localeCacheKeySegment(
    new Request("https://example.com/", {
      headers: { cookie: "DRBL_LOCALE=en-XA" },
    })
  ),
  "en-XA"
);
assert.equal(
  localeCacheKeySegment(
    new Request("https://example.com/", {
      headers: {
        cookie: "DRBL_LOCALE=auto; DRBL_LOCALE_NAV=ko",
        "accept-language": "en",
      },
    })
  ),
  "ko"
);

async function checkLearnLocales(): Promise<number> {
  const learnRoot = path.join(process.cwd(), "src/content/learn/locales");
  const { getLearnTopic } = await import("../src/content/learn/topics");
  const { loadLocalizedTopic, learnLocaleChain, TOPIC_TEXT_FIELDS } = await import(
    "../src/content/learn/load-localized"
  );
  const problems: string[] = [];
  let files = 0;

  for (const locale of fs.readdirSync(learnRoot, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    const topicsDir = path.join(learnRoot, locale.name, "topics");
    if (!fs.existsSync(topicsDir)) continue;
    for (const file of fs.readdirSync(topicsDir)) {
      if (!file.endsWith(".json")) continue;
      files += 1;
      const slug = file.replace(/\.json$/, "");
      const where = `${locale.name}/topics/${file}`;
      const english = getLearnTopic(slug);
      if (!english || english.slug !== slug) {
        problems.push(`${where}: no English topic with this slug`);
        continue;
      }
      const data = JSON.parse(fs.readFileSync(path.join(topicsDir, file), "utf8")) as Record<
        string,
        unknown
      >;
      if (data.slug !== slug) problems.push(`${where}: slug field is ${String(data.slug)}`);
      if (locale.name === "en") {
        // The template must stay a faithful copy of topics.ts.
        assert.deepEqual(data, JSON.parse(JSON.stringify(english)), `${where} drifted from topics.ts`);
        continue;
      }
      for (const field of TOPIC_TEXT_FIELDS) {
        const base = (english as unknown as Record<string, unknown>)[field];
        const value = data[field];
        if (base === undefined) continue; // optional field English does not have
        if (Array.isArray(base)) {
          if (!Array.isArray(value) || value.length !== base.length) {
            problems.push(`${where}: ${field} must have ${base.length} entries`);
          } else if (value.some((v) => typeof v !== "string" || !v.trim())) {
            problems.push(`${where}: ${field} has an empty or non-string entry`);
          }
        } else if (typeof value !== "string" || !value.trim()) {
          problems.push(`${where}: ${field} is missing`);
        }
      }
      const actions = data.seeInAction;
      if (!Array.isArray(actions) || actions.length !== english.seeInAction.length) {
        problems.push(`${where}: seeInAction must have ${english.seeInAction.length} entries`);
      }
    }
  }
  assert.equal(problems.length, 0, `learn locale files invalid:\n${problems.join("\n")}`);

  // Loader behaviour: localized, region fallback, English fallback, hostile input.
  const es = await loadLocalizedTopic("es", "pace");
  assert.ok(es?.localized);
  assert.equal(es?.content.name, "Ritmo");
  assert.equal(es?.content.slug, "pace");
  assert.deepEqual(es?.content.relatedIds, getLearnTopic("pace")?.relatedIds);
  assert.equal(es?.content.seeInAction[0]?.href, getLearnTopic("pace")?.seeInAction[0]?.href);
  const de = await loadLocalizedTopic("de", "how-drbl-works");
  assert.ok(de?.localized);
  assert.notEqual(de?.content.name, getLearnTopic("how-drbl-works")?.name);
  assert.equal((await loadLocalizedTopic("es-MX", "pace"))?.content.name, "Ritmo");
  for (const fallback of ["fr", "ja", "en", "en-XA", "xx"]) {
    const loaded = await loadLocalizedTopic(fallback, "pace");
    assert.equal(loaded?.localized, false, `${fallback} should fall back to English`);
    assert.equal(loaded?.content.name, "Pace");
  }
  const unknownSlug = await loadLocalizedTopic("es", "cpi");
  assert.equal(unknownSlug?.localized, false, "topic without an es file falls back to English");
  assert.equal(await loadLocalizedTopic("es", "no-such-topic"), null);
  assert.equal((await loadLocalizedTopic("es", "../pace"))?.content, undefined);
  assert.deepEqual(learnLocaleChain("../../etc"), []);
  assert.deepEqual(learnLocaleChain("zh-Hans"), ["zh-Hans"]);
  assert.deepEqual(learnLocaleChain("en"), []);
  return files;
}

checkLearnLocales()
  .then((learnFiles) => {
    console.log("test-i18n: ok", {
      locales: LOCALES.length,
      keys: enKeys.length,
      learnLocaleFiles: learnFiles,
      pseudo: PSEUDO_LOCALE,
      forceEnv: FORCE_LOCALE_ENV,
      reviewStatus: "machine-assisted; human language review pending",
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
