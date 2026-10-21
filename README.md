# StoreScan AI - Smart Store & Stock Manager

A retail store manager web application powered by **Multimodal AI Vision**. It features an interactive **camera viewfinder with an alignment guide box ("empty box on front")** that allows store operators to snap product packaging from multiple angles, automatically analyzes product details (Brand, Product Name, Expiry Date, MRP, Batch No, Barcode), counts boxes on racks/shelves from photos, and seamlessly transfers records into a live **Stock Manager** dashboard.

---

## Key Features

1. **Empty Box Viewfinder (Multi-Angle Camera)**
   - Centered alignment target box ("empty box on front") with glowing corner brackets, animated laser scanning bar, and center crosshairs.
   - Guide overlays with aspect ratio options: **Square (1:1)**, **Bottle / Pouch (Tall 3:4)**, or **Wide Box (4:3)**.
   - Dedicated slots for 4 key angles:
     - **Angle 1 - Front View**: Brand, Product Name, Net Weight.
     - **Angle 2 - Back View**: Ingredients, Manufacturer, Nutritional Information.
     - **Angle 3 - Expiry & Barcode**: Manufacturing date, Expiry date, Batch/Lot No., Barcode digits, Printed MRP.
     - **Angle 4 - Side / Extra**: Secondary angles or carton sides.
   - Camera controls: Flip front/rear camera, shutter button with flash & sound effects, or local image upload fallback.

2. **Multimodal AI Product Analysis**
   - Combines multiple angle photos into a single multimodal prompt sent to **Google Gemini 3.5 Flash**.
   - Higher rate limits and fast visual recognition for high-volume scanning.
   - Extracts structured inventory metadata:
     - Product Name & Brand
     - Category (Grocery, Snacks, Beverages, Personal Care, Dairy, Medicine, etc.)
     - Expiry Date (with standardized YYYY-MM-DD or MM/YYYY format)
     - Manufacturing Date & Batch/Lot Number
     - Barcode / EAN / UPC
     - Printed MRP and estimated wholesale cost
     - Confidence score & packaging summary
   - Real-time editable verification form before committing to database.

3. **Rack & Box Quantity Counter**
   - Take or upload a photo of a shelf, rack, carton, or stack containing multiple boxes/units of the product.
   - AI / Computer Vision detects every individual box or package.
   - Renders **numbered bounding boxes** (`Box #1`, `Box #2`, `Box #3`, ... `Box #N`) directly onto the photo.
   - Automatically calculates total quantity with one-click manual fine-tuning steppers (+ / -).

4. **Instant Transfer to Stock Manager**
   - One-click transfer from scanner into the SQLite stock management database.
   - Assigns rack/shelf locations (e.g. `Rack A-02 (Aisle 3)`).
   - Generates or preserves unique SKUs and barcodes.

5. **Available Stock Manager Dashboard**
   - Real-time stock inventory table with thumbnails, brand, category, and location.
   - Visual Expiry countdown badges:
     - **Green**: Safe (> 30 days)
     - **Amber / Orange**: Expiring soon (< 30 days)
     - **Red**: Expired
   - Live KPI summary cards: Total Units, Active SKUs, Low Stock alerts, Expiring Soon, Total Valuation in ₹.
   - Instant inline `+` and `-` quantity steppers (persists directly to database).
   - Multi-Angle Photo Carousel: View all captured product angle photos and the annotated rack counter image.
   - Search by name, brand, barcode, SKU, or location.
   - Filter by Category, Stock Status (In Stock, Low Stock, Expiring Soon, Expired, Out of Stock).
   - Export to CSV, JSON, or print-ready Inventory Audit Sheet.

---

## Quick Start Guide

### 1. Run the Application
Open a terminal in the project directory:
```bash
cd C:\Users\Deepak\.gemini\antigravity\scratch\smart-store-manager
python run.py
```

Open your browser at:
- **Scanner (Camera Viewfinder & Box Counter):** [http://127.0.0.1:8000/scanner](http://127.0.0.1:8000/scanner)
- **Stock Manager (Available Inventory):** [http://127.0.0.1:8000/inventory](http://127.0.0.1:8000/inventory)

### 2. Configure Google Gemini API Key (Optional)
The application works immediately in **Demo Mode** with realistic simulations and OpenCV contour counting. To enable live multimodal recognition:
1. Click the **API Key / Mode Status** button in the top-right corner of the webapp.
2. Enter your Gemini API key (from [Google AI Studio](https://aistudio.google.com/app/apikey)).
3. Click **Save & Connect**. The status will switch to `Gemini 2.5 Flash (Live)`.

---

## Tech Stack
- **Backend:** FastAPI, Uvicorn, Pydantic, Python 3.13
- **AI Vision:** Google Gemini 3.5 Flash (`google-genai`), Pillow, OpenCV
- **Database:** SQLite with automatic migrations and seed data
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons, WebRTC Camera API, Web Audio API
