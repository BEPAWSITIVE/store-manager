/**
 * StoreScan AI - Product & Inventory Review Controller
 */

let currentQuantity = 1;

function initReviewPage() {
  const stored = sessionStorage.getItem("captured_product_data");
  if (stored) {
    try {
      const data = JSON.parse(stored);

      // Only populate fields that were actually detected - leave others blank
      document.getElementById("reviewName").value = data.name || "";
      document.getElementById("reviewBrand").value = data.brand || "";
      document.getElementById("reviewCategory").value = data.category || "";
      document.getElementById("reviewExpiry").value = data.expiry_date || "";
      document.getElementById("reviewBatch").value = data.batch_no || "";
      document.getElementById("reviewNetWeight").value = data.net_weight || "";
      
      const mrpInput = document.getElementById("reviewMrp");
      if (data.mrp !== undefined && data.mrp !== null && data.mrp !== "" && parseFloat(data.mrp) > 0) {
        mrpInput.value = data.mrp;
      } else {
        mrpInput.value = "";
      }

      document.getElementById("reviewBarcode").value = data.barcode || "";
      document.getElementById("reviewLocation").value = data.location || "";

      if (data.quantity && parseInt(data.quantity) > 0) {
        currentQuantity = parseInt(data.quantity);
      } else {
        currentQuantity = 1;
      }
      updateQuantityDisplay();

      // Render the photos clicked by the user
      renderCapturedPhotos(data);

      // Show notice if Gemini AI key is not yet configured
      const notice = document.getElementById("aiKeyNotice");
      if (notice) {
        if (!data.is_ai_live && !data.name) {
          notice.classList.remove("hidden");
          if (window.lucide) lucide.createIcons();
        } else {
          notice.classList.add("hidden");
        }
      }

    } catch (e) {
      console.warn("Could not parse stored captured product data", e);
      resetReviewForm();
    }
  } else {
    resetReviewForm();
  }
}

function resetReviewForm() {
  document.getElementById("reviewName").value = "";
  document.getElementById("reviewBrand").value = "";
  document.getElementById("reviewCategory").value = "";
  document.getElementById("reviewExpiry").value = "";
  document.getElementById("reviewBatch").value = "";
  document.getElementById("reviewNetWeight").value = "";
  document.getElementById("reviewMrp").value = "";
  document.getElementById("reviewBarcode").value = "";
  document.getElementById("reviewLocation").value = "";
  currentQuantity = 1;
  updateQuantityDisplay();
}

function renderCapturedPhotos(data) {
  const container = document.getElementById("reviewPhotosContainer");
  const strip = document.getElementById("reviewPhotosStrip");
  const countBadge = document.getElementById("reviewAngleCountBadge");

  let photos = [];
  if (Array.isArray(data.angle_images) && data.angle_images.length > 0) {
    photos = data.angle_images;
  } else if (data.primary_image) {
    photos = [data.primary_image];
  }

  if (!photos.length || !container || !strip) return;

  container.classList.remove("hidden");
  if (countBadge) {
    countBadge.innerText = `${photos.length} Photo${photos.length > 1 ? "s" : ""}`;
  }

  strip.innerHTML = photos.map((imgSrc, idx) => `
    <div class="relative flex-shrink-0">
      <img src="${imgSrc}" alt="Angle ${idx + 1}" class="w-16 h-16 object-cover rounded-xl border border-blue-200 shadow-sm">
      <span class="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[8px] font-bold text-white text-center rounded-b-xl py-0.5">
        Angle ${idx + 1}
      </span>
    </div>
  `).join("");
}

function adjustReviewCount(delta) {
  currentQuantity = Math.max(1, currentQuantity + delta);
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

  const name = document.getElementById("reviewName").value.trim() || "Scanned Retail Product";
  const brand = document.getElementById("reviewBrand").value.trim();
  const category = document.getElementById("reviewCategory").value.trim() || "General";
  const expiry = document.getElementById("reviewExpiry").value.trim();
  const batch = document.getElementById("reviewBatch").value.trim();
  const netWeight = document.getElementById("reviewNetWeight").value.trim();
  const mrpVal = parseFloat(document.getElementById("reviewMrp").value);
  const mrp = (!isNaN(mrpVal) && mrpVal > 0) ? mrpVal : 0.0;
  const barcode = document.getElementById("reviewBarcode").value.trim();
  const location = document.getElementById("reviewLocation").value.trim() || "Main Shelf";

  // Retain image from session if present
  let primaryImage = "";
  let angleImages = [];
  const stored = sessionStorage.getItem("captured_product_data");
  if (stored) {
    try {
      const data = JSON.parse(stored);
      if (data.primary_image) primaryImage = data.primary_image;
      if (Array.isArray(data.angle_images)) angleImages = data.angle_images;
    } catch (e) {}
  }

  if (!primaryImage && angleImages.length > 0) {
    primaryImage = angleImages[0];
  }
  if (!primaryImage) {
    primaryImage = "/static/uploads/store_shelf_preview.jpg";
  }

  const payload = {
    name: name,
    brand: brand,
    category: category,
    barcode: barcode,
    net_weight: netWeight,
    mrp: mrp,
    cost_price: mrp > 0 ? mrp * 0.75 : 0.0,
    quantity: currentQuantity,
    min_stock_alert: 5,
    location: location,
    expiry_date: expiry,
    batch_no: batch,
    primary_image: primaryImage,
    angle_images: angleImages.length ? angleImages : [primaryImage],
    rack_image: "",
    rack_box_count: currentQuantity,
    ai_confidence: 0.98,
    ai_summary: "Verified and cataloged into Stock Manager"
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
