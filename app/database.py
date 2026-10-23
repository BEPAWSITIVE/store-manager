import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from app.config import DB_PATH, is_supabase_configured
from app.supabase_client import (
    sb_get_all_products,
    sb_get_product_by_id,
    sb_insert_product,
    sb_update_product,
    sb_delete_product,
    sb_adjust_stock,
    sb_create_invoice,
    sb_get_invoices
)

def get_connection():
    try:
        if hasattr(DB_PATH, "parent") and DB_PATH.parent:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Products table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT,
        category TEXT DEFAULT 'General',
        barcode TEXT,
        sku TEXT,
        net_weight TEXT,
        mrp REAL DEFAULT 0.0,
        cost_price REAL DEFAULT 0.0,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_stock_alert INTEGER DEFAULT 5,
        location TEXT DEFAULT 'Default Shelf',
        manufacturing_date TEXT,
        expiry_date TEXT,
        batch_no TEXT,
        primary_image TEXT,
        angle_images TEXT DEFAULT '[]',
        rack_image TEXT,
        rack_box_count INTEGER DEFAULT 0,
        ai_confidence REAL DEFAULT 0.95,
        ai_summary TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Stock adjustment logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        change_amount INTEGER NOT NULL,
        previous_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        reason TEXT DEFAULT 'Adjustment',
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
    )
    """)

    # Invoices / Billing table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        customer_name TEXT DEFAULT 'Walk-in Customer',
        customer_mobile TEXT,
        subtotal REAL NOT NULL DEFAULT 0.0,
        discount_amount REAL DEFAULT 0.0,
        tax_amount REAL DEFAULT 0.0,
        grand_total REAL NOT NULL DEFAULT 0.0,
        payment_mode TEXT DEFAULT 'Cash',
        items TEXT NOT NULL DEFAULT '[]',
        cashier_email TEXT DEFAULT 'cashier@store.com',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()

    # Check if we should insert seed products if the table is empty
    cursor.execute("SELECT COUNT(*) FROM products")
    count = cursor.fetchone()[0]
    if count == 0:
        seed_sample_products(cursor)
        conn.commit()

    conn.close()

def seed_sample_products(cursor):
    samples = [
        {
            "name": "Ferrero Nutella Hazelnut Spread",
            "brand": "Ferrero",
            "category": "Breakfast & Spreads",
            "barcode": "8000500179862",
            "sku": "NUT-350G-01",
            "net_weight": "350g",
            "mrp": 395.0,
            "cost_price": 320.0,
            "quantity": 24,
            "min_stock_alert": 8,
            "location": "Rack A-02 (Aisle 3)",
            "manufacturing_date": "2026-03-15",
            "expiry_date": "2027-03-15",
            "batch_no": "FN-84920",
            "primary_image": "/static/uploads/sample_nutella_front.jpg",
            "angle_images": json.dumps(["/static/uploads/sample_nutella_front.jpg", "/static/uploads/sample_nutella_back.jpg"]),
            "rack_image": "/static/uploads/sample_rack_nutella.jpg",
            "rack_box_count": 24,
            "ai_confidence": 0.98,
            "ai_summary": "Nutella hazelnut spread with cocoa jar, 350g. Expiry March 2027. 24 units counted on shelf."
        },
        {
            "name": "Tata Tea Gold Royal Blend",
            "brand": "Tata Tea",
            "category": "Beverages",
            "barcode": "8901052002341",
            "sku": "TTG-500G-02",
            "net_weight": "500g",
            "mrp": 310.0,
            "cost_price": 255.0,
            "quantity": 16,
            "min_stock_alert": 6,
            "location": "Rack B-01 (Aisle 1)",
            "manufacturing_date": "2026-05-10",
            "expiry_date": "2027-05-10",
            "batch_no": "TT-67312",
            "primary_image": "/static/uploads/sample_tea_front.jpg",
            "angle_images": json.dumps(["/static/uploads/sample_tea_front.jpg"]),
            "rack_image": "",
            "rack_box_count": 16,
            "ai_confidence": 0.96,
            "ai_summary": "Tata Tea Gold 500g packet. High aroma tea granules with gently rolled leaves."
        },
        {
            "name": "Colgate Total Clean Mint Toothpaste",
            "brand": "Colgate",
            "category": "Personal Care",
            "barcode": "8901314502847",
            "sku": "COL-120G-03",
            "net_weight": "120g",
            "mrp": 140.0,
            "cost_price": 105.0,
            "quantity": 3,
            "min_stock_alert": 10,
            "location": "Rack C-04 (Counter Top)",
            "manufacturing_date": "2026-01-20",
            "expiry_date": "2026-11-20",
            "batch_no": "CG-99214",
            "primary_image": "/static/uploads/sample_colgate_front.jpg",
            "angle_images": json.dumps([]),
            "rack_image": "",
            "rack_box_count": 3,
            "ai_confidence": 0.97,
            "ai_summary": "Colgate Total 120g paste. Low stock alert triggered (3 remaining)."
        },
        {
            "name": "Dettol Original Germ Protection Handwash",
            "brand": "Dettol",
            "category": "Hygiene & Cleaning",
            "barcode": "8901396340120",
            "sku": "DET-200ML-04",
            "net_weight": "200ml",
            "mrp": 99.0,
            "cost_price": 75.0,
            "quantity": 32,
            "min_stock_alert": 12,
            "location": "Rack C-02 (Aisle 4)",
            "manufacturing_date": "2026-02-01",
            "expiry_date": "2028-02-01",
            "batch_no": "DT-11029",
            "primary_image": "/static/uploads/sample_dettol_front.jpg",
            "angle_images": json.dumps([]),
            "rack_image": "",
            "rack_box_count": 32,
            "ai_confidence": 0.99,
            "ai_summary": "Dettol liquid handwash pump bottle 200ml."
        }
    ]

    for p in samples:
        cursor.execute("""
        INSERT INTO products (
            name, brand, category, barcode, sku, net_weight, mrp, cost_price, 
            quantity, min_stock_alert, location, manufacturing_date, expiry_date, 
            batch_no, primary_image, angle_images, rack_image, rack_box_count, 
            ai_confidence, ai_summary
        ) VALUES (
            :name, :brand, :category, :barcode, :sku, :net_weight, :mrp, :cost_price,
            :quantity, :min_stock_alert, :location, :manufacturing_date, :expiry_date,
            :batch_no, :primary_image, :angle_images, :rack_image, :rack_box_count,
            :ai_confidence, :ai_summary
        )
        """, p)

def get_all_products(search: str = "", category: str = "", status: str = "", sort_by: str = "updated_at"):
    if is_supabase_configured():
        sb_prods = sb_get_all_products(search=search, category=category, status=status, sort_by=sort_by)
        if sb_prods is not None and len(sb_prods) > 0:
            return sb_prods

    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM products WHERE 1=1"
    params = []

    if search:
        query += " AND (name LIKE ? OR brand LIKE ? OR barcode LIKE ? OR sku LIKE ? OR location LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term, term, term])

    if category and category.lower() != "all":
        query += " AND category = ?"
        params.append(category)

    # Status filtering
    # 'low_stock': quantity <= min_stock_alert and quantity > 0
    # 'out_of_stock': quantity = 0
    # 'expiring_soon': expiry_date within 30 days
    # 'expired': expiry_date < today
    # Note: SQLite date comparison
    today = datetime.now().strftime("%Y-%m-%d")

    if status == "low_stock":
        query += " AND quantity <= min_stock_alert AND quantity > 0"
    elif status == "out_of_stock":
        query += " AND quantity <= 0"
    elif status == "expired":
        query += " AND expiry_date != '' AND expiry_date IS NOT NULL AND expiry_date < ?"
        params.append(today)
    elif status == "expiring_soon":
        query += """ AND expiry_date != '' AND expiry_date IS NOT NULL 
                     AND expiry_date >= ? 
                     AND expiry_date <= date(?, '+30 days')"""
        params.extend([today, today])
    elif status == "in_stock":
        query += " AND quantity > min_stock_alert"

    # Sorting
    valid_sorts = {
        "updated_at": "updated_at DESC",
        "created_at": "created_at DESC",
        "name_asc": "name ASC",
        "quantity_asc": "quantity ASC",
        "quantity_desc": "quantity DESC",
        "expiry_asc": "expiry_date ASC",
        "mrp_desc": "mrp DESC"
    }
    order_clause = valid_sorts.get(sort_by, "updated_at DESC")
    query += f" ORDER BY {order_clause}"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    products = []
    for r in rows:
        d = dict(r)
        try:
            d["angle_images"] = json.loads(d["angle_images"]) if d["angle_images"] else []
        except:
            d["angle_images"] = []
        products.append(d)
    return products

def get_product_by_id(product_id: int) -> Optional[Dict[str, Any]]:
    if is_supabase_configured():
        sb_prod = sb_get_product_by_id(product_id)
        if sb_prod:
            return sb_prod

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    try:
        d["angle_images"] = json.loads(d["angle_images"]) if d["angle_images"] else []
    except:
        d["angle_images"] = []
    return d

def insert_product(data: Dict[str, Any]) -> int:
    if is_supabase_configured():
        prod_id = sb_insert_product(data)
        if prod_id:
            return prod_id

    conn = get_connection()
    cursor = conn.cursor()

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    angle_images_json = json.dumps(data.get("angle_images", []))

    # Auto generate SKU if empty
    sku = data.get("sku")
    if not sku:
        brand_prefix = (data.get("brand", "SKU")[:3] or "SKU").upper()
        cursor.execute("SELECT MAX(id) FROM products")
        max_id = (cursor.fetchone()[0] or 0) + 1
        sku = f"{brand_prefix}-{max_id:04d}"

    cursor.execute("""
    INSERT INTO products (
        name, brand, category, barcode, sku, net_weight, mrp, cost_price,
        quantity, min_stock_alert, location, manufacturing_date, expiry_date,
        batch_no, primary_image, angle_images, rack_image, rack_box_count,
        ai_confidence, ai_summary, created_at, updated_at
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
    )
    """, (
        data.get("name", "Unnamed Product"),
        data.get("brand", ""),
        data.get("category", "General"),
        data.get("barcode", ""),
        sku,
        data.get("net_weight", ""),
        float(data.get("mrp") or 0.0),
        float(data.get("cost_price") or 0.0),
        int(data.get("quantity") or 0),
        int(data.get("min_stock_alert") or 5),
        data.get("location", "Default Shelf"),
        data.get("manufacturing_date", ""),
        data.get("expiry_date", ""),
        data.get("batch_no", ""),
        data.get("primary_image", ""),
        angle_images_json,
        data.get("rack_image", ""),
        int(data.get("rack_box_count") or 0),
        float(data.get("ai_confidence") or 0.95),
        data.get("ai_summary", ""),
        now,
        now
    ))

    product_id = cursor.lastrowid

    # Log initial stock
    cursor.execute("""
    INSERT INTO stock_logs (product_id, change_amount, previous_quantity, new_quantity, reason, timestamp)
    VALUES (?, ?, 0, ?, 'Initial Scan & Stock Entry', ?)
    """, (product_id, int(data.get("quantity") or 0), int(data.get("quantity") or 0), now))

    conn.commit()
    conn.close()
    return product_id

def update_product(product_id: int, data: Dict[str, Any]) -> bool:
    if is_supabase_configured():
        return sb_update_product(product_id, data)

    conn = get_connection()
    cursor = conn.cursor()

    # Get current for logging quantity change if any
    cursor.execute("SELECT quantity FROM products WHERE id = ?", (product_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    
    prev_qty = row["quantity"]
    new_qty = int(data.get("quantity", prev_qty))
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
    UPDATE products SET
        name = ?,
        brand = ?,
        category = ?,
        barcode = ?,
        sku = ?,
        net_weight = ?,
        mrp = ?,
        cost_price = ?,
        quantity = ?,
        min_stock_alert = ?,
        location = ?,
        manufacturing_date = ?,
        expiry_date = ?,
        batch_no = ?,
        updated_at = ?
    WHERE id = ?
    """, (
        data.get("name"),
        data.get("brand"),
        data.get("category"),
        data.get("barcode"),
        data.get("sku"),
        data.get("net_weight"),
        float(data.get("mrp") or 0.0),
        float(data.get("cost_price") or 0.0),
        new_qty,
        int(data.get("min_stock_alert") or 5),
        data.get("location"),
        data.get("manufacturing_date"),
        data.get("expiry_date"),
        data.get("batch_no"),
        now,
        product_id
    ))

    if prev_qty != new_qty:
        cursor.execute("""
        INSERT INTO stock_logs (product_id, change_amount, previous_quantity, new_quantity, reason, timestamp)
        VALUES (?, ?, ?, ?, 'Manual Update', ?)
        """, (product_id, new_qty - prev_qty, prev_qty, new_qty, now))

    conn.commit()
    conn.close()
    return True

