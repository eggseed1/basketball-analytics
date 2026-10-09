import type { ImageLoader } from "next/image";

const ESPN_IMAGE = /^https:\/\/a\.espncdn\.com(\/i\/(teamlogos|headshots)\/[^?#]+\.png)$/;
const NBA_HEADSHOT = /^(https:\/\/cdn\.nba\.com\/headshots\/nba\/latest\/)(?:260x190|1040x760)(\/\d+\.png)$/;

/** ESPN's combiner upscales past the source, so never ask for more than this. */
const ESPN_NATIVE_WIDTH = { teamlogos: 500, headshots: 600 } as const;

const cdnImageLoader: ImageLoader = ({ src, width }) => {
  const espn = ESPN_IMAGE.exec(src);
  if (espn) {
    const cap = ESPN_NATIVE_WIDTH[espn[2] as keyof typeof ESPN_NATIVE_WIDTH];
    return `https://a.espncdn.com/combiner/i?img=${espn[1]}&w=${Math.min(width, cap)}`;
  }
  const nba = NBA_HEADSHOT.exec(src);
  if (nba) return `${nba[1]}${width <= 260 ? "260x190" : "1040x760"}${nba[2]}`;
  return src;
};

/**
 * next/image props that fetch a CDN rendition sized to the element instead of
 * the full original. Hosts without renditions load as they are.
 */
export function cdnImageProps(src: string): { src: string; loader: ImageLoader } | { src: string; unoptimized: true } {
  if (ESPN_IMAGE.test(src)) return { src, loader: cdnImageLoader };
  const nba = NBA_HEADSHOT.exec(src);
  if (nba) return { src: `${nba[1]}1040x760${nba[2]}`, loader: cdnImageLoader };
  return { src, unoptimized: true };
}

/** One URL for plain <img> tags, sized for `cssPx` on a 2x screen. */
export function cdnImageUrl(src: string, cssPx: number): string {
  const props = cdnImageProps(src);
  return "loader" in props ? props.loader({ src: props.src, width: Math.ceil(cssPx * 2) }) : src;
}
