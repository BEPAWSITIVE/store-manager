import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
import requests

from app.config import (
    get_supabase_url,
    get_supabase_key,
    is_supabase_configured
)

def get_headers(prefer_return: bool = True) -> Dict[str, str]:
    key = get_supabase_key()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    if prefer_return:
        headers["Prefer"] = "return=representation"
    return headers

def test_supabase_connection() -> Tuple[bool, str]:
    if not is_supabase_configured():
        return False, "Supabase URL and API Key are not configured."
    url = get_supabase_url()
    try:
        # Check connection by querying products table or rest endpoint
        endpoint = f"{url}/rest/v1/products?select=id&limit=1"
        res = requests.get(endpoint, headers=get_headers(), timeout=5)
        if res.status_code in (200, 206):
            return True, "Supabase connected successfully!"
        elif res.status_code == 404 or "relation \"public.products\" does not exist" in res.text:
            return False, "Connected to Supabase, but the 'products' table is missing. Run the provided SQL setup script in Supabase SQL Editor."
        else:
            return False, f"Supabase responded with HTTP {res.status_code}: {res.text[:100]}"
    except Exception as e:
        return False, f"Connection failed: {str(e)}"

# -------------------------------------------------------------
# Products / Inventory Operations
# -------------------------------------------------------------

def sb_get_all_products(
    search: str = "",
    category: str = "",
    status: str = "",
    sort_by: str = "updated_at"
) -> List[Dict[str, Any]]:
    if not is_supabase_configured():
        return []

    url = get_supabase_url()
    params = ["select=*"]

    # Sorting parameter
    sort_mapping = {
        "updated_at": "updated_at.desc",
        "created_at": "created_at.desc",
        "name_asc": "name.asc",
        "quantity_asc": "quantity.asc",
        "quantity_desc": "quantity.desc",
        "expiry_asc": "expiry_date.asc",
        "mrp_desc": "mrp.desc"
    }
    order_param = sort_mapping.get(sort_by, "updated_at.desc")
    params.append(f"order={order_param}")

    if category and category.lower() != "all":
        params.append(f"category=eq.{category}")

    if status == "out_of_stock":
        params.append("quantity=lte.0")
    elif status == "low_stock":
        params.append("quantity=gt.0")

    query_str = "&".join(params)
    endpoint = f"{url}/rest/v1/products?{query_str}"

    try:
        res = requests.get(endpoint, headers=get_headers(), timeout=8)
        if res.status_code in (200, 206):
            products = res.json()
            
            # Post-filter search locally for clean cross-field matching
            if search:
                term = search.lower()
                products = [
                    p for p in products
                    if term in (p.get("name") or "").lower()
                    or term in (p.get("brand") or "").lower()
                    or term in (p.get("barcode") or "").lower()
                    or term in (p.get("sku") or "").lower()
                    or term in (p.get("location") or "").lower()
                ]

            # Handle status filters like low_stock against min_stock_alert
            if status == "low_stock":
                products = [
                    p for p in products
                    if (p.get("quantity") or 0) <= (p.get("min_stock_alert") or 5)
                    and (p.get("quantity") or 0) > 0
                ]
            elif status == "in_stock":
                products = [
                    p for p in products
                    if (p.get("quantity") or 0) > (p.get("min_stock_alert") or 5)
                ]

            # Normalize angle_images
            for p in products:
                if isinstance(p.get("angle_images"), str):
                    try:
                        p["angle_images"] = json.loads(p["angle_images"])
                    except Exception:
                        p["angle_images"] = []
                elif not p.get("angle_images"):
                    p["angle_images"] = []

            return products
        else:
            print(f"[Supabase get_all_products error] HTTP {res.status_code}: {res.text}")
            return []
    except Exception as e:
        print(f"[Supabase get_all_products exception] {e}")
        return []

def sb_get_product_by_id(product_id: int) -> Optional[Dict[str, Any]]:
    if not is_supabase_configured():
        return None
    url = get_supabase_url()
    endpoint = f"{url}/rest/v1/products?id=eq.{product_id}&select=*"
    try:
        res = requests.get(endpoint, headers=get_headers(), timeout=6)
        if res.status_code == 200:
            data = res.json()
            if data and len(data) > 0:
                p = data[0]
                if isinstance(p.get("angle_images"), str):
                    try:
                        p["angle_images"] = json.loads(p["angle_images"])
                    except Exception:
                        p["angle_images"] = []
                elif not p.get("angle_images"):
                    p["angle_images"] = []
                return p
        return None
    except Exception as e:
        print(f"[Supabase get_product_by_id exception] {e}")
        return None

