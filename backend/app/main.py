from __future__ import annotations

import io
import csv
import html
import json
import re
import sys
import uuid
import time
import ast
from functools import lru_cache
from pathlib import Path
from statistics import mean
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi import File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    from PIL import Image
except Exception:  # pragma: no cover - dependency guard
    Image = None

try:
    from google import genai
    from google.genai import types
except Exception:  # pragma: no cover - dependency guard
    genai = None
    types = None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    allowed_origins: str = "http://localhost:3000"
    vlm_endpoint_url: str | None = None
    chat_endpoint_url: str | None = None
    model_api_key: str | None = None
    gemini_api_key: str | None = None
    public_base_url: str = "http://localhost:3000"
    search_provider: str | None = None
    search_api_key: str | None = None
    search_endpoint_url: str | None = None
    search_result_limit: int = 3
    search_cache_ttl_seconds: int = 6 * 60 * 60
    search_summary_cache_ttl_seconds: int = 24 * 60 * 60


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


class EvaluateResponse(BaseModel):
    model: str
    damage_class: str
    confidence: float
    rationale: str
    raw: dict[str, Any] = Field(default_factory=dict)


class SpatialCenter(BaseModel):
    lng: float
    lat: float


class SpatialContext(BaseModel):
    kind: str
    center: SpatialCenter | None = None
    zoom: int | None = None
    building_ids: list[str] = Field(default_factory=list)
    label: str | None = None


class ReferenceSource(BaseModel):
    title: str
    url: str
    summary: str | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    building_id: str | None = None
    conversation_id: str | None = None
    # Caller-supplied spatial / dataset context (e.g. nearby buildings, hotspots)
    # built by the Next.js layer from the GeoJSON it already serves.
    extra_context: str | None = None
    spatial_context: SpatialContext | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    building_id: str | None = None
    response: str
    prediction: PredictResponse | None = None
    map_focus: SpatialContext | None = None
    sources: list[ReferenceSource] = Field(default_factory=list)


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / "output"
CROPS_DIR = OUTPUT_DIR / "crops"
CSV_PATH = OUTPUT_DIR / "dataset_records.csv"
EVALUATION_CSV_PATH = ROOT_DIR / "evaluation_results.csv"


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
search_cache: dict[str, tuple[float, list[dict[str, str | None]]]] = {}
summary_cache: dict[str, tuple[float, str]] = {}


EVALUATION_SYSTEM_PROMPT = """You are a specialized Disaster Assessment AI. Your objective is to perform automated, building-level structural damage analysis by comparing pre-disaster and post-disaster aerial imagery.

Task Guidelines:
1. Visual Comparison: Analyze the provided pair of image crops (Pre-disaster vs. Post-disaster) for a specific building footprint.
2. Damage Classification: You must classify the damage into exactly one of these four categories:
* Undamaged: No visible structural changes or impact.
* Damaged: Minor visible impact or surface damage.
* Severely Damaged: Significant structural compromise, partially collapsed, or major exterior loss.
* Destroyed: Complete structural loss or total collapse.
3. Environmental Context: Account for potential interference like smoke, shadows, or varying image quality.
4. Output Format: You must respond exclusively in valid JSON format. Do not include conversational text.

JSON Schema:
{
"building_id": "string",
"damage_level": "Undamaged" | "Damaged" | "Severely Damaged" | "Destroyed",
"confidence_score": float (0.0 to 1.0),
"reasoning": "A brief explanation (max 20 words) citing specific visual changes observed."
}"""

VLM_TO_API_DAMAGE_CLASS = {
    "undamaged": "no-damage",
    "damaged": "minor-damage",
    "severely damaged": "major-damage",
    "destroyed": "destroyed",
}


DISASTER_QUERY_PATTERN = re.compile(
    r"\b(disaster|wildfire|fire|smoke|ash|evacuat|emergency|response|recovery|damage|damaged|destroyed|building|buildings|fema|vlm|prediction|assessment|hotspot|unsafe|shelter|rescue|storm|flood|hurricane|tornado|earthquake|aftershock|outage|inspection|false\s*positives?|false\s*negatives?|precision|recall|confusion|misclassif)\b",
    re.IGNORECASE,
)