def adjust_product_quantity(product_id: int, delta: int, reason: str = "Quick Stock Adjust") -> Optional[int]:
    if is_supabase_configured():
        res = sb_adjust_stock(product_id, delta, reason=reason)
        if res is not None:
            return res

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT quantity FROM products WHERE id = ?", (product_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    prev_qty = row["quantity"]
    new_qty = max(0, prev_qty + delta)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?", (new_qty, now, product_id))
    cursor.execute("""
    INSERT INTO stock_logs (product_id, change_amount, previous_quantity, new_quantity, reason, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (product_id, new_qty - prev_qty, prev_qty, new_qty, reason, now))

    conn.commit()
    conn.close()
    return new_qty

def delete_product(product_id: int) -> bool:
    if is_supabase_configured():
        return sb_delete_product(product_id)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
    cursor.execute("DELETE FROM stock_logs WHERE product_id = ?", (product_id,))
    conn.commit()
    conn.close()
    return True

def create_invoice(invoice_data: Dict[str, Any]) -> Dict[str, Any]:
    if is_supabase_configured():
        return sb_create_invoice(invoice_data)
    
    conn = get_connection()
    cursor = conn.cursor()
    inv_num = invoice_data.get("invoice_number") or f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    items = invoice_data.get("items") or []
    items_json = json.dumps(items)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Deduct stock for all purchased items
    for item in items:
        p_id = item.get("product_id") or item.get("id")
        qty = int(item.get("quantity") or 1)
        if p_id:
            adjust_product_quantity(int(p_id), -qty, reason=f"Billed in {inv_num}")

    cursor.execute("""
    INSERT INTO invoices (
        invoice_number, customer_name, customer_mobile, subtotal, discount_amount,
        tax_amount, grand_total, payment_mode, items, cashier_email, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        inv_num,
        invoice_data.get("customer_name") or "Walk-in Customer",
        invoice_data.get("customer_mobile") or "",
        float(invoice_data.get("subtotal") or 0.0),
        float(invoice_data.get("discount_amount") or 0.0),
        float(invoice_data.get("tax_amount") or 0.0),
        float(invoice_data.get("grand_total") or 0.0),
        invoice_data.get("payment_mode") or "Cash",
        items_json,
        invoice_data.get("cashier_email") or "cashier@store.com",
        now
    ))
    conn.commit()
    conn.close()

    invoice_data["invoice_number"] = inv_num
    invoice_data["created_at"] = now
    return invoice_data

