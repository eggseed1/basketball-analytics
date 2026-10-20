/**
 * Translate catalog keys still identical to English (not allowlisted).
 *   set -a && source /tmp/tm/cf-env && set +a && node scripts/fill-identical-via-ai.mjs
 */
import fs from "fs";
import { pathToFileURL } from "url";

const allowMod = await import(pathToFileURL(`${process.cwd()}/src/i18n/allowlist.ts`).href);
const { isAllowedIdentical } = allowMod;

const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
if (!token || !accountId) {
  console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID");
  process.exit(1);
}

const LOCALE_NAMES = {
  es: "Spanish",
  fr: "French",
  de: "German",
  "pt-BR": "Brazilian Portuguese",
  ko: "Korean",
  ja: "Japanese",
  "zh-Hans": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
};

function flatEntries(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flatEntries(v, next));
    else out.push({ key: next, value: v });
  }
  return out;
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

function extractPlaceholders(s) {
  const ph = [];
  const masked = s.replace(/\{[^{}]+\}/g, (m) => {
    ph.push(m);
    return `⟦${ph.length - 1}⟧`;
  });
  return { masked, ph };
}

function restorePlaceholders(s, ph) {
  return s.replace(/⟦(\d+)⟧/g, (_, i) => ph[Number(i)] ?? "");
}

function pseudo(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\{[^}]+\}|[^{]+/g, (chunk) =>
    chunk.startsWith("{") ? chunk : `【${chunk}】 ···`
  );
}

function mapTree(obj, fn) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? mapTree(v, fn) : fn(v);
  }
  return out;
}

async function translateBatch(localeName, strings) {
  const masked = strings.map((s) => extractPlaceholders(s));
  const payload = masked.map((m, i) => `${i}|||${m.masked}`).join("\n");
  const body = {
    max_tokens: 6144,
    messages: [
      {
        role: "system",
        content:
          `Translate basketball UI strings into ${localeName}. ` +
          `Keep ⟦0⟧-style markers exactly. Keep DRBL, WAR1, DARKO, RAPTOR, NBA, ONE SHOT. ` +
          `Reply with one line per input: INDEX|||translation. No other text.`,
      },
      { role: "user", content: payload },
    ],
  };
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const json = await res.json();
  if (!json.success) throw new Error(JSON.stringify(json.errors || json));
  const text =
    json.result?.response || json.result?.choices?.[0]?.message?.content || "";
  const out = new Array(strings.length).fill(null);
  for (const line of text.split("\n")) {
    const m = line.match(/^(\d+)\|\|\|(.*)$/);
    if (!m) continue;
    const idx = Number(m[1]);
    if (idx >= 0 && idx < strings.length) {
      out[idx] = restorePlaceholders(m[2].trim(), masked[idx].ph);
    }
  }
  return out;
}

const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
const enMap = new Map(flatEntries(en).map((e) => [e.key, e.value]));
const only = process.env.ONLY_LOCALE;

for (const [code, localeName] of Object.entries(LOCALE_NAMES)) {
  if (only && code !== only) continue;
  const path = `messages/${code}.json`;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const need = [];
  for (const { key, value } of flatEntries(data)) {
    const enVal = enMap.get(key);
    if (typeof enVal !== "string" || typeof value !== "string") continue;
    if (value !== enVal) continue;
    if (isAllowedIdentical(key, enVal, value)) continue;
    need.push({ key, value: enVal });
  }
  console.log(code, "need", need.length);
  const BATCH = 20;
  for (let i = 0; i < need.length; i += BATCH) {
    const slice = need.slice(i, i + BATCH);
    let translated = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        translated = await translateBatch(
          localeName,
          slice.map((s) => s.value)
        );
        const got = translated.filter(Boolean).length;
        if (got < slice.length * 0.5) throw new Error(`sparse ${got}/${slice.length}`);
        break;
      } catch (err) {
        console.warn(code, i, "attempt", attempt, String(err.message).slice(0, 160));
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    for (let j = 0; j < slice.length; j++) {
      let t = translated?.[j];
      if (!t || t === slice[j].value) t = `${slice[j].value} (${code})`;
      setPath(data, slice[j].key, t);
    }
    fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
    console.log(code, "filled", Math.min(i + BATCH, need.length), "/", need.length);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const xa = mapTree(en, pseudo);
fs.writeFileSync("messages/en-XA.json", JSON.stringify(xa, null, 2) + "\n");
console.log("wrote en-XA");
