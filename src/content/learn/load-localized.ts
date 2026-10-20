/**
 * Locale-aware loader for long-form Learn bodies.
 *
 * English stays in the TypeScript modules (`topics.ts`, `stats/guides.ts`).
 * A locale can override the text of any topic or guide by adding
 *   src/content/learn/locales/<locale>/topics/<slug>.json
 *   src/content/learn/locales/<locale>/guides/<slug>.json
 * Anything missing falls back to English, field by field for malformed files
 * and wholesale when no file exists. See locales/README.md.
 */

import type { StatGuide } from "@/content/stats/guides";
import { getStatGuide } from "@/content/stats/guides";
import type { ResolvedLearnPage } from "@/content/learn/resolve";
import { getLearnTopic, type LearnTopic } from "@/content/learn/topics";
import { intlLocale } from "@/i18n/format-date";

/** Text fields a locale file may replace. Ids, slugs, hrefs and sources always come from English. */
export const TOPIC_TEXT_FIELDS = [
  "name",
  "shortName",
  "oneSentence",
  "whyItMatters",
  "howToInterpret",
  "howDrblUses",
  "calculation",
  "caveats",
] as const;

const GUIDE_TEXT_FIELDS = ["name", "shortName", "blurb"] as const;
const GUIDE_BODY_FIELDS = ["teaches", "doesnt", "upsides", "downsides", "apply"] as const;
const GUIDE_DEEP_EXTRA_FIELDS = ["definition", "calculation"] as const;

export type LocalizedLoad<T> = {
  content: T;
  /** True when a locale file supplied the text. False for English and for fallbacks. */
  localized: boolean;
  /** The locale file that was used, or "en" when English modules were returned. */
  locale: string;
};

const SAFE_LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

type Json = Record<string, unknown>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && v.trim());
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Locales to try, most specific first. English never loads a file. */
export function learnLocaleChain(locale: string | null | undefined): string[] {
  const tag = intlLocale(locale);
  if (!SAFE_LOCALE.test(tag)) return [];
  const base = tag.split("-")[0]!.toLowerCase();
  if (base === "en") return [];
  return tag === base || tag.startsWith("zh-") ? [tag] : [tag, base];
}

async function readLocaleFile(locale: string, kind: "topics" | "guides", slug: string): Promise<Json | null> {
  if (!SAFE_LOCALE.test(locale) || !SAFE_SLUG.test(slug)) return null;
  try {
    const mod = (await import(`./locales/${locale}/${kind}/${slug}.json`)) as { default?: unknown };
    const data = mod.default ?? mod;
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Json) : null;
  } catch {
    return null;
  }
}

/** Overlay locale text onto the English topic. Invalid or empty fields keep English. */
export function mergeTopic(base: LearnTopic, overlay: Json): LearnTopic {
  const out: LearnTopic = { ...base };
  const target = out as unknown as Record<string, unknown>;
  for (const field of TOPIC_TEXT_FIELDS) {
    const value = overlay[field];
    const english = (base as unknown as Record<string, unknown>)[field];
    if (Array.isArray(english)) {
      if (isStringArray(value)) target[field] = value;
    } else if (isText(value)) {
      target[field] = value;
    }
  }
  if (isText(overlay.formula) && base.formula) out.formula = overlay.formula;
  const labels = overlay.seeInAction;
  if (Array.isArray(labels) && labels.length === base.seeInAction.length) {
    out.seeInAction = base.seeInAction.map((entry, i) => {
      const label = (labels[i] as { label?: unknown } | undefined)?.label;
      return { href: entry.href, label: isText(label) ? label : entry.label };
    });
  }
  return out;
}

function mergeGuideBody<T extends Record<string, unknown>>(base: T, overlay: unknown, fields: readonly string[]): T {
  if (!overlay || typeof overlay !== "object") return base;
  const out: Record<string, unknown> = { ...base };
  const source = overlay as Json;
  for (const field of fields) {
    const value = source[field];
    if (Array.isArray(base[field])) {
      if (isStringArray(value)) out[field] = value;
    } else if (isText(value)) {
      out[field] = value;
    }
  }
  return out as T;
}

export function mergeGuide(base: StatGuide, overlay: Json): StatGuide {
  const out: StatGuide = { ...base };
  const target = out as unknown as Record<string, unknown>;
  for (const field of GUIDE_TEXT_FIELDS) {
    const value = overlay[field];
    if (isText(value)) target[field] = value;
  }
  out.plain = mergeGuideBody(base.plain, overlay.plain, GUIDE_BODY_FIELDS);
  out.deep = mergeGuideBody(base.deep, overlay.deep, [...GUIDE_BODY_FIELDS, ...GUIDE_DEEP_EXTRA_FIELDS]);
  const deepOverlay = overlay.deep as Json | undefined;
  if (isText(deepOverlay?.formula) && base.deep.formula) out.deep.formula = deepOverlay.formula as string;
  return out;
}

export async function loadLocalizedTopic(
  locale: string | null | undefined,
  slug: string
): Promise<LocalizedLoad<LearnTopic> | null> {
  const base = getLearnTopic(slug);
  if (!base) return null;
  for (const candidate of learnLocaleChain(locale)) {
    const file = await readLocaleFile(candidate, "topics", base.slug);
    if (file) return { content: mergeTopic(base, file), localized: true, locale: candidate };
  }
  return { content: base, localized: false, locale: "en" };
}

export async function loadLocalizedGuide(
  locale: string | null | undefined,
  slug: string
): Promise<LocalizedLoad<StatGuide> | null> {
  const base = getStatGuide(slug);
  if (!base) return null;
  for (const candidate of learnLocaleChain(locale)) {
    const file = await readLocaleFile(candidate, "guides", base.slug);
    if (file) return { content: mergeGuide(base, file), localized: true, locale: candidate };
  }
  return { content: base, localized: false, locale: "en" };
}

/** Swap a resolved Learn page for its localized copy when one exists. */
export async function loadLocalizedLearnPage(
  locale: string | null | undefined,
  page: ResolvedLearnPage
): Promise<{ page: ResolvedLearnPage; localized: boolean; locale: string }> {
  if (page.kind === "topic") {
    const loaded = await loadLocalizedTopic(locale, page.topic.slug);
    if (loaded) return { page: { kind: "topic", topic: loaded.content }, localized: loaded.localized, locale: loaded.locale };
  } else if (page.kind === "guide") {
    const loaded = await loadLocalizedGuide(locale, page.guide.slug);
    if (loaded) return { page: { kind: "guide", guide: loaded.content }, localized: loaded.localized, locale: loaded.locale };
  }
  return { page, localized: false, locale: "en" };
}

/** True when the UI locale is not English, so an English body deserves a note. */
export function isNonEnglishLocale(locale: string | null | undefined): boolean {
  return intlLocale(locale).split("-")[0]!.toLowerCase() !== "en";
}
