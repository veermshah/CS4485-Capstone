import json
import csv
from pathlib import Path
from shapely import wkt
from PIL import Image
from tqdm import tqdm

# ── Config ────────────────────────────────────────────────
DATA_DIR    = Path("data")
IMAGES_DIR  = DATA_DIR / "images"
LABELS_DIR  = DATA_DIR / "labels"
OUTPUT_DIR  = Path("output")
CROPS_DIR   = OUTPUT_DIR / "crops"
CSV_PATH    = OUTPUT_DIR / "dataset_records.csv"  # uid, tile_id, bbox, label

PADDING     = 10
MIN_SIZE    = 0
# ─────────────────────────────────────────────────────────

def get_bounding_box(wkt_polygon, padding, img_w, img_h):
    polygon = wkt.loads(wkt_polygon)
    minx, miny, maxx, maxy = polygon.bounds
    minx = max(0, int(minx) - padding)
    miny = max(0, int(miny) - padding)
    maxx = min(img_w, int(maxx) + padding)
    maxy = min(img_h, int(maxy) + padding)
    return minx, miny, maxx, maxy

def polygon_to_geojson(wkt_polygon):
    polygon = wkt.loads(wkt_polygon)
    coords = list(polygon.exterior.coords)
    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[lon, lat] for lon, lat in coords]]
        }
    }

def process_tile(tile_id):
    post_label_path = LABELS_DIR / f"{tile_id}_post_disaster.json"
    pre_image_path  = IMAGES_DIR / f"{tile_id}_pre_disaster.png"
    post_image_path = IMAGES_DIR / f"{tile_id}_post_disaster.png"

    if not all(p.exists() for p in [post_label_path, pre_image_path, post_image_path]):
        return []

    with open(post_label_path) as f:
        post_data = json.load(f)

    pre_img  = Image.open(pre_image_path)
    post_img = Image.open(post_image_path)
    img_w, img_h = post_img.size

    geo_lookup = {}
    for feature in post_data["features"]["lng_lat"]:
        uid = feature["properties"]["uid"]
        geo_lookup[uid] = polygon_to_geojson(feature["wkt"])

    records = []

    for feature in post_data["features"]["xy"]:
        props   = feature["properties"]
        uid     = props["uid"]
        subtype = props.get("subtype", "no-damage")

        bbox = get_bounding_box(feature["wkt"], PADDING, img_w, img_h)
        minx, miny, maxx, maxy = bbox

        if (maxx - minx) < MIN_SIZE or (maxy - miny) < MIN_SIZE:
            continue

        crop_dir = CROPS_DIR / uid
        crop_dir.mkdir(parents=True, exist_ok=True)

        pre_img.crop(bbox).save(crop_dir / "pre.png")
        post_img.crop(bbox).save(crop_dir / "post.png")

        # meta.json — no label, safe to use alongside VLM
        meta = {
            "uid":     uid,
            "tile_id": tile_id,
            "bbox_px": list(bbox),
            "geojson": geo_lookup.get(uid)
        }
        with open(crop_dir / "meta.json", "w") as f:
            json.dump(meta, f, indent=2)

        # label stored in CSV only, for evaluation module
        records.append({
            "uid":     uid,
            "tile_id": tile_id,
            "bbox":    str(bbox),
            "label":   subtype
        })

    return records

def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    CROPS_DIR.mkdir(exist_ok=True)

    tile_ids = [
        f.stem.replace("_post_disaster", "")
        for f in LABELS_DIR.glob("*_post_disaster.json")
    ]

    all_records = []
    for tile_id in tqdm(tile_ids, desc="Processing tiles"):
        all_records.extend(process_tile(tile_id))

    with open(CSV_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["uid", "tile_id", "bbox", "label"])
        writer.writeheader()
        writer.writerows(all_records)

    print(f"\nDone. {len(all_records)} buildings cropped.")
    print(f"Records saved to {CSV_PATH}")

if __name__ == "__main__":
    main()
