import { SITE_CONTACT_URL, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site-url";

/** Default meta description for layout, manifest, and social cards. */
export const SITE_DESCRIPTION =
  "DRBL is NBA advanced stats: DRBL/100 and WAR1 impact, efficiency, shot charts, on/off, standings, and live scores.";

/** Root document title when a page does not set its own. */
export const SITE_TITLE_DEFAULT = `${SITE_NAME}: NBA Advanced Stats and Analytics`;

/** Home absolute title (no "| DRBL" template suffix). */
export const SITE_HOME_TITLE = `${SITE_NAME}: NBA Advanced Stats | Impact, Efficiency, Scores`;

export const SITE_KEYWORDS = [
  "DRBL",
  "DRBL analytics",
  "DRBL/100",
  "WAR1",
  "NBA advanced stats",
  "NBA advanced statistics",
  "NBA analytics",
  "NBA impact stats",
  "DARKO",
  "RAPTOR",
  "NBA shot charts",
  "NBA player stats",
  "drbl.io",
] as const;

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: ["DRBL Analytics", "drbl.io", "DRBL Basketball", "DRBL NBA Advanced Stats"],
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    inLanguage: "en-US",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/ask?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: ["DRBL Analytics", "drbl.io"],
    url: `${SITE_URL}/`,
    logo: absoluteUrl("/icon"),
    description: SITE_DESCRIPTION,
    sameAs: [SITE_CONTACT_URL.replace(/\/issues\/?$/, "")],
  };
}
