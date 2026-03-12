"""
EVALUATION & METRICS MODULE - SANTA ROSA WILDFIRE SCOPE
Objective: Batch process disaster labels to calculate VLM accuracy.

Key Logic:
- Iterates through the Santa Rosa Wildfire dataset (148 files).
- Uses 'uid' to link FEMA ground truth to VLM predictions.
- Calculates F1-Score to handle class imbalance in fire damage assessments.
"""

import json
import os
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

def parse_fema_json(directory_path):
    """Aggregates all ground truth labels from the Santa Rosa event."""
    all_records = []
    for filename in os.listdir(directory_path):
        if filename.endswith("post_disaster.json"):
            with open(os.path.join(directory_path, filename), 'r') as f:
                data = json.load(f)
                for feature in data['features']['lng_lat']:
                    all_records.append({
                        'uid': feature['properties']['uid'],
                        'label_true': feature['properties'].get('subtype', 'no-damage')
                    })
    return pd.DataFrame(all_records)

def run_batch_evaluation(true_df, pred_df):
    """Computes final metrics for the entire disaster event."""
    # Ensures we only evaluate buildings where both a prediction and truth exist
    results = pd.merge(true_df, pred_df, on='uid')
    
    print(f"--- Santa Rosa Wildfire Performance Report ({len(results)} Buildings) ---")
    print(classification_report(results['label_true'], results['label_pred']))
    
    print("--- Damage Severity Confusion Matrix ---")
    print(confusion_matrix(results['label_true'], results['label_pred']))

if __name__ == "__main__":
    print("Evaluation module ready for batch processing of Santa Rosa dataset.")