EVALUATION_QUERY_PATTERN = re.compile(
    r"\b(false\s*positives?|false\s*negatives?|confusion|precision|recall|misclassif|mismatch)\b",
    re.IGNORECASE,
)

REFERENCE_LIBRARY: list[dict[str, Any]] = [
    {
        "title": "FEMA disaster assistance",
        "url": "https://www.fema.gov/assistance",
        "keywords": {"fema", "help", "assistance", "recovery", "aid", "relief"},
        "fallback": "Overview of FEMA assistance, recovery steps, and survivor support after a disaster.",
    },
    {
        "title": "Ready.gov wildfires",
        "url": "https://www.ready.gov/wildfires",
        "keywords": {"wildfire", "fire", "smoke", "burn", "ash"},
        "fallback": "Wildfire preparation guidance covering evacuation, smoke safety, and post-fire cleanup.",
    },
    {
        "title": "Ready.gov evacuation",
        "url": "https://www.ready.gov/evacuation",
        "keywords": {"evacuat", "shelter", "route", "response", "exit", "unsafe"},
        "fallback": "Evacuation guidance for leaving quickly, planning routes, and staying informed.",
    },
]


@lru_cache(maxsize=1)
def get_damage_chatbot() -> Any:
    """Lazily import and instantiate the Gemini-backed DamageChatbot.

    Returns None if the SDK, the API key, or the evaluation CSV is unavailable —
    the /v1/chat endpoint then falls through to the deterministic stub.
    """
    if not settings.gemini_api_key:
        return None

    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))

    try:
        from damage_chatbot import DamageChatbot  # type: ignore[import-not-found]
    except Exception:
        return None

    import os

    os.environ.setdefault("GEMINI_API_KEY", settings.gemini_api_key)

    try:
        return DamageChatbot()
    except Exception:
        return None


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


@lru_cache(maxsize=1)
def evaluation_rows() -> list[dict[str, str]]:
    if not EVALUATION_CSV_PATH.exists():
        return []

    rows: list[dict[str, str]] = []
    with EVALUATION_CSV_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append({k: (v or "").strip() for k, v in row.items()})
    return rows


def build_evaluation_context(message: str) -> str | None:
    if not EVALUATION_QUERY_PATTERN.search(message):
        return None

    rows = evaluation_rows()
    if not rows:
        return "Evaluation data is not available on this server."

    severe = {"major-damage", "destroyed"}
    false_negatives: list[tuple[str, str, str]] = []
    false_positives: list[tuple[str, str, str]] = []

    for row in rows:
        uid = row.get("uid", "")
        true_label = row.get("true_label", "").lower()
        pred_label = row.get("gemini_label", "").lower()
        if not uid or not true_label or not pred_label:
            continue

        if true_label in severe and pred_label not in severe:
            false_negatives.append((uid, true_label, pred_label))
        if true_label not in severe and pred_label in severe:
            false_positives.append((uid, true_label, pred_label))

    fn_sample = false_negatives[:5]
    fp_sample = false_positives[:5]

    lines = [
        "Evaluation mismatch context (derived from evaluation_results.csv):",
        f"  False negatives (true severe, predicted not severe): {len(false_negatives)}",
        f"  False positives (true not severe, predicted severe): {len(false_positives)}",
    ]

    if fn_sample:
        lines.append("  Sample false-negative uids (true → predicted):")
        for uid, true_label, pred_label in fn_sample:
            lines.append(f"    - {uid} ({true_label} → {pred_label})")

    if fp_sample:
        lines.append("  Sample false-positive uids (true → predicted):")
        for uid, true_label, pred_label in fp_sample:
            lines.append(f"    - {uid} ({true_label} → {pred_label})")

    lines.append(
        "When asked for a specific example, pick a uid from the samples above."
    )

    return "\n".join(lines)


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


def is_disaster_related(message: str, building_id: str | None = None, spatial_context: SpatialContext | None = None) -> bool:
    if building_id or spatial_context is not None:
        return True
    return bool(DISASTER_QUERY_PATTERN.search(message))


