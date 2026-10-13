import { absoluteUrl } from "@/lib/site-url";
import {
  SITEMAP_KINDS,
  type SitemapKind,
  type SitemapUrl,
  sitemapUrls,
} from "@/lib/sitemap-entries";

const NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function urlBlock(entry: SitemapUrl): string {
  const lastmod = entry.lastmod
    ? `\n<lastmod>${xmlEscape(entry.lastmod)}</lastmod>`
    : "";
  return `<url>\n<loc>${xmlEscape(entry.loc)}</loc>${lastmod}\n</url>`;
}

export function urlsetXml(kind: SitemapKind): string {
  const urls = sitemapUrls(kind);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n${urls.map(urlBlock).join("\n")}\n</urlset>\n`;
}

export function sitemapIndexXml(): string {
  const today = new Date().toISOString().slice(0, 10);
  const items = SITEMAP_KINDS.map((kind) => {
    const loc = xmlEscape(absoluteUrl(`/sitemaps/${kind}.xml`));
    return `<sitemap>\n<loc>${loc}</loc>\n<lastmod>${today}</lastmod>\n</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${NS}">\n${items.join("\n")}\n</sitemapindex>\n`;
}

export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
};
