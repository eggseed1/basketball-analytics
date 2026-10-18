import { SITEMAP_HEADERS, sitemapIndexXml } from "@/lib/sitemap-xml";

export function GET() {
  return new Response(sitemapIndexXml(), { headers: SITEMAP_HEADERS });
}
