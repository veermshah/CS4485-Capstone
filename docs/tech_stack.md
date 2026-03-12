# Tech Stack

## Frontend
- Framework: React
- Language: JavaScript/TypeScript
- Map: Mapbox
- map layers: pre/post imagery + building annotations
- UI features : general map view, pre/post layer toggle, building boundaries/boxes

## Backend
- Language: Python
- Framework: FastAPI
- Purpose: serve building geometry + predictions + image URLs to dashboard and chatbot (MVP)

## VLM / Inference
- Pipeline: batch inference
- Output: damage_class + confidence per building

## Storage / Database
- Managed DB + object storage 
- Stores: imagery artifacts , predictions, run metadata

## CI/CD
- GitHub pull requests + reviews
- GitHub Actions for basic checks
