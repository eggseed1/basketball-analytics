import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createGeneratedLeague } from "../src/gm/seed/create-league.ts";
import { prepareFranchise, exportFranchise } from "../src/gm/engine/franchise.ts";
import { BADGES, badgeCap, badgeEarned } from "../src/gm/engine/badges.ts";

const base = process.env.DRBL_VERIFY_BASE_URL ?? "https://basketball-analytics.drbl-analytics.workers.dev";
const dir = "/tmp/franchise-live";
mkdirSync(dir,{recursive:true});
const fixture = prepareFranchise(createGeneratedLeague({userTeamId:"bos",season:2028,seed:23}));
fixture.franchise.pauses = {offers:false,scouting:false,injuries:false};
const roster = fixture.players.filter(p=>p.teamId===fixture.userTeamId&&p.contract);
const pupil = roster.find(p=>BADGES.some(b=>badgeCap(p,b.id)>badgeEarned(p,b.id)));
assert.ok(pupil);
const focus = BADGES.find(b=>badgeCap(pupil,b.id)>badgeEarned(pupil,b.id));
const browser = await chromium.launch({headless:true});
const report = {base,sourceRevision:process.env.GITHUB_SHA,widths:[],errors:[]};
try {
  for(const width of [390,1440]){
    const page = await browser.newPage({viewport:{width,height:900}});
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    const response=await page.goto(base+"/gm",{waitUntil:"domcontentloaded",timeout:120000});
    assert.equal(response?.ok(),true,"production Franchise Lab responds");
    await page.getByLabel("Import a franchise save",{exact:true}).setInputFiles({name:"release-check.json",mimeType:"application/json",buffer:Buffer.from(exportFranchise(fixture))});
    await page.getByRole("link",{name:"Development",exact:true}).first().waitFor({timeout:90000});
    assert.equal(await page.locator(".gm-desk-nav__primary > a").first().getAttribute("href"),"/gm");
    await page.goto(base+"/gm/development",{waitUntil:"domcontentloaded",timeout:120000});
    await page.getByRole("heading",{name:"Development",exact:true}).waitFor();
    await page.getByLabel("Badge player",{exact:true}).selectOption(pupil.id);
    const emphasis=page.getByLabel(`Badge emphasis for ${pupil.name}`,{exact:true});
    await emphasis.selectOption(focus.id);
    assert.equal(await page.getByTestId("badge-board").locator("article").count(),10);
    await page.screenshot({path:`${dir}/badges-${width}.png`,fullPage:true});
    await page.reload({waitUntil:"domcontentloaded"});
    await page.getByLabel("Badge player",{exact:true}).selectOption(pupil.id);
    assert.equal(await emphasis.inputValue(),focus.id,"badge emphasis survives production reload");
    await page.getByRole("link",{name:`Open ${pupil.name}'s player card`,exact:true}).click();
    await page.waitForURL(`**/gm/player/${pupil.id}`);
    await page.getByLabel(`Skill badges for ${pupil.name}`,{exact:true}).waitFor();
    await page.goto(base+"/gm",{waitUntil:"domcontentloaded",timeout:120000});
    const calendar=page.locator(".gm-cal").first();
    await calendar.waitFor();
    async function cursor(){
      const month=await calendar.locator(".gm-cal__title").innerText();
      const day=await calendar.locator(".is-today .gm-cal__num").innerText();
      const value=Date.parse(`${month} ${day.trim().split(/\s/)[0]}`);
      assert.ok(Number.isFinite(value),"calendar displays a valid date");
      return value;
    }
    let previous=await cursor();
    for(let cycle=0;cycle<2;cycle++){
      await calendar.getByRole("button",{name:"Auto season",exact:true}).click();
      await page.waitForTimeout(700);
      const current=await cursor();
      assert.ok(current>=previous,"auto-sim cannot rewind the calendar");
      await calendar.getByRole("button",{name:"Stop",exact:true}).click();
      previous=await cursor();
      assert.ok(previous>=current,"stopping cannot rewind the calendar");
    }
    await page.reload({waitUntil:"domcontentloaded"});
    await calendar.waitFor();
    assert.equal(await cursor(),previous,"simulation date survives reload");
    await page.screenshot({path:`${dir}/calendar-${width}.png`,fullPage:true});
    await page.goto(base+"/gm/settings",{waitUntil:"domcontentloaded",timeout:120000});
    const pending=page.waitForEvent("download");
    await page.getByRole("button",{name:"Export this franchise",exact:true}).click();
    const download=await pending;
    const saved=JSON.parse(readFileSync(await download.path(),"utf8")).league;
    assert.ok(saved.day>fixture.day,"simulation advanced on the live client");
    assert.equal(saved.players.find(p=>p.id===pupil.id).badgeFocus,focus.id);
    assert.ok(saved.players.some(p=>p.badges?.gameIds?.length),"official live games persist badge progress");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"no mobile or desktop overflow");
    assert.deepEqual(errors,[],"live client has no runtime errors");
    report.widths.push({width,day:saved.day,badgeCount:10,emphasis:focus.id,calendarDate:new Date(previous).toISOString(),errors});
    writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));
    await page.close();
  }
  console.log("Production Franchise Lab passed at 390px and 1440px: ten badges, emphasis, player cards, start/stop/resume, forward dates, reload, exports and official-game badge progress.");
} catch(error){
  report.errors.push(String(error));
  writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));
  throw error;
} finally {await browser.close();}
