/**
 * Copy English Learn topics from src/content/learn/topics.ts into
 * src/content/learn/locales/en/topics/<slug>.json.
 *
 *   npx tsx scripts/extract-learn-topic-json.ts how-drbl-works plus-minus pace
 *
 * The en files are a translation template, not the runtime source. English
 * still renders from topics.ts, and test:i18n fails if an en file drifts.
 */
import fs from "node:fs";
import path from "node:path";

import { getLearnTopic } from "../src/content/learn/topics";

const slugs = process.argv.slice(2);
if (!slugs.length) {
  console.error("usage: npx tsx scripts/extract-learn-topic-json.ts <slug> [...slug]");
  process.exit(1);
}

const dir = path.join(process.cwd(), "src/content/learn/locales/en/topics");
fs.mkdirSync(dir, { recursive: true });

for (const slug of slugs) {
  const topic = getLearnTopic(slug);
  if (!topic || topic.slug !== slug) {
    console.error(`unknown topic slug: ${slug}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(topic, null, 2) + "\n");
  console.log(`wrote en/topics/${slug}.json`);
}