async def build_reference_context(message: str) -> tuple[str | None, list[ReferenceSource]]:
    search_results = await _search_web(message)
    if search_results:
        sources: list[ReferenceSource] = []
        blocks: list[str] = []
        for result in search_results[: max(1, min(settings.search_result_limit, 6))]:
            url = result.get("url")
            if not url:
                continue
            title = result.get("title") or "Search result"
            summary = await _summarize_url(url, result.get("snippet"))
            sources.append(ReferenceSource(title=title, url=url, summary=summary))
            if summary:
                blocks.append(f"- {title} ({url}): {summary}")
            else:
                blocks.append(f"- {title} ({url})")

        if blocks:
            return "External disaster references:\n" + "\n".join(blocks), sources

    keywords = {token for token in re.findall(r"[a-z]+", message.lower()) if len(token) > 2}
    wants_fema = "fema" in keywords

    selected = [
        item
        for item in REFERENCE_LIBRARY
        if keywords.intersection(item["keywords"]) or (wants_fema and "fema" in item["title"].lower())
    ][:2]

    if not selected:
        selected = REFERENCE_LIBRARY[:1]

    sources: list[ReferenceSource] = []
    blocks: list[str] = []

    for item in selected:
        summary = await _summarize_url(item["url"], item.get("fallback"))
        if not summary:
            summary = item.get("fallback")

        sources.append(ReferenceSource(title=item["title"], url=item["url"], summary=summary))
        blocks.append(f"- {item['title']} ({item['url']}): {summary}")

    if not blocks:
        return None, []

    return "External disaster references:\n" + "\n".join(blocks), sources


def _summarize_external_html(html_text: str) -> str:
    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", html_text)
    title = html.unescape(title_match.group(1).strip()) if title_match else "External source"

    cleaned = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html_text)
    paragraphs = re.findall(r"(?is)<p[^>]*>(.*?)</p>", cleaned)
    snippets: list[str] = []

    for paragraph in paragraphs:
        text = re.sub(r"(?is)<[^>]+>", " ", paragraph)
        text = html.unescape(re.sub(r"\s+", " ", text)).strip()
        if len(text) >= 80:
            snippets.append(text)
        if len(snippets) == 2:
            break

    if not snippets:
        text = re.sub(r"(?is)<[^>]+>", " ", cleaned)
        text = html.unescape(re.sub(r"\s+", " ", text)).strip()
        snippets = [text[:220]] if text else []

    if not snippets:
        return title

    snippet = " ".join(snippets)
    if len(snippet) > 260:
        snippet = snippet[:257].rsplit(" ", 1)[0] + "..."
    return f"{title}: {snippet}"


def _friendly_chatbot_error(exc: Exception) -> str:
    raw = str(exc)
    payload = None
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            payload = ast.literal_eval(raw[start:end + 1])
        except Exception:
            payload = None

    if isinstance(payload, dict):
        err = payload.get("error", payload)
        if isinstance(err, dict):
            message = str(err.get("message", "")).strip()
            retry = None
            details = err.get("details") or []
            for detail in details:
                if isinstance(detail, dict) and str(detail.get("@type", "")).endswith("RetryInfo"):
                    retry = detail.get("retryDelay")
                    break

            if message:
                if retry:
                    return f"Rate limit reached. {message} Retry after {retry}."
                return f"Rate limit reached. {message}"

    if "RESOURCE_EXHAUSTED" in raw or "429" in raw:
        return (
            "Rate limit reached. Please wait a bit and try again. "
            "If this keeps happening, check your Gemini API quota."
        )

    return f"Chatbot error: {raw}"


def _now() -> float:
    return time.time()


def _cache_get(cache: dict[str, tuple[float, Any]], key: str, ttl_seconds: int) -> Any | None:
    entry = cache.get(key)
    if not entry:
        return None
    created_at, value = entry
    if _now() - created_at > ttl_seconds:
        cache.pop(key, None)
        return None
    return value


def _cache_set(cache: dict[str, tuple[float, Any]], key: str, value: Any) -> None:
    cache[key] = (_now(), value)


