# To run this code you need to install the following dependencies:
# pip install google-genai pillow

import json
import os
import re

from PIL import Image
from google import genai
from google.genai import types

SYSTEM_PROMPT = """You are a specialized Disaster Assessment AI. Your objective is to perform automated, building-level structural damage analysis by comparing pre-disaster and post-disaster aerial imagery.

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
"building_id": "string",
"damage_level": "Undamaged" | "Damaged" | "Severely Damaged" | "Destroyed",
"confidence_score": float (0.0 to 1.0),
"reasoning": "A brief explanation (max 20 words) citing specific visual changes observed."
}"""


def _parse_vlm_response(raw_text: str) -> dict:
    text = raw_text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fenced:
        text = fenced.group(1).strip()
    return json.loads(text)


def generate(pre_disaster_path: str, post_disaster_path: str) -> dict:
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    pre_image = Image.open(pre_disaster_path)
    post_image = Image.open(post_disaster_path)

    model = "gemini-1.5-flash"
    contents = [pre_image, post_image]
    config = types.GenerateContentConfig(
        temperature=0.3,
        system_instruction=[types.Part.from_text(text=SYSTEM_PROMPT)],
    )

    chunks: list[str] = []
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=config,
    ):
        if chunk.text:
            chunks.append(chunk.text)

    full_text = "".join(chunks)

    try:
        return _parse_vlm_response(full_text)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError(
            f"Could not parse VLM response as JSON.\nRaw output:\n{full_text}"
        ) from exc


if __name__ == "__main__":
    pre_path = "santa-rosa-wildfire_00000119_pre_disaster.png"
    post_path = "santa-rosa-wildfire_00000119_post_disaster.png"
    result = generate(pre_path, post_path)
    print(json.dumps(result, indent=2))
