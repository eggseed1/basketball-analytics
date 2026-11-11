#!/usr/bin/env node
/** DRBL offline portrait-pool cohort test; exactly 50 FLUX.2 Dev calls.
 *  No website changes and no reruns unless the workflow is explicitly triggered.
 *  Predicted model charges ~$0.60 at ~$0.012 per image, subject to fal pricing.
 */
import fs from "node:fs/promises";
import path from "node:path";

const MODEL="fal-ai/flux-2";
const OUT=path.resolve("fal-dev-portrait-cohort-50");
const FIRST=630200;
const ORIGINS=[
  ["Black American","deep brown skin"],["white European","fair skin"],
  ["East Asian","light golden skin"],["Latino","warm olive-brown skin"],
  ["Black American","medium brown skin"],["South Asian","rich medium-brown skin"],
  ["mixed Black and white","light brown skin"],["Southeast Asian","warm tan skin"],
  ["Middle Eastern","olive tan skin"],["Black American","very deep brown skin"]
];
const FACES=[
  "square face with broad jaw and slightly rounded chin","long narrow oval face and pronounced ears",
  "soft rounded face with broad cheekbones","diamond-shaped face with tapered chin",
  "long rectangular face with a large forehead","angular face with wide cheekbones",
  "short oval face with full cheeks","triangular face with narrow chin",
  "asymmetrical angular jaw and deep-set eyes","round face with strong cheekbones"
];
const NOSES=[
 "wide nose with rounded tip","long nose with a slight bend","short broad nose bridge",
 "prominent straight nose","slightly crooked nose bridge","narrow aquiline nose",
 "rounded nose with low bridge","long tapered nose","broad blunt nose","narrow pointed nose"
];
const HAIRS=[
 "tight cropped natural coils","short sandy wavy hair","straight textured black crop",
 "neat short braids","close-cut high fade","medium-length wavy dark hair",
 "short tightly curled afro","short straight side-swept dark hair","shaved low buzz cut",
 "shoulder-length thin locs","short auburn curls","layered thick black hair",
 "medium length loose twists","neatly brushed short blond hair","dark curly high top fade"
];
const BROWS=[
 "thick straight eyebrows and deep-set eyes","slightly arched eyebrows and wide-set eyes",
 "one subtly higher eyebrow","narrow eyes and thick brows","large expressive eyes and gentle brow",
 "hooded eyes with straight brow","widely spaced eyes and asymmetrical brows",
 "prominent brow ridge and deep eyes","rounded eyes and low brows","short uneven eyebrows"
];
const DETAILS=[
 "no facial hair","faint natural moustache","trim close beard","clean-shaven with faint acne texture",
 "sparse chin hair","neat short goatee","subtle freckles on cheeks","faint under-eye creases",
 "short beard and light cheek blemishes","small mole under one eye"
];
const SPORTS=["guard","wing","forward","center","combo guard"];
const IMAGE_PROMPT="Photographic OFFICIAL PRO BASKETBALL PLAYER MEDIA-DAY HEADSHOT from a real team photographer, completely fictional athlete, not a real celebrity or existing player. Plain pale neutral light-gray seamless studio background, consistent color and no scenic elements or vignettes. Natural realistic 85mm lens perspective, broad even diffused softbox light from front, neutral white balance. Exactly one player, direct eye contact, front-facing head level, closed lips and a composed neutral expression, shoulders squared toward lens and level. Tight chest-up framing, top of hair fully visible, approx 7 percent empty space above hairstyle, centered nose, both shoulders visible. Plain sleeveless navy basketball jersey with realistic mesh fabric, moderately wide armholes and white trim along neckline and armholes; absolutely NO text, marks, brands, patches or numbers. Accurate human anatomy, believable ordinary athlete face, real modest facial asymmetry and subtle real skin texture; unretouched but not artificially exaggerated pores. NO beauty model styling, plastic skin, exaggerated gloss, CGI, illustration, synthetic-looking features, blur, dramatic lighting, head tilt, mouth open, accessories, watermarks or text.";
// Each profile combines independent, staggered features (not one rigid ethnicity-to-hair mapping).
const jobs=Array.from({length:50},(_,i)=>{
  const origin=ORIGINS[i%10],face=FACES[(i*7+Math.floor(i/10))%10],
    nose=NOSES[(i*3+Math.floor(i/5))%10],
    hair=HAIRS[(i*11+Math.floor(i/7))%HAIRS.length],
    brow=BROWS[(i*9+Math.floor(i/8))%10],
    detail=DETAILS[(i*7+Math.floor(i/6))%10],
    age=19+(i*7%12);
  const description="A fictional "+age+"-year-old "+origin[0]+" male professional basketball "+SPORTS[(i*3)%SPORTS.length]+" with "+origin[1]+", "+face+", "+nose+", "+hair+", "+brow+", and "+detail+".";
  return {id:"p"+String(i+1).padStart(2,"0"),description,seed:FIRST+i*1079,prompt:description+" "+IMAGE_PROMPT};
});
if(jobs.length!==50 || new Set(jobs.map(x=>x.description)).size!==50 || new Set(jobs.map(x=>x.seed)).size!==50)throw Error("Invalid cohort");
if(!process.argv.includes("--execute")) {
  console.log(JSON.stringify({model:MODEL,images:50,dimensions:[960,960],estimatedModelCostUSD:0.60,firstProfiles:jobs.slice(0,4).map(j=>({id:j.id,description:j.description}))},null,2));
  process.exit(0);
}
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.FAL_KEY)throw Error("Requires GitHub Actions secret FAL_KEY");
await fs.mkdir(OUT,{recursive:true});
const manifest={model:MODEL,quality:"standard",dimensions:[960,960],estimatedModelCostUSD:0.60,generatedAt:new Date().toISOString(),profiles:jobs.map(({id,description,seed})=>({id,description,seed})),images:[],failures:[]};
for (const job of jobs){
  try{
    const res=await fetch("https://fal.run/"+MODEL,{
      method:"POST",headers:{"Authorization":"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({prompt:job.prompt,image_size:{width:960,height:960},num_images:1,seed:job.seed,output_format:"jpeg",enable_safety_checker:true}),
      signal:AbortSignal.timeout(185000)
    });
    if(!res.ok){manifest.failures.push({id:job.id,httpStatus:res.status});console.log("Failed "+job.id+" HTTP "+res.status);continue;}
    const data=await res.json();
    const first=data.images?.[0];
    if(!first?.url){manifest.failures.push({id:job.id,httpStatus:"no-image"});continue;}
    const url=new URL(first.url);
    if(url.protocol!=="https:"||!url.hostname.endsWith(".fal.media"))throw Error("Unexpected asset host");
    const img=await fetch(url,{signal:AbortSignal.timeout(65000)});
    if(!img.ok)throw Error("Download HTTP "+img.status);
    const bytes=Buffer.from(await img.arrayBuffer());
    if(bytes.length<15000||bytes.length>15_000_000)throw Error("Unexpected output byte count");
    const file=job.id+".jpg";await fs.writeFile(path.join(OUT,file),bytes);
    manifest.images.push({id:job.id,file,seed:data.seed??job.seed,description:job.description,width:first.width,height:first.height,bytes:bytes.length});
    console.log("Saved "+manifest.images.length+"/50 "+job.id);
  } catch(error){console.log("Error on "+job.id+": "+String(error?.message??error).slice(0,150));manifest.failures.push({id:job.id,error:"generation-or-download-error"});}
  await fs.writeFile(path.join(OUT,"manifest.json"),JSON.stringify(manifest,null,2));
}
console.log("Complete: "+manifest.images.length+" files, "+manifest.failures.length+" failures.");