async def _search_web(message: str) -> list[dict[str, str | None]]:
    provider = (settings.search_provider or "").strip().lower()
    api_key = (settings.search_api_key or "").strip()
    query = message.strip()

    if not provider or provider == "none" or not api_key or not query:
        return []

    cached = _cache_get(search_cache, query, settings.search_cache_ttl_seconds)
    if cached is not None:
        return cached

    limit = max(1, min(settings.search_result_limit, 6))
    results: list[dict[str, str | None]] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider in {"bing", "bing-web", "bing_web"}:
                endpoint = settings.search_endpoint_url or "https://api.bing.microsoft.com/v7.0/search"
                response = await client.get(
                    endpoint,
                    params={"q": query, "count": limit, "mkt": "en-US", "safeSearch": "Moderate"},
                    headers={"Ocp-Apim-Subscription-Key": api_key},
                )
                response.raise_for_status()
                payload = response.json()
                for item in payload.get("webPages", {}).get("value", []):
                    results.append(
                        {
                            "title": item.get("name"),
                            "url": item.get("url"),
                            "snippet": item.get("snippet"),
                        }
                    )
            elif provider in {"serpapi", "serp"}:
                endpoint = settings.search_endpoint_url or "https://serpapi.com/search"
                response = await client.get(
                    endpoint,
                    params={"q": query, "engine": "google", "num": limit, "api_key": api_key},
                )
                response.raise_for_status()
                payload = response.json()
                for item in payload.get("organic_results", []):
                    results.append(
                        {
                            "title": item.get("title"),
                            "url": item.get("link"),
                            "snippet": item.get("snippet"),
                        }
                    )
            elif provider in {"brave", "brave-search", "brave_search"}:
                endpoint = settings.search_endpoint_url or "https://api.search.brave.com/res/v1/web/search"
                response = await client.get(
                    endpoint,
                    params={
                        "q": query,
                        "count": limit,
                        "search_lang": "en",
                        "country": "US",
                        "safesearch": "moderate",
                    },
                    headers={"X-Subscription-Token": api_key},
                )
                response.raise_for_status()
                payload = response.json()
                items = payload.get("web", {}).get("results", []) or payload.get("results", [])
                for item in items:
                    results.append(
                        {
                            "title": item.get("title") or item.get("name"),
                            "url": item.get("url") or item.get("link"),
                            "snippet": item.get("description") or item.get("snippet"),
                        }
                    )
    except Exception:
        results = []

    _cache_set(search_cache, query, results)
    return results


async def _summarize_url(url: str, fallback: str | None = None) -> str | None:
    cached = _cache_get(summary_cache, url, settings.search_summary_cache_ttl_seconds)
    if cached is not None:
        return cached

    summary: str | None = None
    if fallback and len(fallback) >= 80:
        summary = fallback
    else:
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                response = await client.get(url)
                response.raise_for_status()
                summary = _summarize_external_html(response.text)
        except Exception:
            summary = fallback

    if summary:
        _cache_set(summary_cache, url, summary)

    return summary


def _map_focus_from_building(context: BuildingContext | None) -> SpatialContext | None:
    if not context or not context.centroid:
        return None

    return SpatialContext(
        kind="building",
        center=SpatialCenter(lng=context.centroid["lon"], lat=context.centroid["lat"]),
        zoom=18,
        building_ids=[context.building_id],
        label=context.dataset_label,
    )


