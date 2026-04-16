import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

def run_final_analysis(csv_path):
    # Load consolidated results from csv
    try:
        df = pd.read_csv(csv_path)
    except FileNotFoundError:
        print(f"Error: {csv_path} not found. Ensure the CSV is in the correct directory.")
        return

    

if __name__ == "__main__":
    run_final_analysis('data/evaluation_results.csv')