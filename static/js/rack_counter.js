/**
 * StoreScan AI - Rack Photo Box Counter & Stock Transfer Handler
 */

let currentRackData = {
  raw_image_url: "",
  annotated_image_url: "",
  count: 0
};

function initRackCounter() {
  // Listeners if needed
}

function adjustCountedQty(delta) {
  const input = document.getElementById("fieldQuantity");
  if (!input) return;
  const current = parseInt(input.value) || 0;
  const next = Math.max(0, current + delta);
  input.value = next;
  updateRackBadge(next);
}

function updateRackBadge(val) {
  const badge = document.getElementById("rackDetectedBadge");
  if (badge) {
    badge.innerText = `Qty: ${val}`;
  }
}

async function captureRackFromCamera() {
  const video = document.getElementById("cameraFeed");
  if (!video || !video.videoWidth) {
    showToast("Camera feed is not active. Please use 'Upload Shelf Image'.", "warning");
    return;
  }

  playShutterSound();
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64Data = canvas.toDataURL("image/jpeg", 0.9);
  await submitRackImageForCounting({ image_base64: base64Data });
}

async function handleRackFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  const loader = document.getElementById("rackCountingLoader");
  if (loader) loader.classList.remove("hidden");
  showToast("Uploading and counting boxes on rack...", "info");

  try {
    const res = await fetch("/api/scanner/upload-rack-file", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    processRackCountResponse(data);
  } catch (err) {
    showToast("Error counting boxes from rack file", "error");
    console.error(err);
  } finally {
    if (loader) loader.classList.add("hidden");
  }
}

async function submitRackImageForCounting(payload) {
  const loader = document.getElementById("rackCountingLoader");
  if (loader) loader.classList.remove("hidden");
  showToast("AI analyzing rack and counting boxes...", "info");

  try {
    const res = await fetch("/api/scanner/count-rack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    processRackCountResponse(data);
  } catch (err) {
    showToast("Failed to count boxes on rack", "error");
    console.error(err);
  } finally {
    if (loader) loader.classList.add("hidden");
  }
}

function processRackCountResponse(data) {
  if (data.success) {
    currentRackData = {
      raw_image_url: data.raw_image_url,
      annotated_image_url: data.annotated_image_url,
      count: data.count
    };

    // Update image view
    const imgEl = document.getElementById("rackAnnotatedImg");
    const placeholder = document.getElementById("rackEmptyPlaceholder");
    if (imgEl && placeholder) {
      imgEl.src = data.annotated_image_url;
      imgEl.classList.remove("hidden");
      placeholder.classList.add("hidden");
    }

    // Update quantity input
    const qtyInput = document.getElementById("fieldQuantity");
    if (qtyInput) {
      qtyInput.value = data.count;
    }
    updateRackBadge(data.count);

    // Update Step indicator
    document.getElementById("stepIndicator2").className = "flex items-center space-x-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400";
    document.getElementById("stepIndicator3").className = "flex items-center space-x-3 p-3 rounded-xl bg-brand-600/15 border border-brand-500/40 text-brand-400";

    showToast(`AI Detected ${data.count} boxes on rack!`, "success");
  } else {
    showToast("Failed to count boxes on rack", "error");
  }
}

async function transferDetailsToStock() {
  const name = document.getElementById("fieldName").value.trim();
  if (!name) {
    showToast("Please provide a product title (or analyze multi-angle photos first)", "warning");
    document.getElementById("fieldName").focus();
    return;
  }

  const btn = document.getElementById("transferStockBtn");
  if (btn) btn.disabled = true;

  // Compile angle images list
  const angleUrls = Object.values(capturedAngles)
    .filter(Boolean)
    .map(v => v.url);

  const primaryImage = angleUrls[0] || (currentRackData.annotated_image_url || "/static/uploads/sample_nutella_front.jpg");

  const payload = {
    name: name,
    brand: document.getElementById("fieldBrand").value.trim(),
    category: document.getElementById("fieldCategory").value.trim() || "General",
    barcode: document.getElementById("fieldBarcode").value.trim(),
    net_weight: document.getElementById("fieldNetWeight").value.trim(),
    mrp: parseFloat(document.getElementById("fieldMrp").value) || 0.0,
    cost_price: (parseFloat(document.getElementById("fieldMrp").value) || 0.0) * 0.78,
    quantity: parseInt(document.getElementById("fieldQuantity").value) || 1,
    min_stock_alert: 5,
    location: document.getElementById("fieldLocation").value.trim() || "Main Rack",
    expiry_date: document.getElementById("fieldExpiry").value,
    batch_no: document.getElementById("fieldBatch").value.trim(),
    primary_image: primaryImage,
    angle_images: angleUrls,
    rack_image: currentRackData.annotated_image_url || "",
    rack_box_count: currentRackData.count || 0,
    ai_confidence: (window.analyzedProductData && window.analyzedProductData.confidence) || 0.96,
    ai_summary: (window.analyzedProductData && window.analyzedProductData.summary) || `Product with ${angleUrls.length} angle photos and counted rack quantity.`
  };

  showToast("Transferring product & rack data to Stock Manager...", "info");

  try {
    const res = await fetch("/api/scanner/transfer-to-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || "Transferred to stock successfully!", "success");
      setTimeout(() => {
        window.location.href = data.redirect_url || "/inventory";
      }, 700);
    } else {
      showToast("Transfer failed: " + (data.detail || "Server error"), "error");
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    showToast("Network error transferring to stock", "error");
    if (btn) btn.disabled = false;
  }
}

function resetScannerFlow() {
  clearAllAngles();
  currentRackData = { raw_image_url: "", annotated_image_url: "", count: 0 };

  const imgEl = document.getElementById("rackAnnotatedImg");
  const placeholder = document.getElementById("rackEmptyPlaceholder");
  if (imgEl && placeholder) {
    imgEl.src = "";
    imgEl.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }

  document.getElementById("productForm").reset();
  document.getElementById("fieldQuantity").value = 1;
  updateRackBadge(0);

  const confBadge = document.getElementById("aiConfidenceBadge");
  if (confBadge) {
    confBadge.innerText = "Awaiting Scan";
    confBadge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700";
  }

  const summaryEl = document.getElementById("aiSummaryBox");
  if (summaryEl) {
    summaryEl.innerHTML = "Scan product angles on the left to extract full details automatically.";
  }

  document.getElementById("stepIndicator1").className = "flex items-center space-x-3 p-3 rounded-xl bg-brand-600/15 border border-brand-500/40 text-brand-400";
  document.getElementById("stepIndicator2").className = "flex items-center space-x-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400";
  document.getElementById("stepIndicator3").className = "flex items-center space-x-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400";

  showToast("Scanner flow reset", "info");
}
