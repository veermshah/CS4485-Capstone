import pandas as pd
import json
import os
from sklearn.metrics import classification_report, confusion_matrix

# This maps the VLM's natural language output to the FEMA labels in the CSV
# VLM Output (from main.py) -> FEMA Label (from dataset_records.csv)
LABEL_MAPPING = {
    "Undamaged": "no-damage",
    "Damaged": "minor-damage",
    "Severely Damaged": "major-damage",
    "Destroyed": "destroyed"
}

def run_evaluation(csv_path, predictions_dir):
    # 1. Load the Ground Truth from the pipeline's master CSV
    truth_df = pd.read_csv(csv_path)
    
    # 2. Load the VLM results from the output folder
    preds = []
    for f in os.listdir(predictions_dir):
        if f.endswith(".json"):
            with open(os.path.join(predictions_dir, f)) as j:
                data = json.load(j)
                preds.append({
                    "uid": data["building_id"],
                    "pred_label": LABEL_MAPPING.get(data["damage_level"], "unknown")
                })
    
    pred_df = pd.DataFrame(preds)
    
    # 3. Merge and Compare
    final = pd.merge(truth_df, pred_df, on="uid")
    
    print(f"--- Evaluation Results for {len(final)} Buildings ---")
    print(classification_report(final['label'], final['pred_label']))

if __name__ == "__main__":
    # Point these to the actual output paths from your team's pipeline
    run_evaluation("output/dataset_records.csv", "vlm_results/")