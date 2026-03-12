# To run this code you need to install the following dependencies:
# pip install google-genai

import os
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
\"damage_level\": \"Undamaged\" | \"Damaged\" | \"Severely Damaged\" | \"Destroyed\",
\"confidence_score\": float (0.0 to 1.0),
\"reasoning\": \"A brief explanation (max 20 words) citing specific visual changes observed.\"
}"""),
        ],
    )

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        print(chunk.text, end="")

if __name__ == "__main__":
    PRE_PATH = "santa-rosa-wildfire_00000119_pre_disaster.png"
    POST_PATH = "santa-rosa-wildfire_00000119_post_disaster.png"
    generate(PRE_PATH, POST_PATH)