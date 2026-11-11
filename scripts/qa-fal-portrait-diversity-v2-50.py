#!/usr/bin/env python3
"""Inspect 50-file FLUX.2 Dev portrait cohort.
Heuristic image-level QA only, not face recognition and not proof of identity.
"""
import json, math, statistics
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageStat, ImageFilter
import numpy as np
import cv2

OUT=Path("fal-portrait-diversity-v2-50")
manifest=json.loads((OUT/"manifest.json").read_text())
entries=manifest["images"]
imgdata=[]
thumbs=[]
detector=cv2.CascadeClassifier(cv2.data.haarcascades+"haarcascade_frontalface_default.xml")
for entry in entries:
    fp=OUT/entry["file"]
    with Image.open(fp) as opened:
        im=opened.convert("RGB")
        w,h=im.size
        gray=np.asarray(im.convert("L"))
        # Portrait-crop perceptual signature is sensitive to pose/crop and only used for review flags.
        face_region=im.crop((int(w*.21),int(h*.13),int(w*.79),int(h*.73)))
        face_gray=np.asarray(face_region.convert("L").resize((16,16)),dtype=np.float32)
        bits=(face_gray>np.median(face_gray)).flatten()
        bg_colors=[]
        for bounds in [(0,0,int(w*.12),int(h*.12)),(int(w*.88),0,w,int(h*.12))]:
            bg_colors.append(ImageStat.Stat(im.crop(bounds)).mean)
        backdrop_diff=math.dist(bg_colors[0],bg_colors[1])
        # Front-facing face detection is indicative only. Some successful natural portraits will be missed.
        faceboxes=detector.detectMultiScale(gray,scaleFactor=1.12,minNeighbors=5,minSize=(int(w*.22),int(h*.22)))
        faceboxes=[list(map(int,box)) for box in faceboxes]
        face_count=len(faceboxes)
        largest=sorted(faceboxes,key=lambda b:b[2]*b[3],reverse=True)[0] if faceboxes else None
        leftface=(largest[0]+largest[2]*.5)/w if largest else None
        upperface=largest[1]/h if largest else None
        imgdata.append({
            "id":entry["id"],"file":entry["file"],"width":w,"height":h,
            "detected_frontal_faces":face_count,"main_face_center_x":round(leftface,3) if leftface is not None else None,
            "main_face_top_y":round(upperface,3) if upperface is not None else None,
            "corner_backdrop_rgb":[[round(v) for v in rgb] for rgb in bg_colors],
            "backdrop_corner_difference":round(backdrop_diff,1),
            "grayscale_global_std":round(ImageStat.Stat(im.convert("L")).stddev[0],1),
            "_signature":bits,
        })
        card=im.resize((252,252))
        thumbs.append((entry["id"],card))
possible=[]
for idx,a in enumerate(imgdata):
    for b in imgdata[idx+1:]:
        distance=int(np.count_nonzero(a["_signature"]!=b["_signature"]))
        if distance<=46:
            possible.append({"a":a["id"],"b":b["id"],"distance":distance,
                             "notice":"Low-res center-crop hash similarity, NOT a face identity match"})
for e in imgdata:del e["_signature"]
possible.sort(key=lambda d:d["distance"])
report={
  "model":manifest["model"],"generated":len(entries),"requested":50,
  "frontal_face_detected":sum(e["detected_frontal_faces"]>=1 for e in imgdata),
  "off_center_face_detected":sum(abs(e["main_face_center_x"]-.5)>.12 for e in imgdata if e["main_face_center_x"] is not None),
  "backdrop_color_spread_mean":round(statistics.mean(e["backdrop_corner_difference"] for e in imgdata),1) if imgdata else None,
  "possible_near_matches_for_human_review":possible,
  "images":imgdata,
  "disclaimer":"OpenCV Haar face detection and center-crop hashing are heuristic. Faces with darker skin/hairstyles can be missed; background uniformity can drive false near-duplicates. Always review images manually."
}
(OUT/"qa-report.json").write_text(json.dumps(report,indent=2))
if thumbs:
  cols=5;rows=math.ceil(len(thumbs)/cols);tw=252;th=280
  sheet=Image.new("RGB",(cols*tw,rows*th),(19,26,37))
  draw=ImageDraw.Draw(sheet)
  for i,(id,card) in enumerate(thumbs):
    x=(i%cols)*tw;y=(i//cols)*th
    sheet.paste(card,(x,y))
    draw.text((x+10,y+257),id,fill=(239,241,245))
  sheet.save(OUT/"contact-sheet.jpg",quality=90,optimize=True)
  view=''.join('<figure><img src="'+e["file"]+'"><figcaption>'+e["id"]+'</figcaption></figure>' for e in entries)
  (OUT/"review.html").write_text('<!doctype html><html><head><meta charset="utf-8"><title>DRBL 50 faces</title><style>body{font:15px system-ui;background:#111827;color:white;padding:20px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}figure{margin:0;background:#263445}img{width:100%;display:block}figcaption{padding:8px}</style></head><body><h1>DRBL fictional player identity cohort</h1><main>'+view+'</main></body></html>')
print(json.dumps({"generated":report["generated"],"frontal_detected":report["frontal_face_detected"],"center_flags":report["off_center_face_detected"],"near_match_flags":len(possible),"backdrop_spread":report["backdrop_color_spread_mean"]},indent=2))
