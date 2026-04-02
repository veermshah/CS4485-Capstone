# Demo Plan (Final)

## 1. Goal
Demonstrate an end-to-end workflow for disaster damage assessment using xView2 (Santa Rosa wildfire):
- show the geospatial dashboard (map + layers + building annotations)
- show per-building inspection (pre/post crops)
- show how predictions/metadata are served (API or GCS index)
- show a simple evaluation summary (if available)


---

## 2. What we will show (Script)

### Step A — Open the dashboard (UI baseline)
1. Start the frontend and open the dashboard in the browser.
2. Confirm the **general map view** loads.

Success criteria:
- Map renders successfully (no blank screen / no console error).

### Step B — Pre vs Post imagery layers
3. Toggle **Pre-disaster imagery** layer ON/OFF.
4. Toggle **Post-disaster imagery** layer ON/OFF.

Success criteria:
- Pre and Post are clearly separate layers and can be toggled independently.

### Step C — Building annotations (boundaries/boxes)
5. Enable building annotations (polygons/boxes).
6. Zoom/pan and show that annotations remain aligned with the imagery/map.

Success criteria:
- Buildings are correctly visualized as boundaries/annotations on the map.

### Step D — Click-to-inspect (building detail)
7. Click one building annotation to open a detail view/popup.
8. Show:
   - pre-disaster crop (image)
   - post-disaster crop (image)
   - (if available) predicted `damage_class` + `confidence`

Success criteria:
- At least one building can be inspected with pre/post crops visible.

### Step E — Stats summary (bbox / region)
9. Select an area of interest (bbox) and show summary stats:
   - counts by damage_class (if available)
   - total buildings (if available)

Success criteria:
- Stats endpoint or stats UI returns reasonable counts (or shows placeholder gracefully).

### Step F (Optional) — Chatbot query
10. Ask a simple query:
- “How many destroyed buildings are in this area?”
- “Show the most damaged buildings in this region.”

Success criteria:
- Chatbot response is grounded in `/stats` or stored data (no hallucinated numbers).

---

## 3. Data Sources
- Dataset: xView2 / xBD
- Event: 2017 Santa Rosa Wildfire
- Inputs:
  - paired pre/post imagery
  - building polygons/labels from xView2 annotations
- Stored artifacts (current):
  - `gs://images-metadata/dataset_records.csv` (master index)
  - `gs://images-metadata/crops/...` (pre/post building crops)
- Outputs (demo):
  - building annotations on map
  - pre/post crops in detail view
  - (optional) predictions: `damage_class` + `confidence`

---

## 4. Tech / Components shown in demo
- Frontend: Next.js + Mapbox (dashboard)
- Data pipeline: crop generation + GCS upload
- Storage: GCS bucket `images-metadata`
- API (if enabled): endpoints in `docs/api.md` (`/buildings`, `/stats`, etc.)

---

## 5. Pre-demo Checklist (Do this before presenting)
- Frontend runs locally:
  - `cd client`
  - `npm install`
  - `npm run dev`
  - open `http://localhost:3000`
- Crops exist in GCS:
  - `dataset_records.csv` present
  - at least some `crops/<uid>/pre.*` and `crops/<uid>/post.*` present
- Dashboard can show:
  - map
  - pre/post layers
  - building annotations
  - click-to-inspect popup with images

---

## 6. Backup Plan (if something breaks)
If predictions or backend are not ready:
- still demo the UI rubric items:
  - general map view
  - pre/post layers
  - building annotations
  - click-to-inspect shows pre/post crops
- explain that prediction fields will appear once batch inference output is uploaded.

If GCS access fails:
- use a local sample folder of crops + a small sample CSV (5–10 buildings) to demo the same UI flow.

---

## 7. Definition of Demo Success
At minimum, we can complete Steps A–D end-to-end (map → toggle layers → buildings → click → pre/post crops) in under 2 minutes.