def sb_insert_product(data: Dict[str, Any]) -> int:
    if not is_supabase_configured():
        return 0
    url = get_supabase_url()
    endpoint = f"{url}/rest/v1/products"

    now = datetime.utcnow().isoformat()
    angle_images = data.get("angle_images", [])
    if isinstance(angle_images, str):
        try:
            angle_images = json.loads(angle_images)
        except Exception:
            angle_images = []

    sku = data.get("sku")
    if not sku:
        brand_prefix = (data.get("brand", "SKU")[:3] or "SKU").upper()
        sku = f"{brand_prefix}-{uuid.uuid4().hex[:4].upper()}"

    payload = {
        "name": data.get("name", "Unnamed Product"),
        "brand": data.get("brand", ""),
        "category": data.get("category", "General"),
        "barcode": data.get("barcode", ""),
        "sku": sku,
        "net_weight": data.get("net_weight", ""),
        "mrp": float(data.get("mrp") or 0.0),
        "cost_price": float(data.get("cost_price") or 0.0),
        "quantity": int(data.get("quantity") or 0),
        "min_stock_alert": int(data.get("min_stock_alert") or 5),
        "location": data.get("location", "Default Shelf"),
        "manufacturing_date": data.get("manufacturing_date", ""),
        "expiry_date": data.get("expiry_date", ""),
        "batch_no": data.get("batch_no", ""),
        "primary_image": data.get("primary_image", ""),
        "angle_images": angle_images,
        "rack_image": data.get("rack_image", ""),
        "rack_box_count": int(data.get("rack_box_count") or 0),
        "ai_confidence": float(data.get("ai_confidence") or 0.95),
        "ai_summary": data.get("ai_summary", ""),
        "created_at": now,
        "updated_at": now
    }

    try:
        res = requests.post(endpoint, headers=get_headers(), json=payload, timeout=8)
        if res.status_code in (200, 201):
            created = res.json()
            if created and len(created) > 0:
                prod_id = created[0].get("id")
                # Log initial stock in stock_logs
                sb_log_stock_change(prod_id, payload["quantity"], 0, payload["quantity"], "Initial Scan Entry")
                return prod_id
        print(f"[Supabase insert_product error] HTTP {res.status_code}: {res.text}")
        return 0
    except Exception as e:
        print(f"[Supabase insert_product exception] {e}")
        return 0

def sb_update_product(product_id: int, data: Dict[str, Any]) -> bool:
    if not is_supabase_configured():
        return False
    url = get_supabase_url()
    endpoint = f"{url}/rest/v1/products?id=eq.{product_id}"

    payload = {}
    for key in [
        "name", "brand", "category", "barcode", "sku", "net_weight",
        "mrp", "cost_price", "quantity", "min_stock_alert", "location",
        "manufacturing_date", "expiry_date", "batch_no", "primary_image",
        "rack_image", "rack_box_count", "ai_summary"
    ]:
        if key in data:
            if key in ["mrp", "cost_price"]:
                payload[key] = float(data[key] or 0.0)
            elif key in ["quantity", "min_stock_alert", "rack_box_count"]:
                payload[key] = int(data[key] or 0)
            else:
                payload[key] = data[key]

    if "angle_images" in data:
        imgs = data["angle_images"]
        if isinstance(imgs, str):
            try:
                imgs = json.loads(imgs)
            except Exception:
                imgs = []
        payload["angle_images"] = imgs

    payload["updated_at"] = datetime.utcnow().isoformat()

    try:
        res = requests.patch(endpoint, headers=get_headers(), json=payload, timeout=8)
        return res.status_code in (200, 204)
    except Exception as e:
        print(f"[Supabase update_product exception] {e}")
        return False

def sb_delete_product(product_id: int) -> bool:
    if not is_supabase_configured():
        return False
    url = get_supabase_url()
    endpoint = f"{url}/rest/v1/products?id=eq.{product_id}"
    try:
        res = requests.delete(endpoint, headers=get_headers(), timeout=6)
        return res.status_code in (200, 204)
    except Exception as e:
        print(f"[Supabase delete_product exception] {e}")
        return False

def sb_adjust_stock(product_id: int, delta: int, reason: str = "Manual Adjustment") -> Optional[int]:
    curr = sb_get_product_by_id(product_id)
    if not curr:
        return None
    prev_qty = int(curr.get("quantity") or 0)
    new_qty = max(0, prev_qty + delta)

    success = sb_update_product(product_id, {"quantity": new_qty})
    if success:
        sb_log_stock_change(product_id, delta, prev_qty, new_qty, reason)
        return new_qty
    return None

def sb_log_stock_change(product_id: int, change_amount: int, prev_qty: int, new_qty: int, reason: str):
    if not is_supabase_configured():
        return
    url = get_supabase_url()
    endpoint = f"{url}/rest/v1/stock_logs"
    payload = {
        "product_id": product_id,
        "change_amount": change_amount,
        "previous_quantity": prev_qty,
        "new_quantity": new_qty,
        "reason": reason,
        "timestamp": datetime.utcnow().isoformat()
    }
    try:
        requests.post(endpoint, headers=get_headers(prefer_return=False), json=payload, timeout=5)
    except Exception:
        pass

