import pandas as pd
from pathlib import Path

CSV_PATH  = Path("output/dataset_records.csv")
CROPS_DIR = Path("output/crops")

df = pd.read_csv(CSV_PATH)

print("=== Dataset Summary ===")
print(f"Total buildings:  {len(df)}")
print(f"Unique tiles:     {df['tile_id'].nunique()}")
print(f"\nLabel distribution:")
print(df["label"].value_counts().to_string())

# Check all crop folders have both images
missing = []
for uid in df["uid"]:
    crop = CROPS_DIR / uid
    if not (crop / "pre.png").exists() or not (crop / "post.png").exists():
        missing.append(uid)

print(f"\nMissing crop pairs: {len(missing)}")
if missing:
    print("Missing UIDs:", missing[:10])
