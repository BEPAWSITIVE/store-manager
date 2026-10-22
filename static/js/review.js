/**
 * StoreScan AI - Product & Inventory Review Controller
 */

let currentQuantity = 12;

function initReviewPage() {
  // Load data from session storage if available
  const stored = sessionStorage.getItem("captured_product_data");
  if (stored) {
    try {
      const data = JSON.parse(stored);
      if (data.name) document.getElementById("reviewName").value = data.name;
      if (data.brand) document.getElementById("reviewBrand").value = data.brand;
      if (data.category) document.getElementById("reviewCategory").value = data.category;
      if (data.expiry_date) document.getElementById("reviewExpiry").value = data.expiry_date;
      if (data.batch_no) document.getElementById("reviewBatch").value = data.batch_no;
      if (data.net_weight) document.getElementById("reviewNetWeight").value = data.net_weight;
      if (data.mrp) document.getElementById("reviewMrp").value = data.mrp;
      if (data.barcode) document.getElementById("reviewBarcode").value = data.barcode;
      if (data.quantity) {
        currentQuantity = parseInt(data.quantity) || 12;
        updateQuantityDisplay();
      }
      if (data.location) document.getElementById("reviewLocation").value = data.location;
    } catch (e) {
      console.warn("Could not parse stored captured product data", e);
    }
  }
}

function adjustReviewCount(delta) {
  currentQuantity = Math.max(0, currentQuantity + delta);
  updateQuantityDisplay();
}

function updateQuantityDisplay() {
  const el = document.getElementById("reviewQuantityText");
  if (el) el.innerText = currentQuantity;
}

async function submitVerifiedStock() {
  const btn = document.getElementById("transferBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Transferring to Stock...</span>
    `;
  }

  const name = document.getElementById("reviewName").value.trim() || "Colgate Strong Teeth Dental Paste";
  const brand = document.getElementById("reviewBrand").value.trim() || "Colgate-Palmolive";
  const category = document.getElementById("reviewCategory").value.trim() || "Oral Care / FMCG";
  const expiry = document.getElementById("reviewExpiry").value.trim() || "18/11/2026";
  const batch = document.getElementById("reviewBatch").value.trim() || "B-9482X";
  const netWeight = document.getElementById("reviewNetWeight").value.trim() || "200g";
  const mrp = parseFloat(document.getElementById("reviewMrp").value) || 120.0;
  const barcode = document.getElementById("reviewBarcode").value.trim() || "8901314010523";
  const location = document.getElementById("reviewLocation").value.trim() || "Rack C-04 • A2";

  // Retain image from session if present
  let primaryImage = "/static/uploads/store_shelf_preview.jpg";
  const stored = sessionStorage.getItem("captured_product_data");
  if (stored) {
    try {
      const data = JSON.parse(stored);
      if (data.primary_image) primaryImage = data.primary_image;
    } catch (e) {}
  }

  const payload = {
    name: name,
    brand: brand,
    category: category,
    barcode: barcode,
    net_weight: netWeight,
    mrp: mrp,
    cost_price: mrp * 0.75,
    quantity: currentQuantity,
    min_stock_alert: 5,
    location: location,
    expiry_date: expiry,
    batch_no: batch,
    primary_image: primaryImage,
    angle_images: [primaryImage],
    rack_image: "",
    rack_box_count: currentQuantity,
    ai_confidence: 0.98,
    ai_summary: "Verified via Store Manager Review Page"
  };

  try {
    const res = await fetch("/api/scanner/transfer-to-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      sessionStorage.removeItem("captured_product_data");
      showToast("Transferred to Stock Manager!", "success");
      setTimeout(() => {
        window.location.href = data.redirect_url || "/inventory";
      }, 500);
    } else {
      showToast(data.detail || "Failed to transfer", "error");
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    showToast("Network error transferring stock", "error");
    if (btn) btn.disabled = false;
  }
}
