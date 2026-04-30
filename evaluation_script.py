import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

def run_final_analysis(csv_path):
    # Load consolidated results from csv
    try:
        df = pd.read_csv(csv_path)
    except FileNotFoundError:
        print(f"Error: {csv_path} not found. Ensure the CSV is in the correct directory.")
        return

    # 1. Clean Data: Handle the 12 'un-classified' labels
    clean_df = df[df['true_label'] != 'un-classified'].copy()
    unclassified_count = len(df) - len(clean_df)

    # 2. Overall Performance
    total = len(df)
    correct = df['correct'].sum()
    accuracy = (correct / total) * 100

    print("=== SANTA ROSA WILDFIRE: FINAL PERFORMANCE REPORT ===")
    print(f"Total Buildings Evaluated: {total}")
    print(f"Correct Classifications: {correct}")
    print(f"Final Accuracy: {accuracy:.2f}%")
    print(f"Note: Filtered {unclassified_count} 'un-classified' ground-truth labels for precision metrics.")

    # 3. Precision/Recall/F1 
    y_true = clean_df['true_label']
    y_pred = clean_df['gemini_label']
    
    # We prioritize F1-score due to the imbalanced nature of the fire data
    print("\n--- Detailed Classification Report ---")
    print(classification_report(y_true, y_pred, zero_division=0))

    # 4. Confusion Matrix 
    print("--- Confusion Matrix ---")
    print(confusion_matrix(y_true, y_pred))

if __name__ == "__main__":
    run_final_analysis('data/evaluation_results.csv')