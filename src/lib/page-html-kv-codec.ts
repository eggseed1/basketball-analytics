/**
 * PAGE_CACHE value codec: JSON meta line + gzip HTML body.
 * Legacy plain-text entries (meta\\nhtml) still decode.
 */

export type PageHtmlKvMeta = {
  at: number;
  headers: Record<string, string>;
  /** 1 = body after the first newline is gzip(html). Absent = utf-8 html. */
  z?: 1;
};

const te = new TextEncoder();
const td = new TextDecoder();

async function gzipString(html: string): Promise<Uint8Array> {
  const stream = new Blob([html]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function findNewline(bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) return i;
  }
  return -1;
}

/** Pack meta + gzip(html) for KV put (ArrayBuffer). */
export async function encodePageHtmlKv(
  meta: Omit<PageHtmlKvMeta, "z">,
  html: string
): Promise<ArrayBuffer> {
  const metaLine = JSON.stringify({ ...meta, z: 1 as const }) + "\n";
  const head = te.encode(metaLine);
  const body = await gzipString(html);
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out.buffer;
}

/**
 * Decode a KV value. Accepts ArrayBuffer (preferred) or legacy UTF-8 string.
 */
export async function decodePageHtmlKv(
  raw: ArrayBuffer | string
): Promise<{ meta: PageHtmlKvMeta; html: string } | null> {
  try {
    if (typeof raw === "string") {
      const newline = raw.indexOf("\n");
      if (newline < 0) return null;
      const meta = JSON.parse(raw.slice(0, newline)) as PageHtmlKvMeta;
      if (meta.z === 1) return null; // gzip body cannot live in a JS string safely
      return { meta, html: raw.slice(newline + 1) };
    }

    const bytes = new Uint8Array(raw);
    const newline = findNewline(bytes);
    if (newline < 0) return null;
    const meta = JSON.parse(td.decode(bytes.subarray(0, newline))) as PageHtmlKvMeta;
    const body = bytes.subarray(newline + 1);
    if (meta.z === 1) {
      return { meta, html: await gunzipBytes(body) };
    }
    return { meta, html: td.decode(body) };
  } catch {
    return null;
  }
}