def _parse_vlm_response(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fenced:
        text = fenced.group(1).strip()
    return json.loads(text)


def _normalize_damage_label(raw_label: str) -> str:
    return VLM_TO_API_DAMAGE_CLASS.get(raw_label.strip().lower(), "un-classified")


def _require_vlm_dependencies() -> None:
    if Image is None or genai is None or types is None:
        raise HTTPException(status_code=503, detail="VLM evaluation dependencies are not installed")


async def _evaluate_damage_pair(pre_image: UploadFile, post_image: UploadFile) -> EvaluateResponse:
    _require_vlm_dependencies()

    api_key = settings.gemini_api_key or settings.model_api_key
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")

    try:
        pre_bytes = await pre_image.read()
        post_bytes = await post_image.read()
        pre = Image.open(io.BytesIO(pre_bytes))
        post = Image.open(io.BytesIO(post_bytes))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image upload: {exc}") from exc

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        temperature=0.3,
        system_instruction=[types.Part.from_text(text=EVALUATION_SYSTEM_PROMPT)],
    )

    chunks: list[str] = []
    try:
        for chunk in client.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=[pre, post],
            config=config,
        ):
            if chunk.text:
                chunks.append(chunk.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini evaluation failed: {exc}") from exc

    full_text = "".join(chunks)
    try:
        parsed = _parse_vlm_response(full_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not parse VLM response: {exc}") from exc

    damage_level = str(parsed.get("damage_level", "")).strip()
    return EvaluateResponse(
        model="gemini-2.5-flash",
        damage_class=_normalize_damage_label(damage_level),
        confidence=float(parsed.get("confidence_score", 0.0)),
        rationale=str(parsed.get("reasoning", "No rationale provided.")),
        raw=parsed,
    )


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


@app.post("/v1/evaluate", response_model=EvaluateResponse)
async def evaluate(
    pre_image: UploadFile = File(...),
    post_image: UploadFile = File(...),
) -> EvaluateResponse:
    return await _evaluate_damage_pair(pre_image, post_image)


def _try_get_context(building_id: str | None) -> BuildingContext | None:
    """Best-effort building context lookup.

    Returns None if building_id is unset or the local dataset isn't available
    — the chatbot doesn't need this context to answer dataset-level questions.
    """
    if not building_id:
        return None
    try:
        return get_building_context_or_404(building_id)
    except HTTPException:
        return None


async def _try_get_prediction(building_id: str | None) -> PredictResponse | None:
    if not building_id:
        return None
    try:
        return await predict_for_building(building_id)
    except HTTPException:
        return None


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    context = _try_get_context(req.building_id)
    prediction = await _try_get_prediction(req.building_id)
    spatial_focus = req.spatial_context or _map_focus_from_building(context)

    if not is_disaster_related(req.message, req.building_id, req.spatial_context):
        conversation_id = req.conversation_id or str(uuid.uuid4())
        history = _history(conversation_id)
        history.append(ChatMessage(role="user", content=req.message))

        assistant_text = (
            "I can only help with disaster-related questions, including building damage, "
            "VLM predictions, evacuation guidance, FEMA resources, and map-focused emergency analysis."
        )
        history.append(ChatMessage(role="assistant", content=assistant_text))

        return ChatResponse(
            conversation_id=conversation_id,
            building_id=req.building_id,
            response=assistant_text,
            prediction=prediction,
            map_focus=spatial_focus,
        )

    conversation_id = req.conversation_id or str(uuid.uuid4())
    history = _history(conversation_id)
    history.append(ChatMessage(role="user", content=req.message))

    bot = get_damage_chatbot()
    reference_context, sources = await build_reference_context(req.message)
    evaluation_context = build_evaluation_context(req.message)
    combined_context = "\n\n".join(
        part for part in [req.extra_context, reference_context, evaluation_context] if part
    )

    if settings.chat_endpoint_url:
        external = await request_external_json(
            settings.chat_endpoint_url,
            payload={
                "message": req.message,
                "conversation": [m.model_dump() for m in history],
                "building_context": context.model_dump() if context else None,
                "prediction": prediction.model_dump() if prediction else None,
                "spatial_context": req.spatial_context.model_dump() if req.spatial_context else None,
                "reference_context": reference_context,
                "evaluation_context": evaluation_context,
            },
        )
        assistant_text = str(external.get("response", "No response from chat model."))
    elif bot is not None:
        # Inject the selected building's UID so the chatbot's per-uid lookup
        # picks it up even when the user's message doesn't include it explicitly.
        if req.building_id:
            message_with_context = f"[Selected building uid: {req.building_id}]\n{req.message}"
        else:
            message_with_context = req.message
        try:
            assistant_text = bot.chat(
                message=message_with_context,
                session_id=conversation_id,
                extra_context=combined_context or None,
            )
        except Exception as exc:
            assistant_text = _friendly_chatbot_error(exc)
    else:
        # Final fallback when neither external chat nor the Gemini chatbot is configured.
        if prediction is not None:
            centroid = context.centroid if context else None
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
        else:
            assistant_text = (
                "Chat backend is not configured. Set GEMINI_API_KEY in backend/.env "
                "to enable the damage-assessment chatbot."
            )

    if sources:
        source_lines = "\n".join(f"- {source.title}: {source.url}" for source in sources)
        assistant_text = f"{assistant_text}\n\nSources consulted:\n{source_lines}"

    history.append(ChatMessage(role="assistant", content=assistant_text))

    return ChatResponse(
        conversation_id=conversation_id,
        building_id=req.building_id,
        response=assistant_text,
        prediction=prediction,
        map_focus=spatial_focus,
        sources=sources,
    )
