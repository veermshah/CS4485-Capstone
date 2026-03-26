from google.cloud import storage
from pathlib import Path
from tqdm import tqdm

BUCKET_NAME = "images-metadata"   
CROPS_DIR   = Path("output/crops")
CSV_PATH    = Path("output/dataset_records.csv")

def upload_file(bucket, local_path, gcs_path):
    blob = bucket.blob(gcs_path)
    blob.upload_from_filename(str(local_path))

def main():
    client = storage.Client(project="firelens-489322")
    bucket = client.bucket(BUCKET_NAME)

    # Upload master CSV
    upload_file(bucket, CSV_PATH, "dataset_records.csv")
    print("Uploaded dataset_records.csv")

    # Upload all crop folders
    all_files = list(CROPS_DIR.rglob("*.*"))
    for f in tqdm(all_files, desc="Uploading crops"):
        # converts output/crops/uid/pre.png -> crops/uid/pre.png
        gcs_path = "crops/" + f.relative_to(CROPS_DIR).as_posix()
        upload_file(bucket, f, gcs_path)

    print(f"\nDone. {len(all_files)} files uploaded to gs://{BUCKET_NAME}/")

if __name__ == "__main__":
    main()