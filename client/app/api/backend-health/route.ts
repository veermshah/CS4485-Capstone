import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:8000";

export async function GET() {
  const upstream = `${BACKEND_URL.replace(/\/+$/, "")}/health`;

  try {
    const response = await fetch(upstream, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, status: response.status },
        { status: 502 },
      );
    }

    const payload = await response.json().catch(() => ({}));
    return NextResponse.json({ ok: true, upstream: payload }, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: detail }, { status: 502 });
  }
}
