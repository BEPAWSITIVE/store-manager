from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from app.database import (
    get_all_products,
    get_product_by_id,
    create_invoice,
    get_invoices
)

router = APIRouter(prefix="/api/billing", tags=["Billing POS"])

class CartItem(BaseModel):
    product_id: int
    name: str
    quantity: int = Field(..., gt=0)
    price: float = Field(..., ge=0)
    total: float = Field(..., ge=0)
    barcode: Optional[str] = ""

class CheckoutRequest(BaseModel):
    customer_name: Optional[str] = "Walk-in Customer"
    customer_mobile: Optional[str] = ""
    items: List[CartItem]
    subtotal: float
    discount_amount: Optional[float] = 0.0
    tax_amount: Optional[float] = 0.0
    grand_total: float
    payment_mode: Optional[str] = "Cash"
    cashier_email: Optional[str] = "cashier@store.com"

@router.get("/products")
async def get_billing_products(
    search: Optional[str] = "",
    category: Optional[str] = ""
):
    """Fetches real-time products for billing POS."""
    products = get_all_products(search=search or "", category=category or "", sort_by="name_asc")
    return {
        "success": True,
        "count": len(products),
        "products": products
    }

@router.get("/lookup-barcode/{barcode}")
async def lookup_barcode(barcode: str):
    """Quick lookup by barcode for instant item addition to bill."""
    clean_code = barcode.strip()
    if not clean_code:
        raise HTTPException(status_code=400, detail="Barcode is required.")
    
    products = get_all_products(search=clean_code)
    # Check for exact match
    for p in products:
        if (p.get("barcode") or "").strip() == clean_code:
            return {"success": True, "product": p}
    
    if products:
        return {"success": True, "product": products[0]}
    
    raise HTTPException(status_code=404, detail=f"No product found with barcode {clean_code}")

@router.post("/checkout")
async def process_checkout(payload: CheckoutRequest):
    """Completes bill, deducts stock in Supabase / inventory, and creates invoice."""
    if not payload.items:
        raise HTTPException(status_code=400, detail="Bill must have at least one product.")

    # 1. Validate stock availability
    for item in payload.items:
        prod = get_product_by_id(item.product_id)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Product '{item.name}' (ID: {item.product_id}) not found.")
        available_qty = int(prod.get("quantity") or 0)
        if item.quantity > available_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for '{item.name}'. Requested: {item.quantity}, Available: {available_qty}"
            )

    # 2. Record invoice and deduct stock
    invoice_dict = payload.model_dump()
    # Normalize items to dicts
    invoice_dict["items"] = [item.model_dump() for item in payload.items]

    try:
        created_inv = create_invoice(invoice_dict)
        return {
            "success": True,
            "message": f"Bill {created_inv.get('invoice_number')} generated & inventory stock updated!",
            "invoice": created_inv
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Checkout failed: {str(e)}")

@router.get("/invoices")
async def list_invoices(limit: int = 30):
    """Lists recent invoices."""
    invoices = get_invoices(limit=limit)
    return {
        "success": True,
        "count": len(invoices),
        "invoices": invoices
    }
