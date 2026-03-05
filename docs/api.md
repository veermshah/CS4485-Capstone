# API Contract (MVP)

## Response fields 
- building_id: string
- geometry: GeoJSON Polygon (WGS84)
- damage_class: string or int (TBD)
- confidence: float (0..1)
- pre_image_url: string
- post_image_url: string
- run_id: string
- model_version: string
- created_at: timestamp

## Endpoints（MVP）
### GET /buildings
Query buildings within map view 
Params: bbox=minLon,minLat,maxLon,maxLat; damage_class(optional); limit/offset(optional)

### GET /buildings/{building_id}
Get one building detail 

### GET /stats
Summary stats for bbox 
Params: bbox=...

### GET /healthz
Health check 

### GET /version
Backend + model version
