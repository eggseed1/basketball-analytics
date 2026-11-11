#!/usr/bin/env python3
"""Convert the v3 FLUX.2 Dev research artifact into 50 lightweight player-photo assets.
Offline only: never changes the actual face, invents identities, or calls any API.
"""
from pathlib import Path
from PIL import Image, ImageOps
import json, os

source=Path("portrait-import-source")
out=Path("public/gm/generated-headshots")
out.mkdir(parents=True,exist_ok=True)
photos=[]
for i in range(1,51):
    original=list(source.rglob(f"v3-{i:02d}.jpg"))
    if len(original)!=1:
        raise SystemExit(f"Expected one source for v3-{i:02d}: got {len(original)}")
    target=out/f"{i:03d}.jpg"
    with Image.open(original[0]) as inp:
        rgb=ImageOps.exif_transpose(inp).convert("RGB")
        if rgb.width<500 or rgb.height<500: raise SystemExit("Unexpected source resolution")
        # Keep originals' face and framing; resize without face modification.
        converted=ImageOps.fit(rgb,(320,320),method=Image.Resampling.LANCZOS,centering=(.5,.5))
        converted.save(target,format="JPEG",quality=83,progressive=True,optimize=True)
    photos.append({"id":i,"file":target.name,"source":"FLUX.2 Dev v3 50-identity sample","reviewStatus":"pilot-unreviewed","sourceFile":original[0].name})
manifest={"version":1,"poolSize":50,"description":"Fictional DRBL media-day pilot images. 50-image cap, illustrated fallback for the rest. Individual assignments persist in player identity.","photos":photos}
(out/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
print("Prepared",len(photos),"portrait files, total KB:",round(sum((out/p["file"]).stat().st_size for p in photos)/1024))
