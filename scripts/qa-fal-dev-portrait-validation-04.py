#!/usr/bin/env python3
"""Offline heuristic portrait check: composition proxies, backdrop consistency, exact/near image duplicates.
This is NOT face recognition and cannot verify facial identity, realism, or likeness.
"""
import json, math, statistics
from pathlib import Path
from PIL import Image, ImageStat, ImageFilter

folder=Path("fal-dev-portrait-validation-04")
manifest=json.loads((folder/"manifest.json").read_text())
data=[]
for entry in manifest["images"]:
    with Image.open(folder/entry["file"]) as im:
        rgb=im.convert("RGB")
        width,height=rgb.size
        gray=rgb.convert("L").resize((32,32))
        pixels=list(gray.getdata())
        avg=sum(pixels)/len(pixels)
        bits=[int(x>=avg) for x in pixels]
        top=rgb.crop((int(width*.35),0,int(width*.65),int(height*.045)))
        corners=[rgb.crop(box) for box in [(0,0,int(width*.13),int(height*.13)),(int(width*.87),0,width,int(height*.13))]]
        top_color=ImageStat.Stat(top).mean
        corner_colors=[ImageStat.Stat(c).mean for c in corners]
        cspread=math.dist(corner_colors[0],corner_colors[1])
        global_contrast=ImageStat.Stat(rgb.convert("L")).stddev[0]
        data.append({"id":entry["id"],"file":entry["file"],"w":width,"h":height,
                     "top_backdrop_rgb":[round(x) for x in top_color],
                     "corner_color_difference":round(cspread,1),
                     "global_contrast":round(global_contrast,1),"_bits":bits})
dupes=[]
for i,a in enumerate(data):
    for b in data[i+1:]:
        dist=sum(x!=y for x,y in zip(a["_bits"],b["_bits"]))
        if dist<95:
            dupes.append({"a":a["id"],"b":b["id"],"full_frame_dhash_distance":dist})
for x in data:del x["_bits"]
report={"limitations":"Metrics are heuristic. Image-level average-hash similarity does not establish face duplication; backgrounds and jerseys can produce false positives. Visual human review required.",
        "count":len(data),"expected_count":24,
        "background_corner_spread_mean":round(statistics.mean([x["corner_color_difference"] for x in data]),1) if data else None,
        "similarity_flags_for_review":dupes,
        "images":data}
(folder/"qa.json").write_text(json.dumps(report,indent=2))
print(json.dumps({"count":report["count"],"flags_for_visual_review":len(dupes),"background_spread":report["background_corner_spread_mean"]},indent=2))
