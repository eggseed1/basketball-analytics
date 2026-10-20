# Learn long-form bodies by locale

English article text lives in TypeScript:

- Topics: `src/content/learn/topics.ts`
- Stat guides: `src/content/stats/guides.ts` (and `drbl-guides.ts`)

Other languages override that text with JSON files here. Page chrome (section
headings like "Why it matters") comes from `messages/*.json` under
`LearnPages`, not from these files.

```
src/content/learn/locales/
  en/topics/<slug>.json     template copied from topics.ts (not read at runtime)
  es/topics/<slug>.json     translated topic
  de/topics/<slug>.json
  <locale>/guides/<slug>.json   optional, same idea for stat guides
```

`<locale>` is one of the catalog codes: `es`, `fr`, `de`, `pt-BR`, `ko`, `ja`,
`zh-Hans`, `zh-Hant`. `<slug>` is the URL slug (`/learn/pace` is `pace`), not the
topic `id`.

## How the loader picks content

`src/content/learn/load-localized.ts` is called from `src/app/learn/[slug]/page.tsx`
(and the WAR1 page for the guide):

1. Try `locales/<locale>/<kind>/<slug>.json`. A region tag such as `es-MX` also
   tries `es`.
2. If there is no file, return the English module. The page then shows a short
   "shown in English" note for non-English locales.
3. If a file exists but a field is missing, empty, or the wrong type, that field
   keeps its English value. Nothing crashes on a half-finished file.

English never reads a JSON file. `topics.ts` stays the source of truth.

## Add a topic translation

1. Create the English template if it is not there yet:

   ```bash
   npx tsx scripts/extract-learn-topic-json.ts how-drbl-works
   ```

2. Copy `en/topics/<slug>.json` to `<locale>/topics/<slug>.json`.
3. Translate only these fields. Keep arrays the same length and order:

   | Field | Notes |
   |-------|-------|
   | `name`, `shortName`, `oneSentence` | `shortName` is the chip label, keep it short |
   | `whyItMatters`, `howToInterpret`, `howDrblUses`, `calculation`, `caveats` | arrays of strings |
   | `formula` | optional, only if it contains words |
   | `seeInAction[].label` | `href` is always taken from English |

4. Leave `id`, `slug`, `category`, `relatedIds`, `sources`, and every `href` as
   they are. The loader ignores them from locale files.
5. Do not translate metric codes (DRBL/100, WAR1, DARKO, TS%), player or team
   names, or formulas. See `src/i18n/allowlist.ts`.
6. Run `npm run test:i18n`. It checks that the file parses, the slug matches the
   file name, array lengths match English, and `en` files still equal `topics.ts`.

## Add a guide translation

Same steps with `guides/<slug>.json`, shaped like `StatGuide`. Only `name`,
`shortName`, `blurb`, `plain.*`, `deep.*` (text arrays plus `definition`,
`calculation`, `formula`) are read.

## Status

`es` and `de` ship `how-drbl-works`, `plus-minus`, and `pace` as a machine
translation proof of the pipeline. They need human review. Every other locale
and every other slug renders English until a file is added.
