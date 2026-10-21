import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION } from "@/lib/site-seo";
import { SITE_NAME } from "@/lib/site-url";

/** Home-screen install. Standalone hides the browser chrome so the site opens like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}: NBA Advanced Stats`,
    short_name: "DRBL",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
