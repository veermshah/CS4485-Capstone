import { NextResponse } from "next/server";
import { getEvaluationRows } from "@/lib/server/remote-data";

const EVAL_CACHE_CONTROL = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400";

type EvaluationResult = {
  uid: string;
  true_label: string;
  gemini_label: string;
  correct: boolean | null;
};

let evaluationCache: string | null = null;

function parseBoolean(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

export async function GET() {
  if (evaluationCache) {
    return new NextResponse(evaluationCache, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": EVAL_CACHE_CONTROL,
      },
    });
  }

  const rows = await getEvaluationRows();
  const byUid: Record<string, EvaluationResult> = {};

  for (const row of rows) {
    const uid = row.uid?.trim();
    if (!uid) continue;

    byUid[uid] = {
      uid,
      true_label: row.true_label ?? "",
      gemini_label: row.gemini_label ?? "",
      correct: parseBoolean(row.correct),
    };
  }

  const payload = JSON.stringify({ by_uid: byUid });
  evaluationCache = payload;

  return new NextResponse(payload, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": EVAL_CACHE_CONTROL,
    },
  });
}
