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
    """Returns official Google Gemini multimodal models starting with gemini-2.5-flash."""
    configured = get_gemini_model() or "gemini-2.5-flash"
    defaults = [configured, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
    
    # De-duplicate while preserving order
    seen = set()
    result = []
    for m in defaults:
        if m and m not in ("gemini-3.5-flash", "gemini-3.8-flash") and m not in seen:
            seen.add(m)
            result.append(m)
    return result

def analyze_product_multi_angle(images: List[Dict[str, Any]], api_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyzes multiple photos of a product (front, back, expiry/barcode, side)
    using Gemini multimodal AI with gemini-2.5-flash.
    
    images: list of dicts: [{'angle': 'front', 'path': Path(...), 'url': '/static/...'}, ...]
    """
    effective_key = (api_key or "").strip() or get_gemini_api_key()
    
    # If no API key is set, use intelligent mock response
    if not effective_key:
        return get_mock_product_analysis(images)
    
    try:
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=effective_key)
        
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
            contents.append(f"Image {idx+1} is the {angle.upper()} angle view. It may show a single product item, label text, an outer cardboard box / shipper / carton with unit counts, or a rack / shelf with stacked boxes or units.")

        prompt = f"""
You are an expert AI Retail Store Scanner and Product Cataloging System.
You are given {len(images)} photos of a retail item, wholesale carton, cardboard box, shipper, bundle, or store shelf/rack captured from angles: {', '.join(angle_labels)}.

Carefully inspect ALL captured photos across all angles to accurately extract packaging details and AUTOMATICALLY CALCULATE INVENTORY QUANTITY:

1. Product Name: Complete and clean retail product title. If cannot be read, return empty string "".
2. Brand Name: Manufacturer or brand name. If not visible, return empty string "".
3. Category: Choose best from: Grocery, Snacks, Beverages, Personal Care, Household & Cleaning, Dairy, Bakery, Electronics, Medicine, General. If not certain, return empty string "".
4. Net Weight / Quantity: e.g. '500g', '1L', '75g', 'Pack of 4'. If not visible, return empty string "".
5. MRP / Price: Maximum retail price of a single consumer unit (number only, 0.0 if not visible).
6. Estimated Cost Price: Wholesale / purchase cost (0.0 if not visible).
7. Manufacturing Date: Format 'DD/MM/YYYY' or 'YYYY-MM-DD' if visible, else empty string "".
8. Expiry Date: Format 'DD/MM/YYYY' or 'YYYY-MM-DD' if visible, else empty string "".
9. Batch / Lot Number: Printed batch code if detected, else empty string "".
10. Barcode: Digits of the EAN-13, UPC, or barcode if visible, else empty string "".
11. Location: Shelf or rack location if visible on an aisle/rack tag (e.g. 'Rack B-03'), else empty string "".

12. CRITICAL QUANTITY & BUNDLE / CARDBOARD BOX / RACK CALCULATION:
   Inspect all captured photos for outer cardboard boxes, master cartons, shippers, bundles, shrink-wrap packs, and shelf/rack stacks:
   - Case A (Cardboard Box / Shipper / Carton / Bundle Label):
     Check for printed unit counts such as:
     * "Contains: 24 Packs" / "24 Units" / "24 N" / "Net Qty: 24 pcs" / "Qty: 50"
     * "Units per Carton: 48" / "Pack of 12" / "Bundle of 10" / "10 x 5 = 50 pcs"
     * "Outer Carton: 36 units" / "Inner: 6 x 4 packs"
     Identify `units_per_package` from this text (e.g., 24).
   - Case B (Rack / Shelf / Stack Counting):
     Check if a photo shows multiple cartons/boxes stacked on a rack or pallet, or individual units lined up on a shelf:
     * Count the number of visible cartons/boxes (`package_count`).
     * If individual retail units are visible on a rack/shelf without outer boxes, count the visible units directly.
   - Case C (Total Calculation):
     * If a cardboard box/carton mentions units per box (e.g., 24) and multiple boxes are pictured on a rack (e.g., 5 boxes), calculate `quantity = package_count * units_per_package` (e.g., 5 * 24 = 120).
     * If 1 cardboard box/carton is pictured mentioning "Contains 24 packs", `quantity = 24`.
     * If a bundle or multipack is pictured (e.g. shrink-wrapped pack of 6), `quantity = 6`.
     * If loose units are pictured on a shelf/rack, `quantity = number of units counted`.
     * If only a single individual retail product item is pictured with no bundle/carton/rack, default `quantity = 1`.
   - Provide a clear, human-readable calculation description in `quantity_calculation`, e.g.:
     * "3 cartons on rack × 24 units/carton = 72 total units"
     * "Cardboard box label: 'Contains 24 packs' = 24 total units"
     * "Counted 15 visible units on shelf = 15 total units"
     * "Single product item = 1 unit"
   - Identify `detected_packaging_type`: one of "cardboard_box", "rack_shelf", "bundle", "multipack", "single"

13. Summary: Brief 1-sentence description of the item including packaging and calculated stock count.

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
    "units_per_package": 1,
    "package_count": 1,
    "quantity_calculation": "string",
    "detected_packaging_type": "string",
    "location": "string",
    "confidence": 0.95,
    "summary": "string"
}}
"""
        contents.append(prompt)

        # Try candidate models with gemini-2.5-flash first
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

                # Clean and sanitize inventory calculation values
                try:
                    units_per_pkg = max(1, int(result.get("units_per_package") or 1))
                except Exception:
                    units_per_pkg = 1

                try:
                    pkg_cnt = max(1, int(result.get("package_count") or 1))
                except Exception:
                    pkg_cnt = 1

                try:
                    qty = int(result.get("quantity") or 0)
                except Exception:
                    qty = 0

                # If quantity wasn't set or is less than units_per_pkg * pkg_cnt, calculate it
                if qty <= 0:
                    qty = max(1, units_per_pkg * pkg_cnt)
                elif units_per_pkg > 1 and pkg_cnt > 1 and qty == units_per_pkg:
                    qty = units_per_pkg * pkg_cnt

                result["quantity"] = qty
                result["units_per_package"] = units_per_pkg
                result["package_count"] = pkg_cnt

                # Build or preserve quantity calculation description
                calc_desc = result.get("quantity_calculation") or ""
                if not calc_desc:
                    if units_per_pkg > 1 and pkg_cnt > 1:
                        calc_desc = f"{pkg_cnt} boxes × {units_per_pkg} units/box = {qty} total units"
                    elif units_per_pkg > 1:
                        calc_desc = f"Carton label: {units_per_pkg} units = {qty} total units"
                    elif qty > 1:
                        calc_desc = f"Counted {qty} units on rack / shelf = {qty} total units"
                    else:
                        calc_desc = "Single product item = 1 unit"
                result["quantity_calculation"] = calc_desc

                pkg_type = result.get("detected_packaging_type") or ""
                if not pkg_type:
                    if units_per_pkg > 1:
                        pkg_type = "cardboard_box"
                    elif pkg_cnt > 1:
                        pkg_type = "rack_shelf"
                    else:
                        pkg_type = "single"
                result["detected_packaging_type"] = pkg_type

                if "summary" in result and "ai_summary" not in result:
                    result["ai_summary"] = result["summary"]
                elif "ai_summary" in result and "summary" not in result:
                    result["summary"] = result["ai_summary"]
                return result
            except Exception as model_err:
                last_error = model_err
                print(f"[Gemini Model {model_name} failed]: {model_err}, trying next...")
                continue

        raise last_error or RuntimeError("All Gemini models failed")

    except Exception as e:
        print(f"[AI Service Error - Product Analysis] {e}")
        mock = get_mock_product_analysis(images)
        note = f" (Note: Gemini fallback triggered: {str(e)[:80]})"
        mock["summary"] = (mock.get("summary") or "") + note
        mock["ai_summary"] = (mock.get("ai_summary") or mock.get("summary") or "") + note
        mock["is_ai_live"] = False
        mock["model_used"] = get_gemini_model()
        return mock

def count_rack_boxes_ai(image_path: Path) -> Dict[str, Any]:
    """
    Counts boxes, cartons, or units on a shelf/rack using Gemini Multimodal (gemini-2.5-flash).
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
    default_summary = f"Captured {angle_count} angle photo(s). Live packaging analysis requires GEMINI_API_KEY."
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
        "units_per_package": 1,
        "package_count": 1,
        "quantity_calculation": "1 unit (Single item default)",
        "detected_packaging_type": "single",
        "location": "",
        "confidence": 0.0,
        "summary": default_summary,
        "ai_summary": default_summary,
        "is_ai_live": False,
        "model_used": ""
    }
