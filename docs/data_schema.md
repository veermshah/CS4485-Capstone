# Data & DB Schema

## 1. Purpose
This document defines the **single source of truth** for how we store and organize:
- dataset metadata (master index)
- per-building crop artifacts (pre/post images)
- structured prediction outputs and run metadata


---

## 2. Storage-as-Database (Final Implementation)
For the final demo, the project uses **Google Cloud Storage (GCS)** as the primary data store.

### 2.1 GCS Bucket
- **Bucket name:** `images-metadata`
- **GCS project:** `firelens-489322` (used by the upload script)

### 2.2 Canonical Paths (Source of Truth)
These paths are the authoritative source for the demo:

#### 2.2.1 Master index (REQUIRED)
- `gs://images-metadata/dataset_records.csv`

This CSV is the master index that ties together:
- building identifiers (UUID)
- crop file paths
- any additional metadata needed by the UI/pipeline


#### 2.2.2 Per-building crops (REQUIRED)
Uploaded from local `output/crops/**` to:
- `gs://images-metadata/crops/<relative_path_from_output/crops>/...`

Typical examples:
- `gs://images-metadata/crops/<uid>/pre.png`
- `gs://images-metadata/crops/<uid>/post.png`

Notes:
- The upload script preserves folder structure under `output/crops/`
- Crop filenames/extensions may vary (`.png`, `.jpg`), but the folder convention is stable.

---

## 3. Data Objects (Logical Tables)
Even though we are not using a relational DB right now, we still define **logical tables** so that:
- future DB migration is straightforward
- API responses are consistent
- evaluation code has stable fields to consume

### 3.1 Logical Table: buildings
Represents one building footprint (polygon) and basic metadata.

**Fields**
- `building_id` (string, PK)
- `event_name` (string) — e.g., `xview2_santa_rosa_wildfire_2017`
- `geometry` (GeoJSON Polygon, WGS84)
- `created_at` (timestamp)

**Current status**
- Not persisted as a DB table yet.
- Generated as a GeoJSON/JSON file in GCS.

### 3.2 Logical Table: runs 
Represents one inference run (for reproducibility).

**Fields**
- `run_id` (string, PK) — e.g., `run_2026_03_01`
- `model_version` (string) — e.g., `gemini-2.0-flash`
- `data_version` (string) — dataset snapshot/version
- `started_at` (timestamp)
- `finished_at` (timestamp)
- `notes` (string)

**Current status**
- Not persisted yet.
- Stored as a JSON record in GCS.

### 3.3 Logical Table:
Represents per-building output.

**Fields**
- `id` (string or int, PK)
- `run_id` (string, FK -> runs.run_id)
- `building_id` (string, FK -> buildings.building_id)
- `damage_class` (string) — one of:
  - `no-damage`
  - `minor-damage`
  - `major-damage`
  - `destroyed`
- `confidence` (float 0..1)
- `pre_image_url` (string | null)
- `post_image_url` (string | null)
- `created_at` (timestamp)

**Current status**
- Not persisted yet.
- Generated as JSON/CSV and uploaded to GCS.

---

## 4. Planned Outputs
These are recommended “database-like” files to generate next, stored in GCS:

### 4.1 Buildings GeoJSON 
- `gs://images-metadata/buildings/buildings.geojson`

Purpose:
- dashboard can load polygons directly
- backend can serve them via `/buildings`

### 4.2 Predictions JSON 
- `gs://images-metadata/predictions/<run_id>/predictions.json`

Purpose:
- dashboard + chatbot can query stable outputs
- evaluation can compute metrics vs labels

record format (per building):
```json
{
  "building_id": "...",
  "damage_class": "major-damage",
  "confidence": 0.82,
  "pre_image_url": "https://storage.googleapis.com/images-metadata/crops/<uid>/pre.png",
  "post_image_url": "https://storage.googleapis.com/images-metadata/crops/<uid>/post.png",
  "run_id": "run_2026_03_01",
  "model_version": "gemini-2.0-flash",
  "created_at": "2026-03-01T20:15:00Z"
}

```
---
## 5. Mapping: How the UI finds crops (Final)
The UI should use `dataset_records.csv` as the master index to locate crop artifacts under `gs://images-metadata/crops/`.

Minimum requirement for each CSV row:
- a stable identifier (e.g., `uid` or `building_id`)
- a way to resolve crop paths/URLs for:
  - pre crop
  - post crop

Recommended columns (example):
- `building_id` (or `uid`)
- `pre_crop_path` (relative path under `crops/`, e.g., `crops/<uid>/pre.png`)
- `post_crop_path` (relative path under `crops/`, e.g., `crops/<uid>/post.png`)
- (optional) `tile_id`, `bbox`, `label_gt`

If URLs are not precomputed:
- store relative paths in CSV
- the client/backend can convert them into public GCS URLs:
  - `https://storage.googleapis.com/images-metadata/<relative_path>`


---

## 6. Definition of Done
- `gs://images-metadata/dataset_records.csv` exists and is up to date.
- Building crops exist under `gs://images-metadata/crops/` (pre/post per building).
- Docs clearly define:
  - where future outputs (`buildings.geojson`, `predictions/<run_id>.json`) would live
  - what fields they must contain for integration with the API + UI
