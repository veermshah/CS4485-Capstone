from __future__ import annotations

import csv
import json
import uuid
from functools import lru_cache
from pathlib import Path
from statistics import mean
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    allowed_origins: str = "http://localhost:3000"
    vlm_endpoint_url: str | None = None
    chat_endpoint_url: str | None = None
    model_api_key: str | None = None
    public_base_url: str = "http://localhost:3000"


class BuildingContext(BaseModel):
    building_id: str
    uid: str
    tile_id: str | None = None
    bbox: str | None = None
    dataset_label: str | None = None
    crop_pre_url: str | None = None
    crop_post_url: str | None = None
    source_pre_url: str | None = None
    source_post_url: str | None = None
    geojson: dict[str, Any] | None = None
    centroid: dict[str, float] | None = None


class PredictResponse(BaseModel):
    building_id: str
    model: str
    damage_class: str
    confidence: float
    rationale: str
    raw: dict[str, Any] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    building_id: str = Field(min_length=1)
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    building_id: str
    response: str
    prediction: PredictResponse | None = None


ROOT_DIR = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT_DIR / "output"
CROPS_DIR = OUTPUT_DIR / "crops"
CSV_PATH = OUTPUT_DIR / "dataset_records.csv"


app = FastAPI(title="FireLens Backend", version="0.1.0")
settings = Settings()

origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores for prototype phase.
prediction_cache: dict[str, PredictResponse] = {}
conversation_store: dict[str, list[ChatMessage]] = {}


@lru_cache(maxsize=1)
def csv_index() -> dict[str, dict[str, str]]:
    if not CSV_PATH.exists():
        return {}

    index: dict[str, dict[str, str]] = {}
    with CSV_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            uid = row.get("uid")
            if uid:
                index[uid] = row
    return index


def _normalize_tile_id(raw_tile_id: str | None) -> str | None:
    if not raw_tile_id:
        return None
    # dataset_records stores values like santa-rosa-wildfire_00000000
    return raw_tile_id.replace("santa-rosa-wildfire_", "")


def _meta_path(uid: str) -> Path:
    return CROPS_DIR / uid / "meta.json"


def _load_meta(uid: str) -> dict[str, Any] | None:
    path = _meta_path(uid)
    if not path.exists():
        return None

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _polygon_centroid(geojson: dict[str, Any] | None) -> dict[str, float] | None:
    if not geojson:
        return None

    try:
        coordinates = geojson["geometry"]["coordinates"][0]
        lons = [point[0] for point in coordinates]
        lats = [point[1] for point in coordinates]
        return {"lon": float(mean(lons)), "lat": float(mean(lats))}
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def get_building_context_or_404(building_id: str) -> BuildingContext:
    row = csv_index().get(building_id)
    meta = _load_meta(building_id)

    if row is None and meta is None:
        raise HTTPException(status_code=404, detail=f"Building '{building_id}' not found")

    raw_tile_id = row.get("tile_id") if row else None
    if raw_tile_id is None and isinstance(meta, dict):
        raw_tile_id = meta.get("tile_id")

    tile_id = _normalize_tile_id(raw_tile_id)

    crop_pre_url = None
    crop_post_url = None
    source_pre_url = None
    source_post_url = None

    if tile_id:
        crop_pre_url = f"{settings.public_base_url}/api/building-crop/{tile_id}/{building_id}/pre"
        crop_post_url = f"{settings.public_base_url}/api/building-crop/{tile_id}/{building_id}/post"
        source_pre_url = f"{settings.public_base_url}/api/source-image/{tile_id}/pre"
        source_post_url = f"{settings.public_base_url}/api/source-image/{tile_id}/post"

    geojson = meta.get("geojson") if isinstance(meta, dict) else None

    return BuildingContext(
        building_id=building_id,
        uid=building_id,
        tile_id=tile_id,
        bbox=row.get("bbox") if row else None,
        dataset_label=row.get("label") if row else None,
        crop_pre_url=crop_pre_url,
        crop_post_url=crop_post_url,
        source_pre_url=source_pre_url,
        source_post_url=source_post_url,
        geojson=geojson,
        centroid=_polygon_centroid(geojson),
    )


async def request_external_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.model_api_key:
        headers["Authorization"] = f"Bearer {settings.model_api_key}"

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


async def predict_for_building(building_id: str) -> PredictResponse:
    cached = prediction_cache.get(building_id)
    if cached:
        return cached

    context = get_building_context_or_404(building_id)

    if settings.vlm_endpoint_url:
        external = await request_external_json(
            settings.vlm_endpoint_url,
            payload={"building_id": building_id, "context": context.model_dump()},
        )

        prediction = PredictResponse(
            building_id=building_id,
            model=str(external.get("model", "external-vlm")),
            damage_class=str(external.get("damage_class", "unknown")),
            confidence=float(external.get("confidence", 0.0)),
            rationale=str(external.get("rationale", "No rationale provided.")),
            raw=external,
        )
    else:
        # Deterministic fallback lets frontend integration work before model hookup.
        fallback_label = context.dataset_label or "un-classified"
        prediction = PredictResponse(
            building_id=building_id,
            model="fallback-dataset-proxy",
            damage_class=fallback_label,
            confidence=0.55,
            rationale="Fallback response using dataset label until VLM endpoint is configured.",
            raw={"source": "dataset_records.csv"},
        )

    prediction_cache[building_id] = prediction
    return prediction


def _history(conversation_id: str) -> list[ChatMessage]:
    if conversation_id not in conversation_store:
        conversation_store[conversation_id] = []
    return conversation_store[conversation_id]


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/v1/buildings/{building_id}/context", response_model=BuildingContext)
async def building_context(building_id: str) -> BuildingContext:
    return get_building_context_or_404(building_id)


@app.post("/v1/buildings/{building_id}/predict", response_model=PredictResponse)
async def building_predict(building_id: str) -> PredictResponse:
    return await predict_for_building(building_id)


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    context = get_building_context_or_404(req.building_id)
    prediction = await predict_for_building(req.building_id)

    conversation_id = req.conversation_id or str(uuid.uuid4())
    history = _history(conversation_id)
    history.append(ChatMessage(role="user", content=req.message))

    if settings.chat_endpoint_url:
        external = await request_external_json(
            settings.chat_endpoint_url,
            payload={
                "message": req.message,
                "conversation": [m.model_dump() for m in history],
                "building_context": context.model_dump(),
                "prediction": prediction.model_dump(),
            },
        )
        assistant_text = str(external.get("response", "No response from chat model."))
    else:
        centroid = context.centroid
        loc = (
            f" at ({centroid['lat']:.5f}, {centroid['lon']:.5f})"
            if centroid is not None
            else ""
        )
        assistant_text = (
            f"Building {req.building_id}{loc} is predicted as {prediction.damage_class} "
            f"with confidence {prediction.confidence:.2f}. "
            f"Evidence summary: {prediction.rationale}. "
            f"Question received: {req.message}"
        )

    history.append(ChatMessage(role="assistant", content=assistant_text))

    return ChatResponse(
        conversation_id=conversation_id,
        building_id=req.building_id,
        response=assistant_text,
        prediction=prediction,
    )
