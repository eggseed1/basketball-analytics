export type RssItem = {
  title: string;
  link: string;
  description: string;
  publishedAt: string | null;
  guid: string | null;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function tagText(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i")
  );
  if (!match) return null;
  let body = match[1]!.trim();
  const cdata = body.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) body = cdata[1]!;
  return body;
}

function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const match of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const block = match[0];
    const title = plainText(tagText(block, "title") ?? "");
    const link = plainText(tagText(block, "link") ?? "");
    if (!title || !link) continue;
    const pub = tagText(block, "pubDate") ?? tagText(block, "dc:date");
    const parsed = pub ? new Date(plainText(pub)) : null;
    items.push({
      title,
      link,
      description: plainText(tagText(block, "description") ?? ""),
      publishedAt:
        parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      guid: tagText(block, "guid") ? plainText(tagText(block, "guid")!) : null,
    });
  }
  return items;
}
