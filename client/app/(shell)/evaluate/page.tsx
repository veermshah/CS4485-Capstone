/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type EvaluateResponse = {
  model: string;
  damage_class: string;
  confidence: number;
  rationale: string;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

function prettifyLabel(label: string): string {
  const formatted = label
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return formatted.toLowerCase() === "un classified" ? "Unclassified" : formatted;
}

export default function EvaluatePage() {
  const [preImage, setPreImage] = useState<File | null>(null);
  const [postImage, setPostImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateResponse | null>(null);

  const prePreview = useMemo(() => (preImage ? URL.createObjectURL(preImage) : null), [preImage]);
  const postPreview = useMemo(() => (postImage ? URL.createObjectURL(postImage) : null), [postImage]);

  const onEvaluate = async () => {
    if (!preImage || !postImage || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("pre_image", preImage);
    formData.append("post_image", postImage);

    try {
      const response = await fetch(`${BACKEND_URL}/v1/evaluate`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Evaluate API failed (${response.status})`);
      }

      const payload = (await response.json()) as EvaluateResponse;
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to evaluate images.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Evaluate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Pre-Disaster Image</p>
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => setPreImage(event.target.files?.[0] ?? null)}
              />
              {prePreview ? (
                <img src={prePreview} alt="Pre upload preview" className="h-48 w-full rounded-md border object-contain" />
              ) : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Post-Disaster Image</p>
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => setPostImage(event.target.files?.[0] ?? null)}
              />
              {postPreview ? (
                <img src={postPreview} alt="Post upload preview" className="h-48 w-full rounded-md border object-contain" />
              ) : null}
            </div>
          </div>

          <Button
            onClick={() => {
              void onEvaluate();
            }}
            disabled={!preImage || !postImage || loading}
          >
            {loading ? "Evaluating..." : "Run VLM Evaluation"}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-red-600 dark:text-red-400">{error}</CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Prediction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Predicted Label: </span>
              <span className="font-semibold">{prettifyLabel(result.damage_class)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Confidence: </span>
              <span>{(result.confidence * 100).toFixed(2)}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">Model: </span>
              <span>{result.model}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Rationale: </span>
              <span>{result.rationale}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
