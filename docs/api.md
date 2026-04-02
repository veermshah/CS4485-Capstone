# API Contract (Final / MVP+)

## 1. Purpose
This document defines the **single source of truth** for how the frontend dashboard and chatbot query building-level damage results.

- Dashboard needs: map view → buildings in current bbox, filters, click-to-inspect, pre/post imagery URLs
- Chatbot needs: region summary (counts by damage), optionally top-N buildings


---

## 2. Data Assumptions
- Dataset: xBD (2017 Santa Rosa Wildfire)
- Ground-truth FEMA subtype labels (from post-disaster JSON):  
  `no-damage`, `minor-damage`, `major-damage`, `destroyed`
- Geometry used by UI: **GeoJSON Polygon in WGS84 (EPSG:4326)**

---

## 3. Damage Class Standardization

### 3.1 Canonical API damage_class 
**Use FEMA-style strings in the API** (recommended for clarity and evaluation alignment):

- `no-damage`
- `minor-damage`
- `major-damage`
- `destroyed`

### 3.2 Model-to-API mapping 
If the VLM outputs:
- `Undamaged` → `no-damage`
- `Damaged` → `minor-damage`
- `Severely Damaged` → `major-damage`
- `Destroyed` → `destroyed`

---

## 4. Coordinate & Geometry Conventions

### 4.1 bbox format
`bbox = minLon,minLat,maxLon,maxLat`  
Example: `bbox=-122.80,38.35,-122.60,38.55`

### 4.2 geometry format
GeoJSON Polygon (WGS84):

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
All endpoints (except `GET /healthz` and `GET /version`) return the following envelope:

```json
{
  "data": null,
  "meta": null,
  "error": null
}
```
On errors:
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
---

## 6. Data Objects (Schemas)
### 6.1 BuildingSummary (used in `/buildings` list)

Required fields:
- `building_id`: string
- `geometry`: GeoJSON Polygon
- `damage_class`: string | null — one of `no-damage|minor-damage|major-damage|destroyed`
- `confidence`: number | null — 0..1
- `pre_image_url`: string | null
- `post_image_url`: string | null
- `run_id`: string | null
- `model_version`: string | null
- `created_at`: string | null (ISO-8601)

Notes:

- If predictions are not available yet, return damage_class=null and confidence=null.
- For performance, list endpoint may omit image URLs unless include_images=true.

Example:
```json
{
  "building_id": "santa-rosa-wildfire_00000328_bldg_0012",
  "geometry": { "type": "Polygon", "coordinates": [[[...]]] },
  "damage_class": "major-damage",
  "confidence": 0.82,
  "pre_image_url": "https://storage/.../pre.jpg",
  "post_image_url": "https://storage/.../post.jpg",
  "run_id": "run_2026_03_01",
  "model_version": "gemini-2.0-flash",
  "created_at": "2026-03-01T20:15:00Z"
}
```
### 6.2 BuildingDetail (used in `/buildings/{building_id}`)

Same fields as BuildingSummary, plus optional metadata:

- `tile_id`: string | null
- `pixel_bbox`: object | null — `{ "xmin": 12, "ymin": 33, "xmax": 88, "ymax": 120 }`
- `label_gt`: string | null — ground truth FEMA label (optional; for debugging/evaluation only)

---

## 7. Endpoints (Final MVP+)
### 7.1 GET `/buildings`

Query building results within the current map view.

Query params:
- `bbox` (required): `minLon,minLat,maxLon,maxLat`
- `damage_class` (optional): one of `no-damage|minor-damage|major-damage|destroyed`
- `min_confidence` (optional): float 0..1
- `limit` (optional): default 200, max 2000
- `offset` (optional): default 0
- `include_images` (optional): boolean, default false  
  - `false`: omit pre/post URLs for faster map rendering  
  - `true`: include pre/post URLs (useful for small AOI)

Response:
```json
{
  "data": {
    "items": [
      {
        "building_id": "...",
        "geometry": { "type": "Polygon", "coordinates": [[[...]]] },
        "damage_class": "minor-damage",
        "confidence": 0.7,
        "run_id": "run_2026_03_01",
        "model_version": "gemini-2.0-flash",
        "created_at": "2026-03-01T20:15:00Z"
      }
    ],
    "count": 1
  },
  "meta": { "bbox": "...", "limit": 200, "offset": 0 },
  "error": null
}
```
### 7.2 GET `/buildings/{building_id}`

Fetch a single building’s detail view (used when user clicks a building).

Path param:

- `building_id` (required): string

Response:
```json
{
  "data": {
    "building_id": "...",
    "geometry": { "type": "Polygon", "coordinates": [[[...]]] },
    "damage_class": "minor-damage",
    "confidence": 0.63,
    "pre_image_url": "https://storage/.../pre.jpg",
    "post_image_url": "https://storage/.../post.jpg",
    "run_id": "run_2026_03_01",
    "model_version": "gemini-2.0-flash",
    "created_at": "2026-03-01T20:15:00Z",
    "tile_id": "santa-rosa-wildfire_00000328",
    "pixel_bbox": { "xmin": 12, "ymin": 33, "xmax": 88, "ymax": 120 }
  },
  "meta": null,
  "error": null
}
```
### 7.3 GET `/stats`

Return summary statistics for a region (used by UI side panel and chatbot).

Query params:

- `bbox`
- `run_id`  — if not provided, use latest
- `damage_class`  — filter

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
    "run_id": "run_2026_03_01",
    "model_version": "gemini-2.0-flash"
  },
  "meta": { "bbox": "..." },
  "error": null
}
```
### 7.4 GET `/runs`

List available inference runs (for reproducibility).

Response:
```json
{
  "data": {
    "items": [
    {
        "run_id": "run_2026_03_01",
        "model_version": "gemini-2.0-flash",
        "created_at": "2026-03-01T20:15:00Z",
        "notes": "batch over Santa Rosa test set"
      }
    ]
  },
  "meta": null,
  "error": null
}
```
### 7.5 POST `/chat/query`

If you want the chatbot to call one endpoint (instead of the UI calling /stats directly).

Request:
```json
{
  "question": "How many destroyed buildings are in this area?",
  "bbox": "-122.80,38.35,-122.60,38.55",
  "filters": { "damage_class": null }
}
```
Response:
```json
{
  "data": {
    "answer": "There are 2 destroyed buildings in the selected area.",
    "supporting_data": {
      "counts": { "destroyed": 2 },
      "bbox": "..."
    }
  },
  "meta": null,
  "error": null
}
```
### 7.6 GET `/healthz`

Health check.
```json

{ "status": "ok" }
```
### 7.7 GET `/version`

Backend + model version info.
```json
{ "backend_version": "0.1.0", "model_version": "gemini-2.0-flash" }
```
---

## 8. Performance Notes (for map UI)

- `/buildings` should be fast; default `include_images=false` for map rendering.
- Use `limit/offset` paging if many buildings fall inside the bbox.
- Simplify geometry only if needed; do not break polygon correctness.

---



## 9. Security / Auth (MVP)

- MVP can be unauthenticated within a classroom environment.
- If needed later:
  - Add API key header `X-API-Key`
  - Configure CORS (allowed origins)
---


## 10. Definition of Done

Frontend can:
- query buildings in bbox
- filter by `damage_class`
- click a building to view pre/post crops + prediction
- show stats counts for selected bbox

System can:
- return valid responses for `GET /buildings`, `GET /buildings/{building_id}`, and `GET /stats`
- handle missing predictions gracefully (`damage_class=null`, `confidence=null`) without breaking the UI
