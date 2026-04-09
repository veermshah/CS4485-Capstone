# pip install google-genai

import os
import re
import csv
import json
from PIL import Image
from google import genai
from google.genai import types


def generate(pre_disaster_path, post_disaster_path):
    client = genai.Client(
        api_key=os.environ.get("GEMINI_API_KEY"),
    )

    pre_image = Image.open(pre_disaster_path)
    post_image = Image.open(post_disaster_path)

    model = "gemini-2.5-flash"
    contents = [
        pre_image,
        post_image
    ]
    generate_content_config = types.GenerateContentConfig(
        temperature=0.3,
        system_instruction=[
            types.Part.from_text(text="""You are a specialized Disaster Assessment AI. Your objective is to perform automated, building-level structural damage analysis by comparing pre-disaster and post-disaster aerial imagery.

Task Guidelines:
1. Visual Comparison: Analyze the provided pair of image crops (Pre-disaster vs. Post-disaster) for a specific building footprint.
2. Damage Classification: You must classify the damage into exactly one of these four categories:
* Undamaged: No visible structural changes or impact.
* Damaged: Minor visible impact or surface damage.
* Severely Damaged: Significant structural compromise, partially collapsed, or major exterior loss.
* Destroyed: Complete structural loss or total collapse.
3. Environmental Context: Account for potential interference like smoke, shadows, or varying image quality.
4. Output Format: You must respond exclusively in valid JSON format. Do not include conversational text.

JSON Schema:
{
\"building_id\": \"string\",
\"damage_level\": \"no-damage\" | \"major-damage\" | \"destroyed\" | \"minor-damage\",
\"confidence_score\": float (0.0 to 1.0),
\"reasoning\": \"A brief explanation (max 20 words) citing specific visual changes observed.\"
}"""),
        ],
    )

    return_string = ""
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        return_string += str(chunk.text)
    
    return return_string


output_dir = "output"
crops_dir = os.path.join(output_dir, "crops")
csv_file = os.path.join(output_dir, "dataset_records.csv")
with open(csv_file, mode='r', encoding='utf-8') as f:
    csvreader = csv.reader(f)
    fields = next(f)

    counter = 0 # Just getting the first few for testing purposes
    correct = 0
    incorrect = 0
    for row in csvreader:
        uid = row[0]
        tile_id = row[1]
        bbox = row[2]
        label = row[3]

        uid_folder = os.path.join(crops_dir, uid)
        pre_image = os.path.join(uid_folder, os.listdir(uid_folder)[0])
        post_image = os.path.join(uid_folder, os.listdir(uid_folder)[1])

        try:
            gemini_result = generate(pre_image, post_image)
            gr_clean = re.sub(r'^```json\s*(.*?)\s*```$', r'\1', gemini_result, flags=re.DOTALL).strip()
            gr_dict = json.loads(gr_clean)
        except:
            print()
            print(correct)
            print(incorrect)
            print()
            print(gemini_result)
        gemini_label = gr_dict["damage_level"]
        if gemini_label == label:
            correct += 1
        else:
            incorrect += 1

        # Just getting the first few for testing purposes
        counter += 1
        if counter == 1000:
            break
    print(correct)
    print(incorrect)