# -------------------------------------------------------------
# Billing & Invoices Operations
# -------------------------------------------------------------

def sb_create_invoice(invoice_data: Dict[str, Any]) -> Dict[str, Any]:
    url = get_supabase_url()
    inv_num = invoice_data.get("invoice_number") or f"INV-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    
    payload = {
        "invoice_number": inv_num,
        "customer_name": invoice_data.get("customer_name") or "Walk-in Customer",
        "customer_mobile": invoice_data.get("customer_mobile") or "",
        "subtotal": float(invoice_data.get("subtotal") or 0.0),
        "discount_amount": float(invoice_data.get("discount_amount") or 0.0),
        "tax_amount": float(invoice_data.get("tax_amount") or 0.0),
        "grand_total": float(invoice_data.get("grand_total") or 0.0),
        "payment_mode": invoice_data.get("payment_mode") or "Cash",
        "items": invoice_data.get("items") or [],
        "cashier_email": invoice_data.get("cashier_email") or "cashier@store.com",
        "created_at": datetime.utcnow().isoformat()
    }

    # 1. Deduct stock for all purchased items
    for item in payload["items"]:
        p_id = item.get("product_id") or item.get("id")
        qty = int(item.get("quantity") or 1)
        if p_id:
            sb_adjust_stock(int(p_id), -qty, reason=f"Billed in {inv_num}")

    # 2. Insert invoice into Supabase
    if is_supabase_configured():
        endpoint = f"{url}/rest/v1/invoices"
        try:
            res = requests.post(endpoint, headers=get_headers(), json=payload, timeout=8)
            if res.status_code in (200, 201):
                rows = res.json()
                if rows:
                    return rows[0]
        except Exception as e:
            print(f"[Supabase create_invoice exception] {e}")

    return payload

def sb_get_invoices(limit: int = 50) -> List[Dict[str, Any]]:
    if not is_supabase_configured():
        return []
    url = get_supabase_url()
    endpoint = f"{url}/rest/v1/invoices?select=*&order=created_at.desc&limit={limit}"
    try:
        res = requests.get(endpoint, headers=get_headers(), timeout=8)
        if res.status_code in (200, 206):
            return res.json()
        return []
    except Exception as e:
        print(f"[Supabase get_invoices exception] {e}")
        return []

# -------------------------------------------------------------
# Supabase Auth Operations
# -------------------------------------------------------------

def sb_auth_login(email: str, password: str) -> Tuple[bool, Dict[str, Any], str]:
    """Authenticates against Supabase Auth API using password grant."""
    if not is_supabase_configured():
        return False, {}, "Supabase credentials not configured."
    url = get_supabase_url()
    endpoint = f"{url}/auth/v1/token?grant_type=password"
    payload = {
        "email": email.strip(),
        "password": password
    }
    headers = {
        "apikey": get_supabase_key(),
        "Content-Type": "application/json"
    }
    try:
        res = requests.post(endpoint, headers=headers, json=payload, timeout=8)
        data = res.json()
        if res.status_code == 200 and "access_token" in data:
            user = data.get("user", {})
            user_meta = user.get("user_metadata", {})
            role = user_meta.get("role")
            
            # Smart role inference from email if metadata not set
            if not role:
                email_lower = email.lower()
                if "cashier" in email_lower or "bill" in email_lower:
                    role = "billing"
                elif "manager" in email_lower or "store" in email_lower:
                    role = "manager"
                elif "admin" in email_lower:
                    role = "admin"
                else:
                    role = "manager"

            return True, {
                "access_token": data.get("access_token"),
                "email": user.get("email", email),
                "id": user.get("id"),
                "role": role,
                "name": user_meta.get("full_name") or email.split("@")[0].capitalize()
            }, "Login successful via Supabase Auth"
        else:
            err_msg = data.get("error_description") or data.get("msg") or data.get("message") or "Invalid credentials"
            return False, {}, err_msg
    except Exception as e:
        return False, {}, f"Supabase Auth error: {str(e)}"

def sb_auth_signup(email: str, password: str, role: str = "manager") -> Tuple[bool, Dict[str, Any], str]:
    """Registers a new staff account in Supabase Auth."""
    if not is_supabase_configured():
        return False, {}, "Supabase credentials not configured."
    url = get_supabase_url()
    endpoint = f"{url}/auth/v1/signup"
    payload = {
        "email": email.strip(),
        "password": password,
        "data": {
            "role": role,
            "full_name": email.split("@")[0].capitalize()
        }
    }
    headers = {
        "apikey": get_supabase_key(),
        "Content-Type": "application/json"
    }
    try:
        res = requests.post(endpoint, headers=headers, json=payload, timeout=8)
        data = res.json()
        if res.status_code in (200, 201):
            return True, data, "Account registered in Supabase Auth!"
        else:
            err = data.get("msg") or data.get("message") or "Signup failed"
            return False, {}, err
    except Exception as e:
        return False, {}, f"Signup error: {str(e)}"
