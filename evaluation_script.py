import json
import os

import pandas as pd
from sklearn.metrics import classification_report

# Maps VLM natural-language output (from main.py) to FEMA labels (from dataset_records.csv)
LABEL_MAPPING = {
    "Undamaged": "no-damage",
    "Damaged": "minor-damage",
    "Severely Damaged": "major-damage",
    "Destroyed": "destroyed",
}


def run_evaluation(csv_path: str, predictions_dir: str) -> dict:
    """Compare VLM predictions against ground-truth labels.

    Args:
        csv_path: Path to ``output/dataset_records.csv`` produced by the data pipeline.
        predictions_dir: Directory containing per-building JSON prediction files
            (each file must have ``building_id`` and ``damage_level`` keys).

    Returns:
        A dict with:
            ``buildings_evaluated`` – number of matched buildings,
            ``report`` – sklearn classification_report as a nested dict,
            ``report_text`` – human-readable classification report string.

    Raises:
        FileNotFoundError: if ``csv_path`` does not exist.
        ValueError: if no prediction files are found or no buildings can be matched.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Ground-truth CSV not found: {csv_path}")

    # 1. Load ground truth
    truth_df = pd.read_csv(csv_path)

    # 2. Load VLM predictions
    preds = []
    if os.path.isdir(predictions_dir):
        for fname in os.listdir(predictions_dir):
            if fname.endswith(".json"):
                fpath = os.path.join(predictions_dir, fname)
                try:
                    with open(fpath, encoding="utf-8") as fh:
                        data = json.load(fh)
                    preds.append({
                        "uid": data["building_id"],
                        "pred_label": LABEL_MAPPING.get(data.get("damage_level", ""), "unknown"),
                    })
                except (KeyError, json.JSONDecodeError):
                    continue

    if not preds:
        raise ValueError(f"No valid prediction files found in: {predictions_dir}")

    pred_df = pd.DataFrame(preds)

    # 3. Merge and compare
    final = pd.merge(truth_df, pred_df, on="uid")

    if final.empty:
        raise ValueError("No buildings matched between ground truth and predictions.")

    report_text = classification_report(final["label"], final["pred_label"])
    report_dict = classification_report(final["label"], final["pred_label"], output_dict=True)

    print(f"--- Evaluation Results for {len(final)} Buildings ---")
    print(report_text)

    return {
        "buildings_evaluated": len(final),
        "report": report_dict,
        "report_text": report_text,
    }


if __name__ == "__main__":
    run_evaluation("output/dataset_records.csv", "vlm_results/")