def get_invoices(limit: int = 50) -> List[Dict[str, Any]]:
    if is_supabase_configured():
        return sb_get_invoices(limit=limit)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    invoices = []
    for r in rows:
        d = dict(r)
        try:
            d["items"] = json.loads(d["items"])
        except Exception:
            d["items"] = []
        invoices.append(d)
    return invoices

def sync_local_to_supabase() -> Tuple[int, str]:
    """Syncs existing SQLite products to Supabase so cloud database has the catalog."""
    if not is_supabase_configured():
        return 0, "Supabase is not configured."
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM products")
    rows = cursor.fetchall()
    conn.close()
    synced = 0
    for r in rows:
        p = dict(r)
        try:
            p["angle_images"] = json.loads(p["angle_images"]) if p["angle_images"] else []
        except:
            p["angle_images"] = []
        res = sb_insert_product(p)
        if res:
            synced += 1
    return synced, f"Synced {synced} products to Supabase successfully."

def get_inventory_stats() -> Dict[str, Any]:
    if is_supabase_configured():
        prods = get_all_products()
        total_skus = len(prods)
        total_units = sum(int(p.get("quantity") or 0) for p in prods)
        total_value = sum(float(p.get("mrp") or 0.0) * int(p.get("quantity") or 0) for p in prods)
        low_stock = sum(1 for p in prods if 0 < int(p.get("quantity") or 0) <= int(p.get("min_stock_alert") or 5))
        out_of_stock = sum(1 for p in prods if int(p.get("quantity") or 0) <= 0)
        categories = sorted(list(set(p.get("category") for p in prods if p.get("category"))))
        return {
            "total_skus": total_skus,
            "total_units": total_units,
            "total_value": round(total_value, 2),
            "low_stock_count": low_stock,
            "out_of_stock_count": out_of_stock,
            "expiring_soon_count": 0,
            "expired_count": 0,
            "categories": categories
        }

    conn = get_connection()
    cursor = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    cursor.execute("SELECT COUNT(*), COALESCE(SUM(quantity), 0), COALESCE(SUM(mrp * quantity), 0) FROM products")
    row = cursor.fetchone()
    total_skus = row[0] or 0
    total_units = row[1] or 0
    total_value = row[2] or 0.0

    cursor.execute("SELECT COUNT(*) FROM products WHERE quantity <= min_stock_alert AND quantity > 0")
    low_stock_count = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COUNT(*) FROM products WHERE quantity = 0")
    out_of_stock_count = cursor.fetchone()[0] or 0

    cursor.execute("""
    SELECT COUNT(*) FROM products 
    WHERE expiry_date != '' AND expiry_date IS NOT NULL 
    AND expiry_date >= ? AND expiry_date <= date(?, '+30 days')
    """, (today, today))
    expiring_soon_count = cursor.fetchone()[0] or 0

    cursor.execute("""
    SELECT COUNT(*) FROM products 
    WHERE expiry_date != '' AND expiry_date IS NOT NULL AND expiry_date < ?
    """, (today,))
    expired_count = cursor.fetchone()[0] or 0

    cursor.execute("SELECT DISTINCT category FROM products WHERE category != '' ORDER BY category ASC")
    categories = [r[0] for r in cursor.fetchall()]

    conn.close()
    return {
        "total_skus": total_skus,
        "total_units": total_units,
        "total_value": round(total_value, 2),
        "low_stock_count": low_stock_count,
        "out_of_stock_count": out_of_stock_count,
        "expiring_soon_count": expiring_soon_count,
        "expired_count": expired_count,
        "categories": categories
    }
