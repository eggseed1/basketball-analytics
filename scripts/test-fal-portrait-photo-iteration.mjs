#!/usr/bin/env node
// DRBL controlled photographic portrait bakeoff: 3 distinct fictional people x 2 prompt variants x 3 models.
// Spending guard: 18 images, each 960x960; estimated model fees <= $0.30, far below $10 fal budget.
import fs from "node:fs/promises";
import path from "node:path";

const output=path.resolve("portrait-photo-iteration-01");
const models=[
 {id:"schnell",endpoint:"fal-ai/flux/schnell",cost:0.003},
 {id:"flux2-dev",endpoint:"fal-ai/flux-2",cost:0.012},
 {id:"flux2-pro",endpoint:"fal-ai/flux-2-pro",cost:0.03}
];
const people=[
 {id:"A",description:"a fictional 21-year-old Black American male basketball guard with deep brown skin, a wide rounded jaw, broad nose, close-cropped natural coils, faint uneven cheek freckles, and no beard. His left eyebrow sits a little higher than his right."},
 {id:"B",description:"a fictional 24-year-old Eastern European white male basketball forward with fair pink-toned skin, long rectangular face, high nose bridge with a slight bend, prominent ears, short dirty-blond straight hair, and faint stubble; face is strikingly different from generic fashion models."},
 {id:"C",description:"a fictional 22-year-old East Asian male basketball wing with warm olive-beige skin, high pronounced cheekbones, narrow pointed chin, slightly hooded eyes, straight thick dark hair in a textured crop, small mole on the cheek, and clean-shaven face."}
];
const styles=[
 {id:"media-day",prefix:"Authentic official basketball team MEDIA DAY roster photograph from an unretouched 2025 sports photography session. Real, candid human proportions instead of attractive commercial-model perfection. Neutral light-gray seamless background, clean and even broad studio softbox lighting. Unmistakably a photograph, not digital art."},
 {id:"documentary",prefix:"Unretouched documentary portrait photographed by an experienced sports photographer in a modest team photo studio. Believably imperfect real human skin, subtle pores, razor-sharp irises, fine baby hairs, faint uneven pigmentation, mild under-eye creases. Gentle soft studio light and realistic shadows. Neutral warm gray studio backdrop. Not cinematic, not beauty-retouched."}
];
const common="ONE actual-looking adult male athlete with a completely fictional identity. A tightly controlled official player-ID headshot taken at eye level using an 85mm portrait lens. Straight-on camera, pupils looking at lens; both shoulders level and squared to camera. Expression composed and slightly stern, lips closed. Chest-up framing with full head and hair in frame, 8 percent neutral space above hair, both shoulder tips visible, no crop at the chin. Wearing a plain dark midnight-navy basketball tank jersey: deep rounded neck opening, thick white fabric piping, realistic perforated mesh, natural folds; no numbers, names, badges, logos, brands, lettering or emblems anywhere. Athletic but not exaggerated musculature. Anatomically accurate face, realistic teeth not visible, normal eyes, normal ears, natural facial asymmetry, no beautification. Definitely a real human photography aesthetic, with skin microtexture but no exaggerated hyper-detailed pores. Avoid overly smooth skin, wax, CGI, 3D illustration, exaggerated bokeh, plastic reflections, fashion editorial styling, extreme color grading, digital painting, and watermarks.";
const jobs=people.flatMap((person,i)=>styles.flatMap((style,j)=>models.map((model,k)=>({
 id:person.id+"-"+style.id+"-"+model.id,
 person:person.id,style:style.id,model:model.id,endpoint:model.endpoint,rate:model.cost,
 seed:729001+i*1000+j*100,
 prompt:style.prefix+" "+person.description+" "+common
}))));
if(jobs.length!==18)throw Error("Expected precisely 18 test jobs");
if(!process.argv.includes("--execute")){console.log(JSON.stringify({count:jobs.length,models:models.map(m=>m.id),styles:styles.map(s=>s.id),identities:people.map(p=>p.id),estimatedCostUSD:jobs.reduce((n,j)=>n+j.rate,0)},null,2));process.exit(0);}
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.FAL_KEY)throw Error("FAL_KEY secret and GitHub Actions required");
await fs.mkdir(output,{recursive:true});
const manifest={generatedAt:new Date().toISOString(),purpose:"Prompt/model photographic comparison",pricingEstimateUSD:jobs.reduce((n,j)=>n+j.rate,0),images:[],failures:[]};
for(const [idx,job] of jobs.entries()){
 const payload={prompt:job.prompt,image_size:{width:960,height:960},num_images:1,seed:job.seed,output_format:"jpeg",enable_safety_checker:true};
 if(job.model==="schnell")Object.assign(payload,{num_inference_steps:4,guidance_scale:3.5});
 const response=await fetch("https://fal.run/"+job.endpoint,{method:"POST",headers:{Authorization:"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(190000)});
 if(!response.ok){
  console.log("Failed "+job.id+" HTTP "+response.status+"; continuing");
  manifest.failures.push({id:job.id,status:response.status});
 } else {
  const data=await response.json();
  const info=data.images?.[0];
  if(info?.url){
   const url=new URL(info.url);
   if(url.protocol!=="https:"||!url.hostname.endsWith(".fal.media"))throw Error("Untrusted output image host");
   const download=await fetch(url,{signal:AbortSignal.timeout(65000)});
   if(!download.ok)throw Error("Download failed HTTP "+download.status);
   const bytes=Buffer.from(await download.arrayBuffer());
   if(bytes.length<10000||bytes.length>15_000_000)throw Error("Unexpected image byte count");
   const file=job.id+".jpg";
   await fs.writeFile(path.join(output,file),bytes);
   manifest.images.push({file,...job,width:info.width,height:info.height,actualSeed:data.seed??job.seed,bytes:bytes.length});
   console.log("Saved "+manifest.images.length+" image(s): "+job.id+" ("+(idx+1)+"/18)");
  }else manifest.failures.push({id:job.id,status:"missing-images"});
 }
 await fs.writeFile(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2));
}
const cells=manifest.images.map(x=>'<figure><img loading="lazy" src="'+x.file+'"><figcaption><b>'+x.person+" / "+x.style+'</b><span>'+x.model+'</span></figcaption></figure>').join("\n");
const html='<!doctype html><html><head><meta charset="utf-8"><title>DRBL portrait photographic tests</title><style>body{font:14px system-ui;background:#10151e;color:#fff;padding:24px}h1{font-size:25px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}figure{margin:0;background:#273343;border-radius:10px;overflow:hidden}img{display:block;width:100%}figcaption{padding:10px;display:flex;justify-content:space-between}span{color:#9dc3e8}@media(max-width:700px){main{grid-template-columns:repeat(2,1fr)}}</style></head><body><h1>DRBL | 3 people × 2 prompts × 3 models</h1><p>Review authenticity, identity differentiation, framing, skin and uniform construction.</p><main>'+cells+'</main></body></html>';
await fs.writeFile(path.join(output,"review.html"),html);
console.log("Finished: "+manifest.images.length+" images, "+manifest.failures.length+" failed. See Actions artifact.");
