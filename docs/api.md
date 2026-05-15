# API Contract (Final / MVP+)

## 1. Purpose

This document defines the final API contract and data access pattern for FireLens.

FireLens is a deployed disaster damage assessment dashboard for the Santa Rosa wildfire case study. The frontend dashboard, chatbot, metrics page, and VLM evaluation page all need consistent access to:

- building metadata and map geometry
- pre/post-disaster crop imagery
- Gemini VLM prediction outputs
- ground-truth xBD/FEMA labels
- evaluation metrics and confusion matrix results
- chatbot question/answer workflows
- live single-pair VLM evaluation

The final application uses a hybrid approach:

- static prepared artifacts are stored in **Cloudflare R2**
- the frontend reads some CSV/GeoJSON/image assets directly or through frontend route handlers
- the Python backend uses **FastAPI** for live Gemini VLM evaluation and chatbot requests

---

## 2. Data Assumptions

- Dataset: xView2 / xBD Santa Rosa wildfire case study
- Main event: Santa Rosa wildfire, October 2017
- Storage layer: Cloudflare R2 object storage
- Main index file: `dataset_records.csv`
- Evaluation file: `evaluation_results.csv`
- Crop image folder: `crops/`
- Geometry format: GeoJSON Polygon in WGS84 / EPSG:4326
- Main VLM model: `gemini-2.5-flash`
- Chatbot model: Gemini 2.5 Flash Lite or equivalent low-latency Gemini model
- Backend framework: FastAPI
- Frontend framework: Next.js + Mapbox GL

---

## 3. Damage Class Standardization

### 3.1 Canonical Damage Classes

All API responses should use the following canonical damage labels:

- `no-damage`
- `minor-damage`
- `major-damage`
- `destroyed`

### 3.2 Model-to-API Mapping

If a model or prompt returns non-canonical labels, map them as follows:

| Model Output | API Damage Class |
|---|---|
| `Undamaged` | `no-damage` |
| `No Damage` | `no-damage` |
| `Damaged` | `minor-damage` |
| `Minor Damage` | `minor-damage` |
| `Major Damage` | `major-damage` |
| `Severely Damaged` | `major-damage` |
| `Destroyed` | `destroyed` |

### 3.3 Unclassified Labels

Some dataset records may contain `unclassified` or invalid labels.

Rules:

- Do not include unclassified records in top-line accuracy unless explicitly stated.
- Show or track unclassified records separately when needed.
- Do not map `unclassified` into one of the four standard damage classes.

---

## 4. Coordinate & Geometry Conventions

### 4.1 BBox Format

Bounding boxes use:

```text
bbox=minLon,minLat,maxLon,maxLat
```

Example:

```text
bbox=-122.80,38.35,-122.60,38.55
```

### 4.2 Geometry Format

Building footprints use GeoJSON Polygon in WGS84:

```json
{
  "type": "Polygon",
  "coordinates": [
    [
      [-122.7, 38.44],
      [-122.7, 38.45],
      [-122.69, 38.45],
      [-122.69, 38.44],
      [-122.7, 38.44]
    ]
  ]
}
```

---

## 5. Common Response Envelope

Where possible, application endpoints should return the following response envelope:

```json
{
  "data": null,
  "meta": null,
  "error": null
}
```

