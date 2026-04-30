/**
 * Proxies the dashboard chat to the Python backend's /v1/chat, which delegates
 * to damage_chatbot.py (Gemini + evaluation_results.csv).
 *
 * Set BACKEND_URL (server-side) or NEXT_PUBLIC_BACKEND_URL to point at the
 * FastAPI backend. Defaults to http://localhost:8000 for local development.
 */

import { NextResponse } from "next/server";
import { buildSpatialContext } from "@/lib/server/chat-spatial-context";

export const runtime = "nodejs";

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:8000";

type ChatRequestBody = {
  message?: string;
  building_id?: string | null;
  conversation_id?: string | null;
};

type SpatialFocus = {
  kind: string;
  center: { lng: number; lat: number } | null;
  zoom?: number | null;
  building_ids?: string[];
  label?: string | null;
};

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const upstream = `${BACKEND_URL.replace(/\/+$/, "")}/v1/chat`;

  // Pre-compute geographic context (hotspots, address proximity, etc.) from
  // the buildings GeoJSON the map already serves. Best-effort — if it fails,
  // we just send the message through without spatial context.
  let spatialContext: Awaited<ReturnType<typeof buildSpatialContext>> = null;
  try {
    const baseUrl = new URL(request.url).origin;
    spatialContext = await buildSpatialContext(message, baseUrl);
  } catch {
    spatialContext = null;
  }

  let response: Response;
  try {
    response = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        building_id: body.building_id ?? null,
        conversation_id: body.conversation_id ?? null,
        extra_context: spatialContext?.prompt ?? null,
        spatial_context: spatialContext?.focus ?? null,
      }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      {
        error: `Cannot reach chat backend at ${upstream}. Start the FastAPI server (uvicorn app.main:app --port 8000) or set BACKEND_URL. Detail: ${detail}`,
      },
      { status: 502 },
    );
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: `Backend returned non-JSON (HTTP ${response.status}): ${text.slice(0, 300)}` },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail =
      (parsed as { detail?: string; error?: string })?.detail ??
      (parsed as { detail?: string; error?: string })?.error ??
      `Chat backend failed (HTTP ${response.status})`;
    return NextResponse.json({ error: detail }, { status: response.status });
  }

  const payload = parsed as {
    conversation_id?: string;
    response?: string;
    map_focus?: SpatialFocus | null;
    sources?: Array<{ title?: string; url?: string; summary?: string | null }>;
  };

  return NextResponse.json({
    conversation_id: payload.conversation_id ?? "",
    response: payload.response ?? "",
    map_focus: payload.map_focus ?? spatialContext?.focus ?? null,
    sources: payload.sources ?? [],
  });
}
