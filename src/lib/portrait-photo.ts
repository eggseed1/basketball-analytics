/**
 * Game-photo portraits (Wikimedia Commons) ride through the portrait registry
 * as plain URLs. The face crop and the required license credit travel in the
 * URL fragment, which browsers never send when fetching the image, so every
 * surface that already passes `portraitUrl` gets them without new props.
 */

const PREFIX = "drbl-photo=";

export type PortraitFaceCrop = {
  /** Face center as fractions of image width / height (origin top left). */
  cx: number;
  cy: number;
  /** Face box height as a fraction of image height. */
  fh: number;
  /** Image width / height. */
  aspect: number;
};

export type PortraitPhoto = {
  src: string;
  crop: PortraitFaceCrop | null;
  credit: string | null;
};

const round = (n: number) => Math.round(n * 10000) / 10000;

export function encodePortraitPhoto(
  src: string,
  crop: PortraitFaceCrop,
  credit: string
): string {
  const nums = [crop.cx, crop.cy, crop.fh, crop.aspect].map(round).join(",");
  return `${src}#${PREFIX}${nums}&credit=${encodeURIComponent(credit)}`;
}

export function parsePortraitPhoto(url: string): PortraitPhoto {
  const hash = url.indexOf("#");
  if (hash < 0) return { src: url, crop: null, credit: null };
  const src = url.slice(0, hash);
  const fragment = url.slice(hash + 1);
  if (!fragment.startsWith(PREFIX)) return { src, crop: null, credit: null };
  const [numsPart, ...rest] = fragment.slice(PREFIX.length).split("&");
  const nums = numsPart.split(",").map(Number);
  const creditPart = rest.find((p) => p.startsWith("credit="));
  const crop =
    nums.length === 4 && nums.every((n) => Number.isFinite(n) && n > 0)
      ? { cx: nums[0], cy: nums[1], fh: nums[2], aspect: nums[3] }
      : null;
  return {
    src,
    crop,
    credit: creditPart ? decodeURIComponent(creditPart.slice(7)) : null,
  };
}

/** Face height as a share of the circle diameter, and where the face center sits. */
const FACE_SHARE = 0.4;
/** Vision's face box stops at the forehead, so leave room for the top of the head. */
const FACE_TOP = 0.48;

/** Zooming a tight photo to cover the circle past this cuts off chin and forehead. */
const MAX_FACE_SHARE = 0.55;
/** Largest uncovered edge (share of the diameter) accepted to keep the face whole and centered. */
const MAX_GAP = 0.15;

export type FaceCropBox = {
  style: { width: string; height: string; left: string; top: string };
  /** False when part of the circle is left for a backdrop to fill. */
  covers: boolean;
};

/**
 * Percent box for an absolutely positioned <img> inside a square frame so the
 * face is centered and whole. Covers the circle when it can do so without
 * over-zooming the face or pushing it off center.
 */
export function faceCropBox(crop: PortraitFaceCrop): FaceCropBox {
  let h = FACE_SHARE / crop.fh;
  let w = h * crop.aspect;
  const zoom = Math.min(Math.max(1 / w, 1 / h, 1), MAX_FACE_SHARE / FACE_SHARE);
  w *= zoom;
  h *= zoom;
  const place = (v: number, size: number) =>
    Math.min(Math.max(0, 1 - size) + MAX_GAP, Math.max(Math.min(0, 1 - size) - MAX_GAP, v));
  const left = place(0.5 - crop.cx * w, w);
  const top = place(FACE_TOP - crop.cy * h, h);
  const eps = 1e-4;
  const covers = left <= eps && top <= eps && left + w >= 1 - eps && top + h >= 1 - eps;
  const pct = (v: number) => `${round(v * 100)}%`;
  return { style: { width: pct(w), height: pct(h), left: pct(left), top: pct(top) }, covers };
}
