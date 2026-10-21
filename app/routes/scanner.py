from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Body
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
import shutil
import uuid
from datetime import datetime

from app.config import UPLOAD_DIR
from app.utils import save_base64_image
from app.ai_service import analyze_product_multi_angle, count_rack_boxes_ai
from app.database import insert_product

router = APIRouter(prefix="/api/scanner", tags=["Scanner"])

class AngleImageUpload(BaseModel):
    angle: str = Field(..., description="front, back, expiry, side")
    image_base64: str

class ProductAnalyzeRequest(BaseModel):
    angles: List[Dict[str, str]] = Field(..., description="List of {'angle': 'front', 'url': '/static/...', 'path': '...'}")

class RackCountRequest(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None

class TransferStockRequest(BaseModel):
    name: str
    brand: Optional[str] = ""
    category: Optional[str] = "General"
    barcode: Optional[str] = ""
    sku: Optional[str] = ""
    net_weight: Optional[str] = ""
    mrp: Optional[float] = 0.0
    cost_price: Optional[float] = 0.0
    quantity: int = 1
    min_stock_alert: Optional[int] = 5
    location: Optional[str] = "Main Shelf"
    manufacturing_date: Optional[str] = ""
    expiry_date: Optional[str] = ""
    batch_no: Optional[str] = ""
    primary_image: Optional[str] = ""
    angle_images: Optional[List[str]] = []
    rack_image: Optional[str] = ""
    rack_box_count: Optional[int] = 0
    ai_confidence: Optional[float] = 0.95
    ai_summary: Optional[str] = ""

@router.post("/upload-angle-base64")
async def upload_angle_base64(data: AngleImageUpload):
    try:
        url, filepath = save_base64_image(data.image_base64, prefix=f"angle_{data.angle}")
        return {
            "success": True,
            "angle": data.angle,
            "url": url,
            "path": str(filepath)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save angle photo: {str(e)}")

@router.post("/upload-angle-file")
async def upload_angle_file(
    angle: str = Form(...),
    file: UploadFile = File(...)
):
    try:
        filename = f"angle_{angle}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
        filepath = UPLOAD_DIR / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        url = f"/static/uploads/{filename}"
        return {
            "success": True,
            "angle": angle,
            "url": url,
            "path": str(filepath)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to upload angle file: {str(e)}")

@router.post("/analyze-product")
async def analyze_product(payload: ProductAnalyzeRequest):
    if not payload.angles:
        raise HTTPException(status_code=400, detail="No product angle photos provided for analysis.")

    # Resolve local paths
    processed_angles = []
    for item in payload.angles:
        url = item.get("url", "")
        path_str = item.get("path")
        if not path_str and url.startswith("/static/uploads/"):
            filename = url.replace("/static/uploads/", "")
            path_str = str(UPLOAD_DIR / filename)
        
        if path_str and Path(path_str).exists():
            processed_angles.append({
                "angle": item.get("angle", "angle"),
                "path": Path(path_str),
                "url": url
            })

    if not processed_angles:
        raise HTTPException(status_code=400, detail="Could not locate valid image files on server.")

    analysis = analyze_product_multi_angle(processed_angles)
    return {
        "success": True,
        "analysis": analysis,
        "angle_count": len(processed_angles)
    }

@router.post("/count-rack")
async def count_rack(payload: RackCountRequest):
    filepath = None
    image_url = None

    if payload.image_base64:
        image_url, filepath = save_base64_image(payload.image_base64, prefix="rack_raw")
    elif payload.image_url:
        image_url = payload.image_url
        if image_url.startswith("/static/uploads/"):
            filename = image_url.replace("/static/uploads/", "")
            filepath = UPLOAD_DIR / filename
        else:
            filepath = Path(image_url)

    if not filepath or not Path(filepath).exists():
        raise HTTPException(status_code=400, detail="Valid rack image is required.")

    result = count_rack_boxes_ai(Path(filepath))
    return {
        "success": True,
        "raw_image_url": image_url,
        "annotated_image_url": result["annotated_image_url"],
        "count": result["count"],
        "boxes": result["boxes"],
        "confidence": result["confidence"],
        "notes": result["notes"],
        "is_ai_live": result["is_ai_live"]
    }

@router.post("/upload-rack-file")
async def upload_rack_file(file: UploadFile = File(...)):
    try:
        filename = f"rack_raw_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
        filepath = UPLOAD_DIR / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        result = count_rack_boxes_ai(filepath)
        return {
            "success": True,
            "raw_image_url": f"/static/uploads/{filename}",
            "annotated_image_url": result["annotated_image_url"],
            "count": result["count"],
            "boxes": result["boxes"],
            "confidence": result["confidence"],
            "notes": result["notes"],
            "is_ai_live": result["is_ai_live"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Rack upload failed: {str(e)}")

@router.post("/transfer-to-stock")
async def transfer_to_stock(data: TransferStockRequest):
    try:
        product_dict = data.model_dump()
        product_id = insert_product(product_dict)
        return {
            "success": True,
            "message": f"Product '{data.name}' with {data.quantity} units successfully transferred to Stock Manager!",
            "product_id": product_id,
            "redirect_url": f"/inventory?highlight={product_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to transfer to stock: {str(e)}")
