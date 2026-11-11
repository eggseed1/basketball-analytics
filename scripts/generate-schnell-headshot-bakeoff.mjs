#!/usr/bin/env node
// Offline FLUX.1 Schnell bakeoff: 6 fictional players x 2 fixed prompt styles.
// Intentional hard cap: 12 images at 960x960 (<1 megapixel), approx $0.036 at $0.003/MP.
import fs from "node:fs/promises";
import path from "node:path";
const OUT=path.resolve("portrait-bakeoff-output");
const people=[
 ["A","20-year-old male, deep-brown skin, broad nose, rounded jaw, short dense natural coils, faint freckles"],
 ["B","23-year-old male, light olive skin, narrow asymmetric nose, strong jaw, medium-length wavy black hair"],
 ["C","19-year-old male, fair skin, soft round face, short auburn hair, natural freckles, uneven eyebrows"],
 ["D","25-year-old male, medium tan skin, wide cheekbones, braided shoulder-length hair, short goatee"],
 ["E","21-year-old male, dark-brown skin, long narrow face, close-cropped fade, eyebrow scar"],
 ["F","22-year-old male, golden-brown skin, square face, slightly crooked nose, layered short black hair"],
];
const styles=[
 ["editorial","Authentic unretouched professional basketball media-day roster photograph. Natural skin pores, subtle imperfections, soft even diffused studio lighting, documentary editorial color, no retouching."],
 ["broadcast","Official professional basketball broadcast roster headshot captured by a sports team photographer. Diffused softboxes, controlled soft jaw shadow, restrained natural skin sheen, realistic microtexture."],
];
const jobs=people.flatMap((person,i)=>styles.map((style,j)=>({
 file:String(i+1).padStart(2,"0")+"-"+person[0]+"-"+style[0]+".jpg",
 player:person[0],style:style[0],seed:415091+i*100+j,
 prompt:style[1]+" Fictional professional basketball prospect: "+person[1]+". One invented adult athlete, never a real player or celebrity. Level direct eye contact, face and BOTH shoulders squared to camera, mouth closed, neutral relaxed expression. Upper-chest portrait, all hair fully visible, generous headroom, centered symmetrical crop. Plain charcoal-gray sleeveless basketball practice jersey with realistic V-neck collar and fabric stitching, absolutely no logo, letters, numbers or words. Neutral light-gray seamless background. 85mm DSLR lens. Realistic photographic anatomy and facial asymmetry. Not CGI, not illustration, not plastic or overly smooth, not glamor retouched, no side pose, no watermark.",
})));
if(jobs.length!==12)throw Error("Image budget cap violated");
if(!process.argv.includes("--execute")) {
 console.log(JSON.stringify({model:"fal-ai/flux/schnell",images:jobs.length,maxBudgetUSD:0.036,firstJobs:jobs.slice(0,2)},null,2));
 process.exit(0);
}
if(!process.env.GITHUB_ACTIONS || !process.env.FAL_KEY)throw Error("Use GitHub Actions with FAL_KEY repository secret");
await fs.mkdir(OUT,{recursive:true});
const manifest={model:"fal-ai/flux/schnell",generatedAt:new Date().toISOString(),images:[]};
for(const job of jobs){
 const res=await fetch("https://fal.run/fal-ai/flux/schnell",{
   method:"POST",
   headers:{"Authorization":"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({prompt:job.prompt,image_size:{width:960,height:960},num_inference_steps:4,guidance_scale:3.5,num_images:1,seed:job.seed,enable_safety_checker:true,output_format:"jpeg",acceleration:"none"}),
   signal:AbortSignal.timeout(120000)
 });
 if(!res.ok)throw Error("fal generation failed for "+job.file+": HTTP "+res.status);
 const result=await res.json();
 if(!Array.isArray(result.images)||result.images.length!==1)throw Error("Unexpected fal response");
 const info=result.images[0];const url=new URL(info.url);
 if(url.protocol!=="https:"||!url.hostname.endsWith(".fal.media"))throw Error("Unexpected asset host");
 const image=await fetch(info.url,{signal:AbortSignal.timeout(60000)});
 if(!image.ok)throw Error("Image download failed "+image.status);
 const bytes=Buffer.from(await image.arrayBuffer());
 if(bytes.length<10000||bytes.length>12000000)throw Error("Unexpected image size");
 await fs.writeFile(path.join(OUT,job.file),bytes);
 manifest.images.push({file:job.file,player:job.player,style:job.style,seed:result.seed??job.seed,width:info.width,height:info.height,bytes:bytes.length,prompt:job.prompt});
 await fs.writeFile(path.join(OUT,"manifest.json"),JSON.stringify(manifest,null,2));
 console.log("Saved "+manifest.images.length+"/12 "+job.file);
}
const cards=manifest.images.map(x=>'<figure><img src="'+x.file+'" alt="Player '+x.player+' '+x.style+'"><figcaption><strong>'+x.player+' / '+x.style+'</strong> · seed '+x.seed+'</figcaption></figure>').join("\n");
const html='<!doctype html><html><head><meta charset="utf-8"><title>DRBL Schnell portrait test</title><style>body{font:15px system-ui;background:#111827;color:white;margin:32px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0;background:#263244;border-radius:12px;overflow:hidden}img{width:100%;display:block}figcaption{padding:12px}@media(max-width:780px){main{grid-template-columns:repeat(2,1fr)}}</style></head><body><h1>DRBL FLUX.1 Schnell / 12-photo bakeoff</h1><p>6 fictional identities, two different photo styles each. Compare naturalism and crop consistency.</p><main>'+cards+'</main></body></html>';
await fs.writeFile(path.join(OUT,"review.html"),html);
console.log("Completed. Open review.html from the Actions artifact.");
