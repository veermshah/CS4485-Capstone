# Runbook

## Deployed Demo
- https://firelens-umber.vercel.app/

## Frontend (Local)

1. Open a terminal and go to the client folder:
   - `cd client`

2. Install dependencies:
   - `npm install`

3. Start the dev server:
   - `npm run dev`

4. Open the URL printed in the terminal (typically `http://localhost:3000`).

## Current Data Source
For the current demo, data is sourced from Google Cloud Storage (GCS):
- master index: `dataset_records.csv`
- imagery artifacts: `crops/` folder with pre/post building images

## Demo Checklist
After opening the app, verify:
- the map loads
- pre/post imagery layers are visible or toggleable
- building annotations/polygons appear
- clicking a building shows some detail

## Troubleshooting
- If the map does not load, restart the frontend dev server.
- If images do not appear, verify crop paths / GCS URLs.
- If predictions are missing, the UI may still load and show placeholders.
