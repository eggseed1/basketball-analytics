#!/usr/bin/env python3
"""Import a fixed, explicitly selected fal cohort from a GitHub Actions artifact.

Input: Actions artifact extracted to .portrait-source (50 JPEGs + manifest).
Output: 512px WebP portraits, jersey-only alpha masks, and provenance manifest.
This script only prepares static assets; it cannot generate or spend API credits.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

SOURCE=Path(".portrait-source")
DEST=Path("public/gm/portraits")
IDS=[f"v3-{i:02d}" for i in range(1,51)]
assert len(IDS)==len(set(IDS))==50
manifest=json.loads((SOURCE/"manifest.json").read_text())
assert manifest.get("model")=="fal-ai/flux-2", "Wrong model"
assert len(manifest.get("images",[]))==50, "Expected a completed fifty-photo cohort"
actual={image["id"]:image for image in manifest["images"]}
assert set(actual)==set(IDS), "Unexpected/missing IDs in fal source artifact"
DEST.mkdir(parents=True,exist_ok=True)
catalog={"version":1,"sourceModel":"fal-ai/flux-2","sourceRunId":43035986031,
         "status":"pilot","outputSize":[512,512],"images":[]}
for id in IDS:
    raw=SOURCE/(id+".jpg")
    if not raw.is_file() or raw.stat().st_size<15000:
        raise ValueError("Missing source image "+id)
    with Image.open(raw) as loaded:
        im=loaded.convert("RGB")
    if im.size!=(960,960):
        raise ValueError("Unexpected dimensions for "+id+": "+str(im.size))
    im=im.resize((512,512),Image.Resampling.LANCZOS)
    # Segment the navy *body of the uniform* only. White piping, arms, face
    # and hair must retain their colors. Limit to lower 45% of the image.
    rgb=np.asarray(im,dtype=np.float32)
    red,green,blue=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    yy=np.arange(512,dtype=np.float32)[:,None]
    navy=(blue>red*1.20)&(blue>green*1.10)&(red<125)&(green<130)&(blue<185)
    lower=yy>=286
    mask=np.where(navy&lower,255,0).astype("uint8")
    # Feather edges only slightly, preserving neck/skin cutouts.
    mask_img=Image.fromarray(mask,"L").filter(ImageFilter.GaussianBlur(0.7))
    mask_rgba=Image.new("RGBA",(512,512),(255,255,255,0))
    mask_rgba.putalpha(mask_img)
    imgfile=id+".webp"
    maskfile=id+"-jersey-mask.webp"
    im.save(DEST/imgfile,"WEBP",quality=85,method=6)
    mask_rgba.save(DEST/maskfile,"WEBP",quality=90,method=6)
    # Avoid accidentally publishing duplicate / unexpected generated files.
    catalog["images"].append({
        "id":id,"portrait":imgfile,"jerseyMask":maskfile,
        "sourceSha256":hashlib.sha256(raw.read_bytes()).hexdigest(),
        "sourceSeed":actual[id].get("seed"),"sourceDescription":actual[id].get("description"),
        "portraitBytes":(DEST/imgfile).stat().st_size,
        "maskBytes":(DEST/maskfile).stat().st_size
    })
(DEST/"manifest.json").write_text(json.dumps(catalog,indent=2)+"\n")
print("Imported",len(IDS),"static photo assets and team-jersey masks")
print("Total output MB:",round(sum(f.stat().st_size for f in DEST.iterdir() if f.is_file())/1e6,2))
