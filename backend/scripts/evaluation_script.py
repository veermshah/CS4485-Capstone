from pathlib import Path

import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix


def run_final_analysis(csv_path: str) -> None:
    try:
        df = pd.read_csv(csv_path)
    except FileNotFoundError:
        print(f"Error: {csv_path} not found. Ensure the CSV is in the correct directory.")
        return

    clean_df = df[df["true_label"] != "un-classified"].copy()
    unclassified_count = len(df) - len(clean_df)

    total = len(df)
    correct = df["correct"].sum()
    accuracy = (correct / total) * 100 if total else 0

    print("=== SANTA ROSA WILDFIRE: FINAL PERFORMANCE REPORT ===")
    print(f"Total Buildings Evaluated: {total}")
    print(f"Correct Classifications: {correct}")
    print(f"Final Accuracy: {accuracy:.2f}%")
    print(
        "Note: Filtered "
        f"{unclassified_count} 'un-classified' ground-truth labels for precision metrics."
    )

    y_true = clean_df["true_label"]
    y_pred = clean_df["gemini_label"]

    print("\n--- Detailed Classification Report ---")
    print(classification_report(y_true, y_pred, zero_division=0))

    print("--- Confusion Matrix ---")
    print(confusion_matrix(y_true, y_pred))


if __name__ == "__main__":
    default_csv = Path(__file__).resolve().parents[1] / "evaluation_results.csv"
    run_final_analysis(str(default_csv))
