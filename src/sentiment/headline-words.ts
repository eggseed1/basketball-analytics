/**
 * Word clouds from stored headline titles. Only function words, attribution
 * filler and the player's own name are dropped; every other word counts.
 */

import type { SentimentWordCloud } from "@/sentiment/curated-types";
import { ESPN_TEAM_NICKNAMES } from "@/sentiment/headline-entities";

const STOPWORDS = new Set(
  `
a about above across after again against ago all almost along also although am among amid an and
another any anyone anything are aren't around as at away back be became because become been before
being below beside besides between beyond both but by can can't cannot could couldn't did didn't do
does doesn't doing don't done down during each either else enough even ever every few for from
further get gets getting got gotten had hadn't has hasn't have haven't having he he'd he'll he's
her here here's hers herself him himself his how how's however i i'd i'll i'm i've if in inside
into is isn't it it's its itself just let let's like many may maybe me might mine more most much
must my myself near neither never no nor not now of off often on once one ones only onto or other
others our ours ourselves out over own per quite rather really same she she'd she'll she's should
shouldn't since so some something soon still such than that that's the their theirs them
themselves then there there's these they they'd they'll they're they've this those though through
thru till to too toward towards under until up upon us very via vs was wasn't way we we'd we'll
we're we've well were weren't what what's whatever when when's where where's whether which while
who who's whom whose why why's will with within without won't would wouldn't yet you you'd you'll
you're you've your yours yourself
says said say saying report reports reported reportedly according per sources source told tells
goes going gone come comes coming make makes making made take takes taking took give gives giving
gave put puts set sets see sees seen look looks looking want wants know knows thing things
new also amid nba jr sr ii iii iv daily links
`
    .split(/\s+/)
    .filter(Boolean)
);

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .toLowerCase();
}

/** Lowercased content words in a headline, once each. */
export function headlineWords(title: string, exclude: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const raw of normalize(title).match(/[a-z0-9][a-z0-9'-]*[a-z0-9]|[a-z]/g) ?? []) {
    const word = raw.replace(/'s$/, "").replace(/^['-]+|['-]+$/g, "");
    if (word.length < 3 || !/[a-z]/.test(word)) continue;
    if (STOPWORDS.has(word) || exclude.has(word)) continue;
    out.add(word);
  }
  return [...out];
}

/**
 * Words that say nothing new in a player's own cloud: his name parts and his
 * team's nicknames ("Jayson Tatum", team 2 -> jayson, tatum, celtics).
 */
export function ownWords(name: string | undefined, teamKey: string | undefined): Set<string> {
  const nicknames = (teamKey ? ESPN_TEAM_NICKNAMES[teamKey] : undefined) ?? [];
  return new Set(
    [name ?? "", ...nicknames].flatMap((text) => normalize(text).match(/[a-z0-9][a-z0-9'-]*[a-z0-9]/g) ?? [])
  );
}

/**
 * Top words across titles, counted once per headline, most used first and
 * newest first on ties. Single-use words drop out once enough repeat.
 */
export function headlineWordCloud(
  titles: { title: string; date: string }[],
  exclude: ReadonlySet<string>,
  limit = 24
): SentimentWordCloud | undefined {
  if (!titles.length) return undefined;
  // "non-contact" and "noncontact" count as one word, shown as first written.
  const counts = new Map<string, { label: string; n: number; latest: string }>();
  for (const { title, date } of titles) {
    const seen = new Set<string>();
    for (const word of headlineWords(title, exclude)) {
      const key = word.replace(/-/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = counts.get(key);
      counts.set(key, {
        label: prev?.label ?? word,
        n: (prev?.n ?? 0) + 1,
        latest: prev && prev.latest > date ? prev.latest : date,
      });
    }
  }
  let ranked = [...counts.values()].sort(
    (a, b) => b.n - a.n || b.latest.localeCompare(a.latest)
  );
  if (ranked.filter((c) => c.n > 1).length >= 12) ranked = ranked.filter((c) => c.n > 1);
  if (!ranked.length) return undefined;
  return {
    words: ranked.slice(0, limit).map((c) => [c.label, c.n]),
    headlines: titles.length,
  };
}
