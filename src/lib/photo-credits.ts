/**
 * Wikimedia Commons photo credits. The registry stores each credit as
 * "Photo: {author}, {license}, via Wikimedia Commons"; authors can contain
 * commas, license names never do.
 */
import { parsePortraitPhoto } from "@/lib/portrait-photo";

export type PhotoCredit = {
  author: string;
  license: string;
  /** Creative Commons deed; null for public domain. */
  licenseUrl: string | null;
  /** Commons file page for the photo. */
  filePage: string | null;
  /** File name without underscores, e.g. "Walt Hazzard (UCLA).jpg". */
  fileName: string | null;
};

const CC = /^CC (BY(?:-SA)?) (\d\.\d)(?: ([a-z]{2}))?$/;

export function licenseDeedUrl(license: string): string | null {
  if (license === "CC0") return "https://creativecommons.org/publicdomain/zero/1.0/";
  const m = CC.exec(license);
  if (!m) return null;
  const [, kind, version, port] = m;
  return `https://creativecommons.org/licenses/${kind.toLowerCase()}/${version}/${port ? `${port}/` : ""}`;
}

/** Commons file name from an upload.wikimedia.org or thumb.wikimedia.org URL. */
export function commonsFileName(src: string): string | null {
  try {
    const url = new URL(src);
    if (!/(^|\.)wikimedia\.org$/.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const thumb = parts.indexOf("thumb");
    const raw = thumb >= 0 ? parts[thumb + 3] : parts[parts.length - 1];
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return null;
  }
}

export function parseCreditText(credit: string): { author: string; license: string } | null {
  const body = credit.replace(/^Photo:\s*/, "").replace(/,\s*via Wikimedia Commons$/, "");
  const cut = body.lastIndexOf(", ");
  if (cut < 0) return null;
  return { author: collapseRepeat(body.slice(0, cut).trim()), license: body.slice(cut + 2).trim() };
}

/** Commons' artist field sometimes comes through twice ("Unknown authorUnknown author"). */
function collapseRepeat(text: string): string {
  const half = text.length / 2;
  return Number.isInteger(half) && text.slice(0, half) === text.slice(half) ? text.slice(0, half) : text;
}

/** Credit for a registry portrait URL, or null when it isn't a credited Commons photo. */
export function photoCreditFor(portraitUrl: string | null | undefined): PhotoCredit | null {
  if (!portraitUrl) return null;
  const photo = parsePortraitPhoto(portraitUrl);
  if (!photo.credit) return null;
  const parsed = parseCreditText(photo.credit);
  if (!parsed) return null;
  const file = commonsFileName(photo.src);
  return {
    ...parsed,
    licenseUrl: licenseDeedUrl(parsed.license),
    filePage: file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}` : null,
    fileName: file ? file.replace(/_/g, " ") : null,
  };
}

/** Plain-text credit for images where links can't work, such as share PNGs. */
export function photoCreditText(credit: PhotoCredit): string {
  const license = credit.licenseUrl
    ? `${credit.license} (${credit.licenseUrl.replace(/^https:\/\//, "")})`
    : credit.license;
  return `Photo: ${credit.author}, ${license}, via Wikimedia Commons, cropped`;
}

/** Every distinct credited Commons photo in the given registry URLs, sorted by file name. */
export function collectPhotoCredits(urls: Iterable<string>): PhotoCredit[] {
  const byFile = new Map<string, PhotoCredit>();
  for (const url of urls) {
    const credit = photoCreditFor(url);
    if (credit?.filePage && !byFile.has(credit.filePage)) byFile.set(credit.filePage, credit);
  }
  return [...byFile.values()].sort((a, b) => (a.fileName ?? "").localeCompare(b.fileName ?? ""));
}
