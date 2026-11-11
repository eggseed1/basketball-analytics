#!/usr/bin/env node
/**
 * DRBL production-candidate fictional portrait pool 051..500.
 * Exactly 450 new FLUX.2 Dev requests, split into 9 explicit 50-image shards.
 * Estimated hard cap: 450 x $0.012 = $5.40, if published pricing holds.
 * No retry on HTTP failure. Run with --execute and --shard=N under GitHub Actions.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";

const SHARD_COUNT=9, PER_SHARD=50, START=51, MODEL="fal-ai/flux-2";
const SHA=s=>createHash("sha256").update(s).digest();
const int=s=>SHA(s).readUInt32BE(0);
const pick=(list,s)=>list[int(s)%list.length];
const pools={
  age:[19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36],
  face:["broad rounded face","long lean rectangular face","diamond-shaped face with high cheekbones","square jaw with rounded chin","narrow oval face","heart-shaped face with a tapered chin","angular asymmetric jawline","full round cheeks and short chin","long face with a wide forehead","strong cheekbones and softly sloping jaw","slightly uneven facial proportions"],
  nose:["wide rounded nose","long gently crooked nose","low broad nose bridge","prominent straight nose","narrow high nose bridge","short rounded nose tip","slightly asymmetric nostrils","wide nose with blunt tip","long tapered nose"],
  eye:["hooded eyes with thick natural brows","wide-set eyes with low brows","deep-set eyes with a strong brow","slightly asymmetrical eyebrows","closely spaced eyes and rounded brows","almond-shaped eyes with gentle brow line","prominent upper eyelids and thick straight brows","soft eyes with uneven brows"],
  hair:["close cropped natural coils","short neat low fade","short natural black curls","short thick wavy brown hair","short tightly curled hair","short side-swept straight hair","close buzz cut","medium-length wavy dark hair","medium neat braids","medium natural twists","short textured dark crop","receding hairline with cropped hair","clean-shaven scalp","shoulder-length thin locs","short sandy straight hair"],
  beard:["clean shaven","faint uneven stubble","short natural trimmed beard","short moustache","neatly trimmed goatee","sparse chin stubble","slightly uneven beard","no facial hair"],
  detail:["faint cheek freckles","one small mole close to a cheekbone","natural tiny acne marks","very slight asymmetry at mouth corners","subtle under-eye creases","slightly prominent ears","a barely perceptible brow scar","natural smile creases","normal uneven skin tone","slight receding temples"],
  backgrounds:[
    ["Black American","deep brown skin"],["Black American","medium-deep brown skin"],
    ["Black American","rich medium brown skin"],["white European","fair skin"],
    ["white European","light pink skin"],["Latino American","tan olive skin"],
    ["Latino American","warm medium brown skin"],["East Asian","light golden-beige skin"],
    ["East Asian","medium tan skin"],["South Asian","warm brown skin"],
    ["Southeast Asian","olive tan skin"],["Middle Eastern","light olive skin"],
    ["mixed-race American","light medium brown skin"],["Black Caribbean","dark brown skin"]
  ]
};
const BASE="An authentic neutral, unretouched 2025-era professional basketball media-day headshot photograph of ONE entirely fictional adult male athlete, NOT an existing NBA player or celebrity. Normal human facial proportions and asymmetries instead of a beautiful AI fashion-model face. Camera at face height, level direct gaze at lens, eyes clearly visible, mouth closed with relaxed serious expression, both shoulders straight toward camera. Hair and ears fully visible, eyes roughly 40 percent below top, head centered with modest headroom, chest-up crop and both shoulder tips visible. Natural DSLR portrait with an 85mm lens and broad flat frontal softbox light; neutral white balance and authentic subtle skin texture. Plain consistent very light cool gray studio sweep background, no scenery or vignette. Wearing a simple sleeveless midnight navy basketball mesh uniform with white neck and armhole piping, authentic stitching and neckline, no team logo, number, brand, words, names, tattoos or badges. Realistic face, ordinary skin and visible asymmetries. No illustration, CGI, waxy skin, polished beauty retouching, dramatic highlights, unnatural perfect smile, tilted head, cropped hair, props, watermarks, text or lettering.";
function makeIdentity(index){
  const id="v3-"+String(index).padStart(3,"0");
  const origin=pick(pools.backgrounds,"origin:"+index);
  const age=pick(pools.age,"age:"+index);
  const face=pick(pools.face,"face:"+index);
  const nose=pick(pools.nose,"nose:"+index);
  const eyes=pick(pools.eye,"eyes:"+index);
  const hair=pick(pools.hair,"hair:"+index);
  const beard=pick(pools.beard,"beard:"+index);
  const detail=pick(pools.detail,"detail:"+index);
  // Hair coloring is independent and natural: avoid correlation-induced dyed hair.
  const description="Fictional "+age+"-year-old "+origin[0]+" male pro basketball player with "+origin[1]+
    ", "+face+", "+nose+", "+eyes+", "+hair+" in a natural dark or brown shade, "+
    beard+", and "+detail+". Features deliberately natural and subtly distinctive.";
  return {id,seed:1000000+int("seed:"+index)%500000000,description,prompt:description+" "+BASE};
}
const shardArg=process.argv.find(x=>x.startsWith("--shard="));
if(!shardArg)throw Error("Pass --shard=0 through --shard=8");
const shard=Number(shardArg.slice(8));
if(!Number.isInteger(shard)||shard<0||shard>=SHARD_COUNT)throw Error("Invalid shard");
const jobs=Array.from({length:PER_SHARD},(_,i)=>makeIdentity(START+shard*PER_SHARD+i));
if(new Set(jobs.map(j=>j.description)).size!==PER_SHARD||new Set(jobs.map(j=>j.seed)).size!==PER_SHARD)throw Error("Identity collision");
const folder=path.resolve("portrait-scale-"+String(shard).padStart(2,"0"));
if(!process.argv.includes("--execute")){console.log(JSON.stringify({shard,images:PER_SHARD,model:MODEL,estimateUSD:0.6,first:jobs[0].id,last:jobs.at(-1).id}));process.exit(0);}
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.FAL_KEY)throw Error("FAL_KEY GitHub Actions secret required");
await fs.mkdir(folder,{recursive:true});
const manifest={shard,model:MODEL,expected:50,estimatedModelCostUSD:0.6,createdAt:new Date().toISOString(),images:[],failures:[]};
for(const job of jobs){
 try{
  const response=await fetch("https://fal.run/"+MODEL,{method:"POST",headers:{Authorization:"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},body:JSON.stringify({prompt:job.prompt,image_size:{width:960,height:960},num_images:1,seed:job.seed,output_format:"jpeg",enable_safety_checker:true}),signal:AbortSignal.timeout(180000)});
  if(!response.ok){manifest.failures.push({id:job.id,status:response.status});continue;}
  const data=await response.json(),im=data.images?.[0];
  if(!im?.url)throw Error("Empty generation");
  const uri=new URL(im.url);
  if(uri.protocol!=="https:"||!uri.hostname.endsWith(".fal.media"))throw Error("Unexpected media host");
  const asset=await fetch(uri,{signal:AbortSignal.timeout(60000)});
  if(!asset.ok)throw Error("Failed to download");
  const bytes=Buffer.from(await asset.arrayBuffer());
  if(bytes.length<12000||bytes.length>15000000)throw Error("Unexpected asset size");
  await fs.writeFile(path.join(folder,job.id+".jpg"),bytes);
  manifest.images.push({id:job.id,file:job.id+".jpg",seed:data.seed??job.seed,description:job.description,bytes:bytes.length});
 }catch(error){manifest.failures.push({id:job.id,error:"generation-or-download-failed"});}
 await fs.writeFile(path.join(folder,"manifest.json"),JSON.stringify(manifest,null,2));
 if(manifest.images.length%10===0)console.log("Shard "+shard+" saved "+manifest.images.length+"/50.");
}
console.log("Shard "+shard+" completed; "+manifest.images.length+" images, "+manifest.failures.length+" failures");
