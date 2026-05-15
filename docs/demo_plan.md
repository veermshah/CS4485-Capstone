# Demo Plan

## 1. Goal

Demonstrate the final FireLens workflow for disaster damage assessment using the xView2 / xBD Santa Rosa wildfire dataset.

The demo should show:

- the deployed geospatial dashboard
- pre/post-disaster imagery layers
- building footprint overlays and damage filtering
- building-level inspection with pre/post crops
- Gemini prediction vs ground-truth labels
- evaluation metrics and confusion matrix
- chatbot-assisted querying
- live VLM testing with uploaded pre/post image pairs

---

## 2. Deployed Demo

Live application:

```text
https://firelens-umber.vercel.app/
```

The deployed app should be used for the final presentation whenever possible.

---

## 3. Demo Flow / Script

### Step A — Open the Dashboard

1. Open the deployed FireLens website.
2. Confirm that the main dashboard loads.
3. Show the Santa Rosa wildfire map area.

Success criteria:

- The deployed website is accessible.
- The map loads without a blank screen.
- The main dashboard layout is visible.

---

### Step B — Show Map Layers

1. Show the default satellite/base map.
2. Toggle or display the pre-disaster imagery layer.
3. Toggle or display the post-disaster imagery layer.
4. Zoom and pan to show how the layers align with the map.

Success criteria:

- Pre- and post-disaster layers are visible or toggleable.
- Imagery remains aligned with the map and building overlays.

---

### Step C — Show Building Overlays

1. Display building footprints / GeoJSON overlays.
2. Show damage-class color encoding if available.
3. Use filters to narrow buildings by damage class.

Success criteria:

- Building polygons appear on the map.
- The visible building list updates based on map view or filters.
- Damage categories can be used to explore the dataset.

---

### Step D — Building-Level Inspection

1. Click a building footprint or select a building from the list.
2. Open the building detail panel.
3. Show available metadata:
   - building ID / UID
   - tile ID
   - coordinates
   - address or location context
   - Gemini prediction
   - FEMA / xBD ground-truth label
4. Open the imagery tab and show:
   - pre-disaster crop
   - post-disaster crop

Success criteria:

- Selecting a building opens the detail panel.
- Pre/post crops load correctly.
- Prediction and ground-truth information are visible when available.

---

### Step E — Evaluation Metrics Page

1. Open the metrics / evaluation page.
2. Show the overall model accuracy.
3. Show precision, recall, and F1 metrics.
4. Show the confusion matrix.
5. Explain that the model performs better on `no-damage` and `destroyed`, while `minor-damage` and `major-damage` are harder due to limited support and subtle visual differences.

Success criteria:

- Metrics page displays final evaluation results.
- Confusion matrix is visible.
- Evaluation results match the final VLM run.

---

### Step F — Chatbot Query

Ask one or two sample questions using the chatbot.

Example prompts:

```text
Zoom to Fountaingrove neighborhood and summarize damage.
```

```text
Where are the least damaged areas?
```

```text
Show false positives and false negatives.
```

```text
List potentially unsafe buildings.
```

Success criteria:

- Chatbot responds using stored project data.
- Responses are grounded in building metadata, evaluation results, or visible map context.
- If external search is used, the chatbot provides relevant sources or references.

---

### Step G — Live VLM Evaluation Page

1. Open the Evaluate page.
2. Upload one pre-disaster crop.
3. Upload one post-disaster crop.
4. Run evaluation.
5. Show the returned:
   - damage label
   - confidence score
   - model name
   - short reasoning

Success criteria:

- The page accepts a pre/post image pair.
- The backend calls Gemini through FastAPI.
- A prediction result is displayed to the user.

---

## 4. Data Sources

### Dataset

- Dataset: xView2 / xBD
- Event: Santa Rosa wildfire, October 2017
- Inputs:
  - pre-disaster imagery
  - post-disaster imagery
  - building polygons
  - FEMA / xBD damage labels

### Stored Artifacts

Final data artifacts are stored in Cloudflare R2 object storage.

Main artifacts include:

- `dataset_records.csv`
- `evaluation_results.csv`
- `crops/`
- `images/`
- building GeoJSON / metadata
- prediction outputs

---

## 5. Technologies Shown in Demo

### Frontend

- Next.js
- React
- Mapbox GL
- Vercel deployment

### Backend

- Python
- FastAPI
- Render deployment

### VLM / AI

- Gemini 2.5 Flash
- Gemini-based chatbot workflow
- Offline batch inference
- Live single-pair VLM evaluation

### Data / Storage

- Cloudflare R2 object storage
- CSV artifacts
- GeoJSON building footprints
- image crops
- slippy map tiles

### Evaluation

- Pandas
- scikit-learn
- accuracy
- precision
- recall
- F1
- confusion matrix

---

## 6. Pre-Demo Checklist

Before presenting, verify:

- deployed app opens successfully
- frontend main dashboard loads
- backend health check works
- map renders
- pre/post imagery layers load
- building overlays appear
- building list updates
- clicking a building opens the detail panel
- pre/post image crops load
- metrics page displays final results
- chatbot can answer at least one safe demo prompt
- Evaluate page can run one live pre/post VLM test if API quota is available

---

## 7. Backup Plan

If the chatbot hits API rate limits:

- show the chatbot UI
- explain that it reads from stored dataset/evaluation outputs
- use a prepared example response or previously tested prompt
- continue the demo with dashboard and metrics page

If live VLM evaluation fails:

- show the Evaluate page UI
- explain the intended pre/post upload workflow
- show offline VLM results from `evaluation_results.csv`
- show metrics page and confusion matrix

If imagery does not load:

- verify the Cloudflare R2 base URL
- refresh the page
- use screenshots in the slide deck as backup

If backend is sleeping:

- wait for the Render service to wake up
- call the health endpoint
- retry the request

---

## 8. Definition of Demo Success

The demo is successful if the team can show:

- deployed dashboard is live
- map and imagery layers load
- building overlays and building list are visible
- users can inspect at least one building
- pre/post crops are visible
- model predictions and/or ground-truth labels are shown
- metrics page displays evaluation results
- chatbot or prepared chatbot workflow is demonstrated
- VLM testing page is shown or explained

At minimum, the team should complete:

```text
dashboard -> map layers -> building overlays -> building detail -> pre/post crops -> metrics page
```

within the presentation time.

---

## 9. Presentation Timing

Recommended timing for a 15-minute final presentation:

| Section | Time |
|---|---|
| Project overview and problem | 1-2 min |
| Architecture and implementation | 3-4 min |
| Dashboard demo | 4-5 min |
| Metrics / evaluation | 2 min |
| Chatbot and VLM test page | 2-3 min |
| Conclusion / future work | 1 min |

---

## 10. Notes for Presenters

- Keep the presentation focused on the deployed app.
- Do not spend too much time explaining code details.
- Emphasize the end-to-end workflow.
- Mention that VLM batch inference is offline for stability.
- Mention that live VLM testing is available through the Evaluate page.
- Explain limitations clearly, especially API quota and class imbalance.
- Use screenshots as backup if any live feature fails.
