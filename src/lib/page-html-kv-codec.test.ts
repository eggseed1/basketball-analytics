import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodePageHtmlKv, encodePageHtmlKv } from "./page-html-kv-codec";

describe("page-html-kv-codec", () => {
  it("round-trips gzip-encoded HTML", async () => {
    const html = "<html>" + "x".repeat(50_000) + "</html>";
    const buf = await encodePageHtmlKv(
      { at: 1_700_000_000_000, headers: { "content-type": "text/html" } },
      html
    );
    assert.ok(buf.byteLength < html.length / 2, "gzip should shrink repetitive HTML");
    const decoded = await decodePageHtmlKv(buf);
    assert.ok(decoded);
    assert.equal(decoded!.meta.z, 1);
    assert.equal(decoded!.html, html);
  });

  it("reads legacy plain-text KV entries", async () => {
    const html = "<html>legacy</html>";
    const raw = `${JSON.stringify({ at: 1, headers: {} })}\n${html}`;
    const decoded = await decodePageHtmlKv(raw);
    assert.ok(decoded);
    assert.equal(decoded!.html, html);
    assert.equal(decoded!.meta.z, undefined);
  });
});
