"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEvaluationResults, type EvaluationResult } from "@/lib/evaluation-results-client-cache";

const CLASS_ORDER = ["no-damage", "minor-damage", "major-damage", "destroyed"];
const CLASS_SET = new Set(CLASS_ORDER);

type Metrics = {
  total: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  labels: string[];
  confusion: number[][];
};

function normalizeLabel(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

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

function computeMetrics(rows: EvaluationResult[]): Metrics {
  const displayRows = rows.filter((row) => normalizeLabel(row.true_label) && normalizeLabel(row.gemini_label));
  const classifiedRows = rows.filter((row) => {
    const trueLabel = normalizeLabel(row.true_label);
    const predLabel = normalizeLabel(row.gemini_label);
    return CLASS_SET.has(trueLabel) && CLASS_SET.has(predLabel);
  });
  const present = new Set<string>();

  displayRows.forEach((row) => {
    present.add(normalizeLabel(row.true_label));
    present.add(normalizeLabel(row.gemini_label));
  });

  const labels = CLASS_ORDER.filter((label) => present.has(label)).concat(
    Array.from(present).filter((label) => !CLASS_ORDER.includes(label)).sort(),
  );

  const indexByLabel = new Map(labels.map((label, index) => [label, index]));
  const confusion = labels.map(() => labels.map(() => 0));
  let correct = 0;

  displayRows.forEach((row) => {
    const trueLabel = normalizeLabel(row.true_label);
    const predLabel = normalizeLabel(row.gemini_label);
    const trueIndex = indexByLabel.get(trueLabel);
    const predIndex = indexByLabel.get(predLabel);
    if (trueIndex == null || predIndex == null) return;

    confusion[trueIndex][predIndex] += 1;
    if (CLASS_SET.has(trueLabel) && CLASS_SET.has(predLabel) && trueIndex === predIndex) correct += 1;
  });

  const supports = labels.map((_, i) => confusion[i].reduce((sum, value) => sum + value, 0));
  const predictedTotals = labels.map((_, j) =>
    confusion.reduce((sum, row) => sum + row[j], 0),
  );

  const total = rows.length;
  const classifiedTotal = classifiedRows.length;
  const perClassPrecision: number[] = [];
  const perClassRecall: number[] = [];
  const perClassF1: number[] = [];

  labels.forEach((_, i) => {
    if (!CLASS_SET.has(labels[i])) return;

    const tp = confusion[i][i];
    const fp = predictedTotals[i] - tp;
    const fn = supports[i] - tp;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    perClassPrecision.push(precision);
    perClassRecall.push(recall);
    perClassF1.push(f1);
  });

  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  return {
    total,
    accuracy: classifiedTotal ? correct / classifiedTotal : 0,
    precision: avg(perClassPrecision),
    recall: avg(perClassRecall),
    f1: avg(perClassF1),
    labels,
    confusion,
  };
}

export default function MetricsPage() {
  const [rows, setRows] = useState<EvaluationResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getEvaluationResults()
      .then((payload) => {
        if (cancelled) return;
        const values = payload ? Object.values(payload.by_uid) : [];
        setRows(values);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => computeMetrics(rows), [rows]);
  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const maxCell = useMemo(
    () => Math.max(1, ...metrics.confusion.flat()),
    [metrics.confusion],
  );
  const perClass = useMemo(
    () =>
      metrics.labels.map((label, i) => {
        const tp = metrics.confusion[i][i];
        const support = metrics.confusion[i].reduce((sum, value) => sum + value, 0);
        const predicted = metrics.confusion.reduce((sum, row) => sum + row[i], 0);
        const precision = predicted === 0 ? 0 : tp / predicted;
        const recall = support === 0 ? 0 : tp / support;
        const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
        return { label, support, precision, recall, f1 };
      }),
    [metrics],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
        <p className="text-sm text-muted-foreground">Loading evaluation metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Buildings</CardDescription>
            <CardTitle className="text-2xl">{metrics.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Accuracy</CardDescription>
            <CardTitle className="text-2xl">{formatPercent(metrics.accuracy)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Precision</CardDescription>
            <CardTitle className="text-2xl">{formatPercent(metrics.precision)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recall</CardDescription>
            <CardTitle className="text-2xl">{formatPercent(metrics.recall)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>F1</CardDescription>
            <CardTitle className="text-2xl">{formatPercent(metrics.f1)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Confusion Matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead colSpan={metrics.labels.length} className="text-center font-medium">
                  Gemini VLM Predictions
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead>FEMA Ground Truth</TableHead>
                {metrics.labels.map((label) => (
                  <TableHead key={label}>{prettifyLabel(label)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.labels.map((trueLabel, i) => (
                <TableRow key={trueLabel}>
                  <TableCell className="font-medium">{prettifyLabel(trueLabel)}</TableCell>
                  {metrics.confusion[i].map((value, j) => (
                    <TableCell
                      key={`${trueLabel}-${metrics.labels[j]}`}
                      className={i === j ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}
                      style={{
                        backgroundColor:
                          value > 0 ? `color-mix(in oklab, var(--muted) ${(value / maxCell) * 80}%, transparent)` : undefined,
                      }}
                    >
                      {value}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Class Metrics</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Support</TableHead>
                <TableHead>Precision</TableHead>
                <TableHead>Recall</TableHead>
                <TableHead>F1</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perClass.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{prettifyLabel(row.label)}</TableCell>
                  <TableCell>{row.support}</TableCell>
                  <TableCell>{formatPercent(row.precision)}</TableCell>
                  <TableCell>{formatPercent(row.recall)}</TableCell>
                  <TableCell>{formatPercent(row.f1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
