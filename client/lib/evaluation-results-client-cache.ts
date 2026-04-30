export type EvaluationResult = {
  uid: string;
  true_label: string;
  gemini_label: string;
  correct: boolean | null;
};

type EvaluationResultPayload = {
  by_uid: Record<string, EvaluationResult>;
};

let evaluationResultsPromise: Promise<EvaluationResultPayload | null> | null = null;

export function getEvaluationResults(): Promise<EvaluationResultPayload | null> {
  if (!evaluationResultsPromise) {
    evaluationResultsPromise = fetch("/api/evaluation-results", { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) {
          evaluationResultsPromise = null;
          return null;
        }
        return res.json() as Promise<EvaluationResultPayload>;
      })
      .catch(() => {
        evaluationResultsPromise = null;
        return null;
      });
  }

  return evaluationResultsPromise;
}
