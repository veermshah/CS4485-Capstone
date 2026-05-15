# Runbook

## 1. Deployed Demo

Live demo:

```text
https://firelens-umber.vercel.app/
```

---

## 2. Local Setup Overview

To run FireLens locally, start both services:

1. Frontend Next.js app in `client/`
2. Backend FastAPI server in `backend/`

Default local URLs:

| Service | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8000` |

---

## 3. Frontend Local Setup

Open a terminal and go to the frontend folder:

```bash
cd client
```

Install dependencies:

```bash
npm install
```

Start the frontend development server:

```bash
npm run dev
```

Open the URL printed in the terminal, usually:

```text
http://localhost:3000
```

---

## 4. Backend Local Setup

Open a second terminal and go to the backend folder:

```bash
cd backend
```

Create a virtual environment:

```bash
py -m venv .venv
```

Activate the virtual environment on Windows:

```bash
.venv\Scripts\activate
```

Install backend dependencies:

```bash
python -m pip install -r requirements.txt
```

Start the FastAPI backend server:

```bash
uvicorn app.main:app --reload --port 8000
```

The backend should now be available at:

```text
http://localhost:8000
```

---

## 5. Environment Variables

Do **not** commit real API keys or `.env` files to GitHub.

Use placeholder values in documentation and configure real values locally or in deployment settings.

---

## 6. Backend Environment Variables

Create a file at:

```text
backend/.env
```

Example:

```env
ALLOWED_ORIGINS=http://localhost:3000/
PUBLIC_BASE_URL=http://localhost:3000/
GEMINI_API_KEY=your_gemini_api_key_here
SEARCH_PROVIDER=brave
SEARCH_API_KEY=your_brave_search_api_key_here
```

Variable descriptions:

| Variable | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Allows the local frontend to call the backend |
| `PUBLIC_BASE_URL` | Base URL used by the backend for local app references |
| `GEMINI_API_KEY` | Required for Gemini VLM and chatbot requests |
| `SEARCH_PROVIDER` | Search provider used for external disaster-related references |
| `SEARCH_API_KEY` | API key for the configured search provider |

---

## 7. Frontend Environment Variables

Create a file at:

```text
client/.env
```

Example:

```env
FIRELENS_DATA_BASE_URL=https://your-r2-public-url.example/
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000/
BACKEND_URL=http://localhost:8000/
```

Variable descriptions:

| Variable | Purpose |
|---|---|
| `FIRELENS_DATA_BASE_URL` | Public base URL for Cloudflare R2 data files and imagery |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox token used by the frontend map |
| `GEMINI_API_KEY` | Gemini key if any frontend/server-side route requires it |
| `NEXT_PUBLIC_BACKEND_URL` | Backend URL exposed to frontend code |
| `BACKEND_URL` | Backend URL used by server-side frontend code |

---

## 8. Current Data Source

For the final demo, FireLens reads prepared data artifacts from Cloudflare R2 object storage.

Main artifacts include:

- `dataset_records.csv`
- `evaluation_results.csv`
- `images/`
- `crops/`
- building GeoJSON / metadata

The dashboard, metrics page, and chatbot use the same stored outputs so that displayed map data and chatbot responses remain consistent.

---

## 9. Demo Checklist

After opening the app, verify:

- the map loads
- pre/post imagery layers are visible or toggleable
- building annotations/polygons appear
- building list updates with the current map view
- clicking a building opens the detail panel
- pre/post crop imagery loads in the imagery tab
- metrics page displays evaluation results
- chatbot can answer dataset or damage-related questions
- Evaluate page can upload pre/post images for VLM testing if backend API keys are configured

---

## 10. Troubleshooting

### 10.1 Frontend does not start

Try:

```bash
cd client
npm install
npm run dev
```

Check that `client/.env` exists and contains the required frontend variables.

---

### 10.2 Backend does not start

Try:

```bash
cd backend
.venv\Scripts\activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check that `backend/.env` exists and contains the required backend variables.

---

### 10.3 Map does not load

Check:

- `NEXT_PUBLIC_MAPBOX_TOKEN`
- browser console errors
- internet connection
- Mapbox token permissions

---

### 10.4 Images or crops do not appear

Check:

- `FIRELENS_DATA_BASE_URL`
- Cloudflare R2 public URL
- expected paths such as `crops/`, `images/`, or tile paths
- whether R2 objects are publicly accessible

---

### 10.5 Chatbot or VLM evaluation fails

Check:

- `GEMINI_API_KEY`
- backend server is running on `http://localhost:8000`
- `NEXT_PUBLIC_BACKEND_URL` points to the backend
- API quota or rate limits
- backend logs in the terminal

---

### 10.6 Search-backed chatbot responses fail

Check:

- `SEARCH_PROVIDER`
- `SEARCH_API_KEY`
- search API quota or configuration

---

## 11. Security Notes

- Never commit real `.env` files.
- Never commit real API keys.
- Use placeholders in documentation.
- Store real deployment secrets in Vercel and Render environment variable settings.
- If a key is accidentally committed, rotate or revoke it immediately.

---

## 12. Definition of Done

The runbook is complete when a new developer can:

- run the frontend locally
- run the backend locally
- configure required environment variables using placeholders as examples
- understand where the final demo data comes from
- verify the main demo features
- troubleshoot common frontend, backend, image, chatbot, and VLM issues
