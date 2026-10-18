import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site-url";

// Keep in sync with the "Block AI training crawlers" Cloudflare custom rule. Never list
// Googlebot or Bingbot; search crawlers must reach the sitemap.
const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "FacebookBot",
  "Applebot-Extended",
  "Google-Extended",
  "Google-CloudVertexBot",
  "GoogleOther",
  "Reflectionbot",
  "cohere-ai",
  "Diffbot",
  "omgili",
  "MistralAI-Training",
  "PetalBot",
  "Timpibot",
  "ImagesiftBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/internal/", "/dashboard/"],
      },
      { userAgent: AI_TRAINING_CRAWLERS, disallow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
