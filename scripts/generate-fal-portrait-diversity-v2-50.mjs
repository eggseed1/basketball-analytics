#!/usr/bin/env node
/**
 * DRBL portrait-pool v2: 50 independent fictional identities, quota-balanced
 * hairstyles, beard, age, and facial traits. Offline research only.
 * Generation requires --execute in GitHub Actions; expected ~$0.60 at ~$0.012/image.
 */
import fs from "node:fs/promises";
import path from "node:path";

const COUNT=50, MODEL="fal-ai/flux-2", OUT=path.resolve("fal-portrait-diversity-v2-50");
const seedHash=s=>{let x=2166136261;for(const ch of s){x^=ch.charCodeAt(0);x=Math.imul(x,16777619);}return x>>>0};
const perm=(values,salt)=>values.map((value,i)=>({value,rank:seedHash(salt+":"+i)})).sort((a,b)=>a.rank-b.rank).map(x=>x.value);
const spread=(pairs,salt)=>perm(pairs.flatMap(([v,n])=>Array(n).fill(v)),salt);
const hair=spread([
 ["cropped natural coils",9],["short low taper fade",8],["short straight natural textured hair",7],
 ["short naturally wavy hair",6],["tight buzz cut",5],["short-to-medium natural curls",5],
 ["medium-length neat braids",3],["shoulder-length locs",3],["thinning hair with receding temples",2],
 ["clean-shaven scalp",1],["loose shoulder-length wavy hair",1]
],"hair");
const facialHair=spread([["clean-shaven",19],["faint mustache or light stubble",13],["short trimmed goatee",8],["close short beard",8],["full natural beard",2]],"beard");
const age=spread([["19 to 22",13],["23 to 26",15],["27 to 30",13],["31 to 36",9]],"age");
const face=spread([["long oval face",8],["round broad face",7],["square face with strong jaw",8],["narrow angular face",7],["diamond face with prominent cheekbones",7],["rectangular face with pronounced forehead",6],["soft triangular face with tapered chin",7]],"shape");
const noses=perm(["short broad nose","long slightly crooked nose","wide rounded nose","straight prominent nose","narrow high-bridge nose","slightly asymmetric nose","broad low-bridge nose","hooked nose","blunt nose tip","long broad nose"].flatMap(x=>Array(5).fill(x)),"nose");
const details=spread([["subtle natural facial asymmetry",9],["small mole on one cheek",5],["subtle freckles",5],["mild under-eye creases",7],["faint acne marks",7],["slightly uneven eyebrows",8],["visible smile lines",5],["minor realistic skin texture variation",4]],"detail");
const populations=spread([
 ["Black American adult with deep brown skin",10],["Black American adult with medium brown skin",6],
 ["white European adult with fair skin",9],["Latino adult with olive or tan skin",7],
 ["East Asian adult with light to medium skin",5],["South Asian adult with medium brown skin",4],
 ["Southeast Asian adult with warm tan skin",3],["Middle Eastern adult with olive skin",3],
 ["mixed Black and white adult with medium light brown skin",3]
],"appearance");
const extraFeatures=perm([
 "prominent ears","close-set eyes","large expressive eyes","thick straight eyebrows",
 "asymmetric eyebrows","slightly hooded eyes","high cheekbones","low cheekbones",
 "strong brow ridge","long chin"
].flatMap(x=>Array(5).fill(x)),"feature");
for(const [name,arr] of Object.entries({hair,facialHair,age,face,noses,details,populations,extraFeatures})){
 if(arr.length!==COUNT)throw Error(name+" quota total mismatch: "+arr.length);
}
const common="A photograph of ONE entirely fictional adult male professional basketball player during an official media-day roster photo shoot. Not a celebrity or real NBA athlete. Authentic ordinary human facial anatomy, natural irregularity, genuinely different faces across the roster rather than generic handsome fashion-model perfection. Camera at eye height, straight-on face, nose centered, level shoulders squared to lens, eyes looking at camera, closed lips, calm neutral expression. Cropped at upper chest, entire hairstyle and both ears fully inside frame with modest headroom, both shoulder tips visible. Neutral light gray seamless backdrop. Real 85mm sports DSLR photo with broad even frontal softbox lighting and neutral white balance. Matte real-looking skin with fine subtle pores and ordinary blemishes, never glossy or beautified. A plain midnight navy sleeveless basketball mesh jersey with white neckline and armhole piping, no team marks, numbers, brands, text or emblems. No illustration, CGI, synthetic plastic face, exaggerated makeup, cinematic shadows, facial accessories, cut-off hair, watermark or writing.";
const jobs=Array.from({length:COUNT},(_,i)=>{
 const id="v2-"+String(i+1).padStart(2,"0");
 const ageRange=age[i];
 const ageValue=ageRange==="19 to 22"?19+(i%4):ageRange==="23 to 26"?23+(i%4):ageRange==="27 to 30"?27+(i%4):31+(i%6);
 const description="A "+ageValue+"-year-old "+populations[i]+", "+face[i]+", "+noses[i]+", "+extraFeatures[i]+", "+hair[i]+", "+facialHair[i]+", "+details[i]+". Natural hair coloring appropriate for the individual's appearance, not dyed red, orange, blond or blue.";
 return {id,age:ageValue,hair:hair[i],facialHair:facialHair[i],appearance:populations[i],face:face[i],description,
  seed:806700+i*1009,prompt:description+" "+common};
});
const countKey=(key)=>Object.fromEntries([...new Set(jobs.map(x=>x[key]))].sort().map(k=>[k,jobs.filter(x=>x[key]===k).length]));
if(jobs.length!==50 || new Set(jobs.map(x=>x.description)).size!==50)throw Error("Non-unique identity descriptions");
const stats={hair:countKey("hair"),facialHair:countKey("facialHair"),appearance:countKey("appearance"),ages:{young:jobs.filter(x=>x.age<=22).length,prime:jobs.filter(x=>x.age>=23&&x.age<=30).length,veteran:jobs.filter(x=>x.age>=31).length}};
if(!process.argv.includes("--execute")){
 console.log(JSON.stringify({images:jobs.length,model:MODEL,costEstimateUSD:0.60,stats,sample:jobs.slice(0,3).map(x=>x.description)},null,2));
 process.exit(0);
}
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.FAL_KEY)throw Error("Missing GitHub Actions FAL_KEY secret");
await fs.mkdir(OUT,{recursive:true});
const manifest={version:2,model:MODEL,generatedAt:new Date().toISOString(),estimatedModelChargesUSD:0.60,populationStats:stats,profiles:jobs.map(({prompt,...rest})=>rest),images:[],failures:[]};
for(const job of jobs){
 try{
  const response=await fetch("https://fal.run/"+MODEL,{
   method:"POST",headers:{Authorization:"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({prompt:job.prompt,image_size:{width:960,height:960},num_images:1,seed:job.seed,output_format:"jpeg",enable_safety_checker:true}),
   signal:AbortSignal.timeout(190000)
  });
  if(!response.ok){manifest.failures.push({id:job.id,status:response.status});console.log("Failed "+job.id+" HTTP "+response.status);continue;}
  const data=await response.json();const im=data.images?.[0];if(!im?.url)throw Error("Missing image");
  const u=new URL(im.url);if(u.protocol!=="https:"||!u.hostname.endsWith(".fal.media"))throw Error("Untrusted image host");
  const fetchImage=await fetch(im.url,{signal:AbortSignal.timeout(65000)});if(!fetchImage.ok)throw Error("Failed image download");
  const bytes=Buffer.from(await fetchImage.arrayBuffer());if(bytes.length<15000||bytes.length>15000000)throw Error("Invalid image byte count");
  const file=job.id+".jpg";await fs.writeFile(path.join(OUT,file),bytes);
  manifest.images.push({id:job.id,file,description:job.description,seed:data.seed??job.seed,age:job.age,hair:job.hair,bytes:bytes.length});
  console.log("Saved "+manifest.images.length+"/50 "+job.id);
 }catch(error){manifest.failures.push({id:job.id,error:"generation-or-download-error"});console.log("Error on "+job.id+": "+String(error.message).slice(0,100));}
 await fs.writeFile(path.join(OUT,"manifest.json"),JSON.stringify(manifest,null,2));
}
console.log("Done. Generated "+manifest.images.length+" and failed "+manifest.failures.length);
