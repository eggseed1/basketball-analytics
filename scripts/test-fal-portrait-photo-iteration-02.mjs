#!/usr/bin/env node
// Second DRBL iteration: choose a realistic standardized portrait prompt.
// 3 fictional athletes x 2 styles x FLUX.2 Dev/Pro = 12 images, estimated $0.252.
import fs from "node:fs/promises";
import path from "node:path";
const output=path.resolve("portrait-photo-iteration-02");
const models=[{id:"dev",endpoint:"fal-ai/flux-2",price:0.012},{id:"pro",endpoint:"fal-ai/flux-2-pro",price:0.03}];
const identities=[
 {id:"D",look:"23-year-old Black male pro basketball shooting guard with deep brown skin, broad round face, widely spaced eyes, short uniform taper fade, thick straight eyebrows, blunt broad nose and a short patchy beard; distinctly natural imperfect complexion with faint acne scarring along his cheekbones"},
 {id:"E",look:"21-year-old white European male basketball forward with fair skin, thick wavy dark-brown hair, slight widow's peak, visible freckles, noticeably long straight nose with a tiny bend, angular chin and subtle sparse mustache; real-life athlete facial features not a runway model"},
 {id:"F",look:"24-year-old Filipino American male basketball guard with warm bronze skin, oval slightly asymmetric face, thick unruly short black hair, rounded nose bridge, defined cheekbones, natural under-eye creases, slight facial stubble and a small distinct mole near his left jaw"}
];
const variants=[
 {id:"roster-tight",style:"Official unedited professional basketball team's 2025 media-day roster headshot. Plain seamless neutral pale cool gray (#d6d8da) photographic paper backdrop, no backdrop gradients, no environmental props. A competent but unglamorous team photographer uses a large frontal softbox. Balanced neutral white balance, clean photographic detail. Face fills approximately 45 percent of image height; hair starts at 8 percent down from top edge; upper chest starts at 77 percent of frame. This is a roster portrait for an official basketball player profile, not an advertising campaign."},
 {id:"natural-skin",style:"Very realistic unretouched 2025 team media-day athlete photo from a professional DSLR, slight natural skin texture, pores and blemishes without artificial sharpening. One large frontal diffused light source, neutral light-gray seamless backdrop without vignette. Lightly uneven skin tone, pores on the nose, subtle facial asymmetry, soft natural shadow below chin. Camera captures a believable human rather than an idealized digitally generated athlete. Crop from top hair to mid chest with square shoulders, no dynamic lighting."}
];
const anchor="Exactly one entirely fictional real-looking adult professional male basketball player photographed alone, upright in a static identification headshot. Direct eye contact, face perfectly front-facing, both shoulders squared toward lens, shoulder line horizontal, nose centered in frame, mouth closed with neutral slightly serious expression. Athletic natural body, not exaggerated bodybuilding. Plain dark navy basketball sleeveless mesh practice jersey with white piping around both arm openings and neck opening, NO brand or logo, NO writing, NO letters, NO numbers. The jersey looks like an authentic stitched basketball jersey, not a generic tank top. Both shoulder tips visible, whole hairstyle visible, no cutoff. 85mm lens, true professional sports photo quality, natural 3D skin relief, realistic eyes, realistic ears and human anatomy. No painterly effect, no CGI, no studio glamour, no fashion models, no CGI smooth skin, no fake tattoos or added accessories, no highlights that look wet, no colorcast, no posterization, no halo lighting.";
const tasks=identities.flatMap((person,i)=>variants.flatMap((variant,j)=>models.map(model=>({id:person.id+"-"+variant.id+"-"+model.id,person:person.id,variant:variant.id,model:model.id,endpoint:model.endpoint,price:model.price,seed:892400+i*1000+j*100,prompt:variant.style+" Portrait subject: "+person.look+". "+anchor}))));
if(tasks.length!==12)throw Error("Batch must contain exactly 12");
if(!process.argv.includes("--execute")){console.log(JSON.stringify({images:tasks.length,models:models.map(x=>x.id),estimatedCost:tasks.reduce((x,t)=>x+t.price,0)},null,2));process.exit(0);}
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.FAL_KEY)throw Error("Missing FAL_KEY");
await fs.mkdir(output,{recursive:true});
const manifest={generatedAt:new Date().toISOString(),estimatedCostUSD:tasks.reduce((x,t)=>x+t.price,0),images:[],failures:[]};
for(const task of tasks){
 const response=await fetch("https://fal.run/"+task.endpoint,{method:"POST",headers:{"Authorization":"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},body:JSON.stringify({prompt:task.prompt,image_size:{width:960,height:960},num_images:1,seed:task.seed,output_format:"jpeg",enable_safety_checker:true}),signal:AbortSignal.timeout(190000)});
 if(!response.ok){manifest.failures.push({id:task.id,status:response.status});console.log("Failed "+task.id+" HTTP "+response.status);continue;}
 const data=await response.json();const first=data.images?.[0];
 if(!first?.url){manifest.failures.push({id:task.id,status:"no-image"});continue;}
 const url=new URL(first.url);if(url.protocol!=="https:"||!url.hostname.endsWith(".fal.media"))throw Error("Unsafe image host");
 const get=await fetch(url,{signal:AbortSignal.timeout(65000)});if(!get.ok)throw Error("Failed download");
 const buffer=Buffer.from(await get.arrayBuffer());if(buffer.length<10000||buffer.length>15_000_000)throw Error("Unexpected size");
 const file=task.id+".jpg";await fs.writeFile(path.join(output,file),buffer);
 manifest.images.push({...task,file,width:first.width,height:first.height});
 await fs.writeFile(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2));
 console.log("Generated "+manifest.images.length+"/12: "+task.id);
}
const cards=manifest.images.map(x=>'<figure><img src="'+x.file+'"><figcaption>'+x.id+'</figcaption></figure>').join("\n");
const html='<!doctype html><html><head><meta charset="utf-8"><title>DRBL photo iteration 02</title><style>body{background:#111827;color:#fff;font:15px system-ui;padding:20px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;background:#273244}img{display:block;width:100%}figcaption{padding:9px;font-size:12px}</style></head><body><h1>DRBL / tighter broadcast framing, natural face texture</h1><main>'+cards+'</main></body></html>';
await fs.writeFile(path.join(output,"review.html"),html);
console.log("Generation finished with "+manifest.images.length+" images and "+manifest.failures.length+" failures");
