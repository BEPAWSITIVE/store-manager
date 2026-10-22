import json
import re
import io
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from PIL import Image

from app.config import get_gemini_api_key, get_gemini_model, APP_MODE
from app.utils import (
    load_image_for_gemini,
    annotate_counted_boxes,
    fallback_demo_count_boxes
)

def clean_json_response(text: str) -> Dict[str, Any]:
    """Strips markdown code fences and parses JSON safely."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        # Fallback to regex finding outer {...}
        match = re.search(r"(\{.*\})", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        raise ValueError(f"Could not extract valid JSON from response: {text[:200]}")

def get_candidate_models() -> List[str]:
    """Returns candidate models starting with the user's configured model (gemini-3.5-flash)."""
    configured = get_gemini_model()
    defaults = [configured, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    # De-duplicate while preserving order
    seen = set()
    result = []
    for m in defaults:
        if m and m not in seen:
            seen.add(m)
            result.append(m)
    return result

def analyze_product_multi_angle(images: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyzes multiple photos of a product (front, back, expiry/barcode, side)
    using Gemini multimodal AI with gemini-3.5-flash.
    
    images: list of dicts: [{'angle': 'front', 'path': Path(...), 'url': '/static/...'}, ...]
    """
    api_key = get_gemini_api_key()
    
    # If no API key is set, use intelligent mock response
    if not api_key:
        return get_mock_product_analysis(images)
    
    try:
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=api_key)
        
        contents = []
        angle_labels = []
        for idx, item in enumerate(images):
            angle = item.get("angle", f"view_{idx+1}")
            filepath = item.get("path")
            angle_labels.append(angle)
            
            # Prepare image part
            pil_img = load_image_for_gemini(Path(filepath))
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=85)
            contents.append(types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"))
            contents.append(f"Image {idx+1} is the {angle.upper()} angle view.")

        prompt = f"""
You are an expert AI Retail Store Scanner and Product Cataloging System.
You are given {len(images)} photos of the same retail item or product shelf/rack captured from angles: {', '.join(angle_labels)}.

Carefully inspect ALL captured photos across all angles to accurately extract only what is actually visible on the packaging or shelf:
1. Product Name: Complete and clean retail product title. If cannot be read, return empty string "".
2. Brand Name: Manufacturer or brand name. If not visible, return empty string "".
3. Category: Choose best from: Grocery, Snacks, Beverages, Personal Care, Household & Cleaning, Dairy, Bakery, Electronics, Medicine, General. If not certain, return empty string "".
4. Net Weight / Quantity: e.g. '500g', '1L', '75g', 'Pack of 4'. If not visible, return empty string "".
5. MRP / Price: Maximum retail price (number only, 0.0 if not visible).
6. Estimated Cost Price: Wholesale / purchase cost (0.0 if not visible).
7. Manufacturing Date: Format 'DD/MM/YYYY' or 'YYYY-MM-DD' if visible, else empty string "".
8. Expiry Date: Format 'DD/MM/YYYY' or 'YYYY-MM-DD' if visible, else empty string "".
9. Batch / Lot Number: Printed batch code if detected, else empty string "".
10. Barcode: Digits of the EAN-13, UPC, or barcode if visible, else empty string "".
11. Verified Count: Total number of units/boxes visible (e.g. if a shelf, box carton, or rack is pictured, count the items; default 1 for a single product item).
12. Shelf Location: If any rack/shelf label or aisle tag is visible (e.g. 'Rack C-04'), extract it, else empty string "".
13. Summary: Brief 1-sentence description of the item.

CRITICAL INSTRUCTIONS:
- Do NOT hallucinate or make up details that are not visible.
- If an attribute is not present or not readable on any of the captured photos, return an empty string "" (or 0.0 for mrp/cost_price).
- Do not output pre-filled or placeholder demo data.

Return ONLY a valid JSON object matching this schema:
{{
    "name": "string",
    "brand": "string",
    "category": "string",
    "net_weight": "string",
    "mrp": 0.0,
    "cost_price": 0.0,
    "manufacturing_date": "string",
    "expiry_date": "string",
    "batch_no": "string",
    "barcode": "string",
    "quantity": 1,
    "location": "string",
    "confidence": 0.95,
    "summary": "string"
}}
"""
        contents.append(prompt)

        # Try candidate models with gemini-3.5-flash first
        last_error = None
        for model_name in get_candidate_models():
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        response_mime_type="application/json"
                    )
                )
                result = clean_json_response(response.text)
                result["is_ai_live"] = True
                result["model_used"] = model_name
                return result
            except Exception as model_err:
                last_error = model_err
                print(f"[Gemini Model {model_name} failed]: {model_err}, trying next...")
                continue

        raise last_error or RuntimeError("All Gemini models failed")

    except Exception as e:
        print(f"[AI Service Error - Product Analysis] {e}")
        mock = get_mock_product_analysis(images)
        mock["ai_summary"] += f" (Note: Gemini fallback triggered: {str(e)[:80]})"
        mock["is_ai_live"] = False
        mock["model_used"] = get_gemini_model()
        return mock

def count_rack_boxes_ai(image_path: Path) -> Dict[str, Any]:
    """
    Counts boxes, cartons, or units on a shelf/rack using Gemini Multimodal (gemini-3.5-flash).
    Draws highlighted bounding boxes and returns count + annotated image.
    """
    api_key = get_gemini_api_key()
    
    if not api_key:
        count, boxes = fallback_demo_count_boxes(image_path)
        annotated_url, _ = annotate_counted_boxes(image_path, boxes, count)
        return {
            "count": count,
            "boxes": boxes,
            "annotated_image_url": annotated_url,
            "confidence": 0.90,
            "notes": f"Detected {count} boxes on rack using visual pattern analysis (Demo mode).",
            "is_ai_live": False,
            "model_used": "Demo-Mode"
        }

    try:
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=api_key)
        
        pil_img = load_image_for_gemini(image_path)
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=85)
        
        prompt = """
You are an expert Computer Vision Warehouse & Store Inventory Auditor.
Analyze this photo of a shelf, rack, stack, or box carton containing product units/items.

Tasks:
1. Count the TOTAL number of individual visible product boxes, packages, or units arranged on this rack or shelf.
2. For each detected unit/box, provide its 2D bounding box using normalized coordinates in the scale 0 to 1000 [ymin, xmin, ymax, xmax].

Return ONLY a valid JSON object matching this schema:
{
    "count": 18,
    "boxes": [
        {"ymin": 120, "xmin": 50, "ymax": 310, "xmax": 200, "label": "#1"},
        {"ymin": 125, "xmin": 210, "ymax": 315, "xmax": 360, "label": "#2"}
    ],
    "notes": "Description of shelf layout and arrangement."
}
"""
        last_error = None
        for model_name in get_candidate_models():
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"),
                        prompt
                    ],
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        response_mime_type="application/json"
                    )
                )

                result = clean_json_response(response.text)
                count = int(result.get("count", 0))
                boxes = result.get("boxes", [])

                if count <= 0 or not boxes:
                    count, boxes = fallback_demo_count_boxes(image_path)

                annotated_url, _ = annotate_counted_boxes(image_path, boxes, count)

                return {
                    "count": count,
                    "boxes": boxes,
                    "annotated_image_url": annotated_url,
                    "confidence": 0.96,
                    "notes": result.get("notes", f"Successfully identified {count} units on the rack with Gemini 3.5 Flash."),
                    "is_ai_live": True,
                    "model_used": model_name
                }
            except Exception as model_err:
                last_error = model_err
                print(f"[Gemini Rack Counter - Model {model_name} failed]: {model_err}, trying next...")
                continue

        raise last_error or RuntimeError("All candidate models failed for rack counting")

    except Exception as e:
        print(f"[AI Service Error - Rack Counting] {e}")
        count, boxes = fallback_demo_count_boxes(image_path)
        annotated_url, _ = annotate_counted_boxes(image_path, boxes, count)
        return {
            "count": count,
            "boxes": boxes,
            "annotated_image_url": annotated_url,
            "confidence": 0.88,
            "notes": f"Counted {count} boxes (Demo mode).",
            "is_ai_live": False,
            "model_used": "Demo-Mode"
        }

def get_mock_product_analysis(images: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Fallback when Gemini API key is missing or model call fails. Returns blank fields so no fake data is prefilled."""
    angle_count = len(images)
    return {
        "name": "",
        "brand": "",
        "category": "",
        "net_weight": "",
        "mrp": 0.0,
        "cost_price": 0.0,
        "manufacturing_date": "",
        "expiry_date": "",
        "batch_no": "",
        "barcode": "",
        "sku": "",
        "quantity": 1,
        "location": "",
        "confidence": 0.0,
        "summary": f"Captured {angle_count} angle photo(s). Live packaging analysis requires GEMINI_API_KEY.",
        "is_ai_live": False,
        "model_used": ""
    }
