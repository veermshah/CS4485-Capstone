# Tech Stack

## 1. Overview

FireLens is a deployed disaster damage assessment dashboard that combines:

- geospatial visualization
- pre/post-disaster imagery
- building-level damage predictions
- VLM evaluation
- chatbot-assisted querying
- cloud-hosted data artifacts

The final system uses a **Next.js + Mapbox frontend**, a **FastAPI backend**, **Gemini VLM models**, **Cloudflare R2 object storage**, and **Vercel / Render deployment**.

---

## 2. Frontend

### Framework
- **Next.js**
- **React**
- **JavaScript / TypeScript**

### Mapping and Geospatial UI
- **Mapbox GL**
- Interactive map centered on the Santa Rosa wildfire area
- Pre-disaster and post-disaster imagery layers
- Building footprint overlays using GeoJSON
- Damage-class color coding
- Building list synchronized with the current map view
- Full-screen map mode
- Light/dark theme support

### Main UI Features
- General disaster map view
- Pre/post imagery layer switching
- Building annotations / polygons
- Building detail panel
- Pre/post cropped image inspection
- Gemini prediction vs ground-truth label display
- Damage-class filtering
- Metrics page with evaluation results
- Chatbot panel
- Evaluate page for live VLM testing with uploaded image pairs

---

## 3. Backend

### Language
- **Python**

### Framework
- **FastAPI**

### Main Responsibilities
- Provide live VLM evaluation endpoint for uploaded pre/post image pairs
- Support chatbot requests
- Connect Gemini API calls to the frontend
- Handle environment-based configuration for API keys
- Provide backend health check / service availability

### Deployment
- Backend deployed separately on **Render**
- Local backend runs on:

```text
http://localhost:8000
```

---

## 4. VLM / Inference

### Model
- **Gemini 2.5 Flash**
- **Gemini 2.5 Flash Lite** or similar low-latency Gemini model for chatbot use

### VLM Workflow
FireLens supports two VLM workflows:

1. **Offline batch inference**
   - Used for the main dashboard, metrics page, and chatbot
   - Processes pre/post building crop pairs
   - Writes prediction outputs to CSV / result files
   - Reduces cost, latency, and API rate-limit issues

2. **Live single-pair evaluation**
   - Used by the Evaluate page
   - User uploads one pre-disaster image and one post-disaster image
   - Backend calls Gemini and returns:
     - damage label
     - confidence score
     - reasoning
     - model name

### Output Fields
- `damage_class`
- `confidence`
- `reasoning`
- `model_version`
- `true_label`
- `gemini_label`
- `correct`

### Damage Classes
- `no-damage`
- `minor-damage`
- `major-damage`
- `destroyed`

---

## 5. Data Processing

### Dataset
- **xView2 / xBD**
- Santa Rosa wildfire case study

### Image Processing
- Building-level crop generation from pre/post-disaster imagery
- Crop bounding boxes based on building footprints
- Crop artifacts stored for visual inspection and VLM inference

### Libraries / Tools
- **Pillow** for image cropping
- **Shapely** for geometry / footprint processing
- **Pandas** for CSV processing and evaluation data handling
- **scikit-learn** for evaluation metrics such as precision, recall, F1, and confusion matrix
- **Sharp** for server-side tile image processing / composition in the frontend route layer

---

## 6. Storage / Data Layer

### Final Storage Model
- **Cloudflare R2 object storage**
- File-based storage instead of a traditional relational database

### Main Stored Artifacts
- `dataset_records.csv`
- `evaluation_results.csv`
- `crops/`
- `images/`
- building GeoJSON / metadata
- prediction outputs

### Why Object Storage
Cloudflare R2 is used because most FireLens data is file-based and read-heavy:

- imagery artifacts
- cropped building images
- CSV records
- GeoJSON metadata
- evaluation outputs

This keeps the final demo simpler, cheaper, and easier to deploy than a full relational database.

---

## 7. Chatbot

### Model / API
- Gemini-based chatbot workflow
- Optional external search provider through Brave Search

### Data Sources
The chatbot reads the same stored artifacts as the dashboard:

- `evaluation_results.csv`
- `dataset_records.csv`
- building GeoJSON / metadata
- selected building context
- visible map context
- damage labels and VLM predictions

### Supported Use Cases
- Summarize damage in a selected area
- List potentially unsafe buildings
- Explain false positives and false negatives
- Compare Gemini predictions with ground truth
- Answer disaster-related questions using stored data and optional search references

---

## 8. Deployment

### Frontend Deployment
- **Vercel**

Deployed demo:

```text
https://firelens-umber.vercel.app/
```

### Backend Deployment
- **Render**
- FastAPI backend service

### Environment Configuration
Frontend environment variables include:

```env
FIRELENS_DATA_BASE_URL=
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_BACKEND_URL=
BACKEND_URL=
```

Backend environment variables include:

```env
ALLOWED_ORIGINS=
PUBLIC_BASE_URL=
GEMINI_API_KEY=
SEARCH_PROVIDER=
SEARCH_API_KEY=
```

Security note:

- Real API keys should never be committed to GitHub.
- Use placeholders in documentation.
- Configure production secrets in Vercel and Render environment settings.

---

## 9. CI/CD and Project Workflow

### Version Control
- GitHub repository
- Feature branches
- Pull requests
- Code reviews

### Project Management
- GitHub Projects board
- Tickets assigned to team members
- Status tracking for backlog, in progress, and completed work

### CI/CD
- GitHub Actions for basic checks where applicable
- Vercel automatic deployment from the main branch
- Render deployment for backend service

---

## 10. Summary

| Area | Technology |
|---|---|
| Frontend | Next.js, React, JavaScript / TypeScript |
| Map UI | Mapbox GL |
| Backend | Python, FastAPI |
| VLM | Gemini 2.5 Flash |
| Chatbot | Gemini + optional Brave Search |
| Data Processing | Pillow, Shapely, Pandas, scikit-learn |
| Image / Tile Processing | Sharp |
| Storage | Cloudflare R2 |
| Frontend Deployment | Vercel |
| Backend Deployment | Render |
| Workflow | GitHub, Pull Requests, GitHub Projects, GitHub Actions |
