from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import csv
import io
import json

from app.database import (
    get_all_products,
    get_product_by_id,
    update_product,
    adjust_product_quantity,
    delete_product,
    get_inventory_stats
)

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])

class StockAdjustRequest(BaseModel):
    delta: int = Field(..., description="+1, -1, +10, etc.")
    reason: Optional[str] = "Manual Quick Adjust"

class ProductUpdateRequest(BaseModel):
    name: str
    brand: Optional[str] = ""
    category: Optional[str] = "General"
    barcode: Optional[str] = ""
    sku: Optional[str] = ""
    net_weight: Optional[str] = ""
    mrp: Optional[float] = 0.0
    cost_price: Optional[float] = 0.0
    quantity: int = 0
    min_stock_alert: Optional[int] = 5
    location: Optional[str] = "Default Shelf"
    manufacturing_date: Optional[str] = ""
    expiry_date: Optional[str] = ""
    batch_no: Optional[str] = ""

@router.get("")
async def list_inventory(
    search: str = Query("", description="Search by name, brand, barcode, SKU"),
    category: str = Query("", description="Category filter"),
    status: str = Query("", description="in_stock, low_stock, out_of_stock, expiring_soon, expired"),
    sort_by: str = Query("updated_at", description="updated_at, name_asc, quantity_desc, expiry_asc")
):
    products = get_all_products(search=search, category=category, status=status, sort_by=sort_by)
    return {
        "success": True,
        "count": len(products),
        "products": products
    }

@router.get("/stats")
async def inventory_stats():
    stats = get_inventory_stats()
    return {
        "success": True,
        "stats": stats
    }

@router.get("/{product_id}")
async def get_product(product_id: int):
    prod = get_product_by_id(product_id)
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "success": True,
        "product": prod
    }

@router.put("/{product_id}")
async def update_product_endpoint(product_id: int, data: ProductUpdateRequest):
    success = update_product(product_id, data.model_dump())
    if not success:
        raise HTTPException(status_code=404, detail="Product not found or update failed")
    return {
        "success": True,
        "message": "Product updated successfully"
    }

@router.post("/{product_id}/adjust-stock")
async def adjust_stock(product_id: int, payload: StockAdjustRequest):
    new_qty = adjust_product_quantity(product_id, payload.delta, payload.reason)
    if new_qty is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "success": True,
        "product_id": product_id,
        "new_quantity": new_qty,
        "delta": payload.delta
    }

@router.delete("/{product_id}")
async def delete_product_endpoint(product_id: int):
    success = delete_product(product_id)
    if not success:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "success": True,
        "message": "Product removed from inventory"
    }

@router.get("/export/csv")
async def export_csv():
    products = get_all_products()
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Product ID", "SKU", "Name", "Brand", "Category", "Barcode",
        "Quantity", "Min Stock Alert", "MRP", "Cost Price", "Shelf Location",
        "Expiry Date", "Batch No", "Net Weight", "Rack Box Count", "Last Updated"
    ])

    for p in products:
        writer.writerow([
            p["id"], p["sku"], p["name"], p["brand"], p["category"], p["barcode"],
            p["quantity"], p["min_stock_alert"], p["mrp"], p["cost_price"], p["location"],
            p["expiry_date"], p["batch_no"], p["net_weight"], p.get("rack_box_count", 0), p["updated_at"]
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=store_inventory_export.csv"}
    )

@router.get("/export/json")
async def export_json():
    products = get_all_products()
    return Response(
        content=json.dumps(products, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=store_inventory_export.json"}
    )