Error response example:

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "BAD_REQUEST",
    "message": "bbox is required",
    "details": {}
  }
}
```

Notes:

- Simple health/version endpoints may return a smaller response.
- Static files from Cloudflare R2 may not use this envelope.
- Frontend route handlers may adapt static data into this shape when needed.

---

## 6. Data Objects

### 6.1 BuildingSummary

Used in map/list views.

Required fields:

| Field | Type | Description |
|---|---|---|
| `building_id` or `uid` | string | Stable building identifier |
| `geometry` | GeoJSON Polygon | Building footprint |
| `damage_class` | string / null | One of the four canonical damage classes |
| `confidence` | number / null | VLM confidence score from 0 to 1 |
| `pre_image_url` | string / null | Pre-disaster crop URL |
| `post_image_url` | string / null | Post-disaster crop URL |
| `run_id` | string / null | Inference run identifier |
| `model_version` | string / null | Model version |
| `created_at` | string / null | ISO-8601 timestamp |

Example:

```json
{
  "building_id": "81d57773-536e-4c5e-a283-649fabf5580a",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[...]]]
  },
  "damage_class": "destroyed",
  "confidence": 0.82,
  "pre_image_url": "https://<r2-public-url>/crops/<uid>/pre.png",
  "post_image_url": "https://<r2-public-url>/crops/<uid>/post.png",
  "run_id": "run_final_demo",
  "model_version": "gemini-2.5-flash",
  "created_at": "2026-05-14T00:00:00Z"
}
```

Notes:

- If prediction data is not available, return `damage_class=null` and `confidence=null`.
- For performance, list views may omit image URLs unless image data is needed.

---

### 6.2 BuildingDetail

Used when a user clicks a building or opens the detail panel.

Includes all `BuildingSummary` fields, plus optional metadata:

| Field | Type | Description |
|---|---|---|
| `tile_id` | string / null | Source tile identifier |
| `pixel_bbox` | object / null | Pixel-space crop bounding box |
| `label_gt` | string / null | Ground-truth xBD/FEMA label |
| `gemini_label` | string / null | Gemini prediction label |
| `address` | string / null | Reverse-geocoded address |
| `city` | string / null | City or place |
| `state` | string / null | State / region |
| `postal_code` | string / null | Postal code |
| `country` | string / null | Country |
| `longitude` | number / null | Longitude |
| `latitude` | number / null | Latitude |

Example:

```json
{
  "building_id": "81d57773-536e-4c5e-a283-649fabf5580a",
  "tile_id": "00000089",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[...]]]
  },
  "damage_class": "destroyed",
  "confidence": 0.82,
  "label_gt": "destroyed",
  "gemini_label": "destroyed",
  "pre_image_url": "https://<r2-public-url>/crops/<uid>/pre.png",
  "post_image_url": "https://<r2-public-url>/crops/<uid>/post.png",
  "pixel_bbox": {
    "xmin": 12,
    "ymin": 33,
    "xmax": 88,
    "ymax": 120
  },
  "address": "3853 Crestview Drive, Santa Rosa, California 95403, United States",
  "longitude": -122.745904,
  "latitude": 38.483092
}
```

---

### 6.3 EvaluationResult

Used by the metrics page and chatbot.

| Field | Type | Description |
|---|---|---|
| `uid` or `building_id` | string | Stable building identifier |
| `true_label` | string | Ground-truth xBD/FEMA label |
| `gemini_label` | string | Gemini prediction |
| `correct` | boolean | Whether prediction matches ground truth |
| `run_id` | string / null | Run identifier |
| `model_version` | string / null | Gemini model version |

Example CSV row:

```csv
uid,true_label,gemini_label,correct
81d57773-536e-4c5e-a283-649fabf5580a,destroyed,destroyed,true
```

---

### 6.4 VlmEvaluationResponse

Used by the live Evaluate page.

```json
{
  "damage_class": "destroyed",
  "confidence": 0.82,
  "reasoning": "The post-disaster crop shows severe structural damage compared with the pre-disaster crop.",
  "model_version": "gemini-2.5-flash"
}
```

---

## 7. Endpoints

The following endpoints define the expected application contract. Some endpoints may be implemented as backend FastAPI routes, while others may be fulfilled by frontend route handlers or static artifact reads from Cloudflare R2.

---

### 7.1 GET `/buildings`

Query building results within the current map view.

Used by:

- map overlay
- visible building list
- filters
- chatbot area summaries

Query params:

| Param | Required | Description |
|---|---|---|
| `bbox` | yes | `minLon,minLat,maxLon,maxLat` |
| `damage_class` | no | One of the canonical damage classes |
| `min_confidence` | no | Float from 0 to 1 |
| `limit` | no | Default `200`, max `2000` |
| `offset` | no | Default `0` |
| `include_images` | no | Default `false`; when true, include pre/post image URLs |

Response:

```json
{
  "data": {
    "items": [
      {
        "building_id": "81d57773-536e-4c5e-a283-649fabf5580a",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[...]]]
        },
        "damage_class": "destroyed",
        "confidence": 0.82,
        "run_id": "run_final_demo",
        "model_version": "gemini-2.5-flash",
        "created_at": "2026-05-14T00:00:00Z"
      }
    ],
    "count": 1
  },
  "meta": {
    "bbox": "-122.80,38.35,-122.60,38.55",
    "limit": 200,
    "offset": 0
  },
  "error": null
}
```

---

### 7.2 GET `/buildings/{building_id}`

Fetch one building detail record.

Used by:

- building detail panel
- imagery tab
- selected-building chatbot context

Path params:

| Param | Required | Description |
|---|---|---|
| `building_id` | yes | Stable building identifier |

Response:

```json
{
  "data": {
    "building_id": "81d57773-536e-4c5e-a283-649fabf5580a",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[...]]]
    },
    "damage_class": "destroyed",
    "confidence": 0.82,
    "pre_image_url": "https://<r2-public-url>/crops/<uid>/pre.png",
    "post_image_url": "https://<r2-public-url>/crops/<uid>/post.png",
    "run_id": "run_final_demo",
    "model_version": "gemini-2.5-flash",
    "created_at": "2026-05-14T00:00:00Z",
    "tile_id": "00000089",
    "pixel_bbox": {
      "xmin": 12,
      "ymin": 33,
      "xmax": 88,
      "ymax": 120
    },
    "label_gt": "destroyed",
    "gemini_label": "destroyed"
  },
  "meta": null,
  "error": null
}
```

---

### 7.3 GET `/stats`

Return summary statistics for a selected region.

Used by:

- side panel
- chatbot
- region summary prompts

Query params:

| Param | Required | Description |
|---|---|---|
| `bbox` | yes | Region bounding box |
| `run_id` | no | If omitted, use latest run |
| `damage_class` | no | Optional class filter |

Response:

```json
{
  "data": {
    "counts": {
      "no-damage": 10,
      "minor-damage": 25,
      "major-damage": 8,
      "destroyed": 2
    },
    "total": 45,
    "avg_confidence": 0.74,
    "run_id": "run_final_demo",
    "model_version": "gemini-2.5-flash"
  },
  "meta": {
    "bbox": "-122.80,38.35,-122.60,38.55"
  },
  "error": null
}
```

---

### 7.4 GET `/metrics`

Return overall evaluation metrics.

Used by:

- metrics page
- final presentation
- chatbot questions about model performance

Response:

```json
{
  "data": {
    "total_buildings": 4226,
    "accuracy": 0.8135,
    "precision": 0.3947,
    "recall": 0.3484,
    "f1": 0.3637,
    "model_version": "gemini-2.5-flash"
  },
  "meta": {
    "source": "evaluation_results.csv"
  },
  "error": null
}
```

Notes:

- Metrics are computed from `evaluation_results.csv`.
- Unclassified records should be handled separately.
- Accuracy alone is not enough because the dataset is imbalanced.

---

### 7.5 GET `/runs`

List available inference runs for reproducibility.

Response:

```json
{
  "data": {
    "items": [
      {
        "run_id": "run_final_demo",
        "model_version": "gemini-2.5-flash",
        "created_at": "2026-05-14T00:00:00Z",
        "notes": "Final batch inference for Santa Rosa dataset"
      }
    ]
  },
  "meta": null,
  "error": null
}
```

---

### 7.6 POST `/chat/query`

Ask a disaster-related question using stored building, prediction, evaluation, and geospatial context.

Used by:

- Damage Assessment Assistant
- map-focused queries
- region summaries
- false positive / false negative questions

The chatbot reads from:

- `evaluation_results.csv`
- `dataset_records.csv`
- building GeoJSON / metadata
- visible map bbox
- selected building context
- optional external search provider for FEMA / Ready.gov references

Request:

```json
{
  "question": "List potentially unsafe buildings.",
  "bbox": "-122.80,38.35,-122.60,38.55",
  "selected_building_id": null,
  "filters": {
    "damage_class": null
  },
  "conversation_id": "thread_123"
}
```

Response:

```json
{
  "data": {
    "answer": "The most potentially unsafe buildings are the ones classified as destroyed or major-damage in the selected area.",
    "supporting_data": {
      "counts": {
        "destroyed": 2,
        "major-damage": 8
      },
      "bbox": "-122.80,38.35,-122.60,38.55",
      "building_ids": [
        "81d57773-536e-4c5e-a283-649fabf5580a"
      ]
    },
    "map_actions": {
      "zoom_to_bbox": "-122.80,38.35,-122.60,38.55",
      "highlight_building_ids": [
        "81d57773-536e-4c5e-a283-649fabf5580a"
      ]
    }
  },
  "meta": {
    "model_version": "gemini-2.5-flash-lite"
  },
  "error": null
}
```

Notes:

- The chatbot should restrict answers to disaster-related topics.
- The chatbot should use the same stored data as the dashboard for consistency.
- If configured, the chatbot may use Brave Search or similar search providers for broader disaster assistance references.

---

### 7.7 POST `/evaluate`

Run live VLM evaluation for one uploaded pre/post image pair.

Used by:

- Evaluate page
- one-off VLM testing
- final demo model test

Request:

- `multipart/form-data`
- `pre_image`: file
- `post_image`: file

Response:

```json
{
  "data": {
    "damage_class": "destroyed",
    "confidence": 0.82,
    "reasoning": "The post-disaster image shows severe structural damage compared with the pre-disaster image.",
    "model_version": "gemini-2.5-flash"
  },
  "meta": null,
  "error": null
}
```

Notes:

- This endpoint calls the Gemini API through the FastAPI backend.
- This endpoint may fail if `GEMINI_API_KEY` is missing, invalid, or rate-limited.
- The main dashboard does not depend on live inference for every building.

---

### 7.8 GET `/tiles/{type}/{z}/{x}/{y}`

Serve pre/post disaster imagery as raster slippy tiles.

Used by:

- Mapbox GL raster layers
- pre/post/base map switching

Path params:

| Param | Description |
|---|---|
| `type` | `pre` or `post` |
| `z` | Zoom level |
| `x` | Tile x coordinate |
| `y` | Tile y coordinate |

Response:

- image tile, usually PNG or JPEG

Notes:

- Tiles may be generated from source imagery and cached.
- This endpoint may be implemented by frontend route handlers rather than FastAPI.
- Tile generation should avoid unnecessary requests at unsupported zoom levels.

---

### 7.9 GET `/healthz`

Health check.

Response:

```json
{
  "status": "ok"
}
```

Notes:

- Used to check if the backend is awake.
- The frontend may call this endpoint on dashboard load to wake the Render backend.

---

### 7.10 GET `/version`

Return backend and model version information.

Response:

```json
{
  "backend_version": "0.1.0",
  "model_version": "gemini-2.5-flash",
  "chatbot_model": "gemini-2.5-flash-lite"
}
```

---

## 8. Performance Notes

- `/buildings` should be fast because it supports map rendering.
- Default `include_images=false` for building list queries.
- Use paging with `limit` and `offset` when many buildings are inside the bbox.
- Use Cloudflare R2 and browser/CDN caching for static imagery and CSV/GeoJSON artifacts.
- Use in-memory caching for expensive backend setup, dataset indexing, and chatbot context.
- Geometry may be simplified only if polygon correctness is preserved.
- The main dashboard should read offline prediction results instead of running live VLM inference for every building.

---

## 9. Security / Auth

For the classroom MVP, the deployed dashboard may be publicly accessible.

Security notes:

- Do not commit real API keys.
- Store deployment secrets in Vercel and Render settings.
- Restrict CORS using `ALLOWED_ORIGINS`.
- Keep `GEMINI_API_KEY`, `SEARCH_API_KEY`, and Mapbox tokens out of public docs.
- If future authentication is needed, add an API key header such as `X-API-Key`.

---

## 10. Definition of Done

Frontend can:

- query buildings in bbox
- filter by `damage_class`
- render building footprints on the map
- click a building to view metadata, prediction, ground truth, and pre/post crops
- show metrics and confusion matrix from `evaluation_results.csv`
- ask chatbot questions about selected buildings or map regions
- upload one pre/post pair to the Evaluate page for live VLM testing

Backend can:

- respond to health/version checks
- run live VLM evaluation for uploaded image pairs
- support chatbot requests using stored dataset and evaluation outputs
- handle missing API keys or rate limits gracefully
- avoid exposing secret keys in responses or repository files

System can:

- use Cloudflare R2 as the source of truth for prepared data artifacts
- use consistent building identifiers across dashboard, chatbot, metrics, and VLM outputs
- handle missing predictions gracefully without breaking the UI
- keep documentation consistent across `api.md`, `data_schema.md`, and `runbook.md`
