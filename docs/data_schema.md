# Data & DB Schema (MVP)

## buildings
- building_id (PK)
- geometry (GeoJSON or PostGIS)
- event_name
- created_at

## runs
- run_id (PK)
- model_version
- data_version
- started_at
- finished_at
- notes

## predictions
- id (PK)
- run_id (FK)
- building_id (FK)
- damage_class
- confidence
- pre_image_url
- post_image_url
- created_at
