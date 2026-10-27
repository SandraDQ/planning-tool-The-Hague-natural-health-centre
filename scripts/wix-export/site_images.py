"""Builds the small set of web-ready images the new site needs: every photo shown on a
non-event page, resized to at most 2000px (JPEG, or WebP when transparent). Logos are copied unchanged.
Usage: python3 -I scripts/wix-export/site_images.py <out_dir>"""
import hashlib, io, json, sys, urllib.request
from pathlib import Path
from PIL import Image

# Logo files are never re-encoded (master prompt 8: logo used exactly as it is).
brand = Path("wix-export/brand")
LOGO_IDS = {l for l in (brand / "notes.md").read_text().split() if "~mv2" in l} | {
    f.name.replace("_mv2", "~mv2") for f in (brand / "logos").iterdir()}
is_logo = lambda id_: any(id_ in l for l in LOGO_IDS)

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
used = [m for m in json.load(open("wix-export/media-used.json")) if not m["only_on_event_pages"]]
index = []
for m in used:
    src = Path(m["file"]) if m.get("in_media_export") and m.get("file") else None
    data = src.read_bytes() if src and src.exists() else urllib.request.urlopen(m["url"], timeout=60).read()
    stem = Path(m["name"] or m["id"]).stem.replace(" ", "-")[:60] + "__" + hashlib.sha1(m["id"].encode()).hexdigest()[:8]
    try:
        im = Image.open(io.BytesIO(data))
    except Exception:
        (out / (stem + Path(m["id"]).suffix)).write_bytes(data); continue
    if is_logo(m["id"]):
        name = stem + Path(m["id"]).suffix; (out / name).write_bytes(data)
    elif im.mode in ("RGBA", "LA") or "transparency" in im.info:
        im = im.convert("RGBA"); im.thumbnail((2000, 2000))
        name = stem + ".webp"; im.save(out / name, "WEBP", quality=82, method=6)
    else:
        im = im.convert("RGB"); im.thumbnail((2000, 2000))
        name = stem + ".jpg"; im.save(out / name, "JPEG", quality=82, optimize=True, progressive=True)
    index.append({"file": name, "id": m["id"], "pages": [p["url"] for p in m["pages"]]})
json.dump(index, open(out / "index.json", "w"), indent=1)
print(len(index), "images")
