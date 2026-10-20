import fs from "node:fs";
import { chromium, devices } from "playwright";
const BASE = process.env.PERF_BASE || "http://localhost:3001";
const OUT = process.argv[2] || "/tmp/tm/perf/after";
const RUNS = 3;
const ROUTES = [
  { id: "home", path: "/" },
  { id: "standings", path: "/standings" },
  { id: "players", path: "/explore/players" },
  { id: "player-detail", path: "/players/1966" },
  { id: "scores", path: "/scores" },
  { id: "ask", path: "/ask" },
];
function median(a){const s=[...a].sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2}
async function once(browser, profile, route) {
  const context = await browser.newContext({ viewport: profile.viewport, userAgent: profile.userAgent });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  if (profile.network) await cdp.send("Network.emulateNetworkConditions", profile.network);
  if (profile.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  let js=0,css=0,img=0;
  page.on("response", async (res) => {
    try {
      const t = res.request().resourceType();
      const n = Number(res.headers()["content-length"]||0);
      if (t==="script") js+=n; else if (t==="stylesheet") css+=n; else if (t==="image") img+=n;
    } catch {}
  });
  const t0=Date.now();
  const response = await page.goto(BASE+route.path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("#main-content", { timeout: 60000 }).catch(()=>null);
  await page.waitForTimeout(2500);
  const metrics = await page.evaluate(() => {
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find(p=>p.name==="first-contentful-paint")?.startTime ?? null;
    let lcp=null; try { const e=performance.getEntriesByType("largest-contentful-paint"); if(e.length) lcp=e[e.length-1].startTime; } catch {}
    let cls=0; try { for (const e of performance.getEntriesByType("layout-shift")) if(!e.hadRecentInput) cls+=e.value; } catch {}
    return { fcp, lcp, cls };
  });
  fs.mkdirSync(`${OUT}/screenshots/${profile.id}`, { recursive: true });
  await page.screenshot({ path: `${OUT}/screenshots/${profile.id}/${route.id}.png`, fullPage: false });
  await context.close();
  return { ...metrics, wall: Date.now()-t0, status: response?.status(), js, css, img };
}
const profiles = [
  { id: "desktop", viewport: { width: 1280, height: 800 }, cpu: 1 },
  { id: "mobile-slow4g", viewport: devices["iPhone 13"].viewport, userAgent: devices["iPhone 13"].userAgent, cpu: 4,
    network: { offline:false, downloadThroughput:(1.6*1024*1024)/8*0.8, uploadThroughput:(750*1024)/8*0.8, latency:150 } },
];
const browser = await chromium.launch();
const results=[];
for (const profile of profiles) {
  for (const route of ROUTES) {
    const runs=[];
    for (let i=0;i<RUNS;i++) {
      process.stderr.write(`${profile.id} ${route.id} ${i+1}\n`);
      runs.push(await once(browser, profile, route));
    }
    const ok=runs.filter(r=>typeof r.fcp==="number");
    const pick=k=>ok.map(r=>r[k]).filter(v=>typeof v==="number");
    results.push({ profile: profile.id, route: route.id, path: route.path, n: ok.length,
      median: { fcp: median(pick("fcp")), lcp: median(pick("lcp")), cls: median(pick("cls")), wall: median(pick("wall")), js: median(pick("js")), css: median(pick("css")), img: median(pick("img")) },
      range: { fcp: [Math.min(...pick("fcp")), Math.max(...pick("fcp"))], lcp: [Math.min(...pick("lcp")), Math.max(...pick("lcp"))] },
      runs });
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify({ measuredAt: new Date().toISOString(), base: BASE, note: "Lab Chromium. TBT not measured here. Not field CWV.", results }, null, 2));
for (const r of results) {
  const m=r.median;
  console.log(`${r.profile}\t${r.route}\tFCP=${m.fcp?.toFixed?.(0)}\tLCP=${m.lcp?.toFixed?.(0)}\tCLS=${m.cls?.toFixed?.(3)}\tJS=${Math.round((m.js||0)/1024)}k\twall=${m.wall?.toFixed?.(0)}`);
}
