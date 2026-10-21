/**
 * StoreScan AI - Mobile-First Camera & Multimodal Vision Controller
 */

let videoStream = null;
let currentFacingMode = "environment";
let isFlashlightOn = false;
let currentScanMode = "product"; // 'product' or 'rack'
let activeSlot = "front";

const capturedAngles = {
  front: null,
  back: null,
  expiry: null,
  side: null
};

const angleSequence = ["front", "back", "expiry", "side"];

function initCameraSystem() {
  startCamera();
}

async function startCamera() {
  const video = document.getElementById("cameraFeed");
  const fallback = document.getElementById("cameraFallbackImg");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (fallback) fallback.classList.remove("hidden");
    updateCameraStatus("Camera Ready (Preview)", "Point at products, boxes or racks", "bg-emerald-400");
    return;
  }

  try {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
      video: {
        facingMode: currentFacingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (video) {
      video.srcObject = videoStream;
      await video.play();
      if (fallback) fallback.classList.add("hidden");
    }
    updateCameraStatus("Camera Ready", "Point at products, boxes or racks", "bg-emerald-400");
  } catch (err) {
    console.warn("Camera access error/fallback active:", err);
    if (fallback) fallback.classList.remove("hidden");
    updateCameraStatus("Camera Ready", "Point at products, boxes or racks", "bg-emerald-400");
  }
}

function switchCameraFacing() {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  startCamera();
  showToast(`Flipped to ${currentFacingMode === "environment" ? "rear" : "front"} camera`, "info");
}

async function toggleFlashlight() {
  if (!videoStream) {
    isFlashlightOn = !isFlashlightOn;
    showToast(`Torch ${isFlashlightOn ? 'On' : 'Off'}`, "info");
    return;
  }

  const track = videoStream.getVideoTracks()[0];
  if (track) {
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (capabilities.torch) {
      isFlashlightOn = !isFlashlightOn;
      await track.applyConstraints({ advanced: [{ torch: isFlashlightOn }] });
      showToast(`Torch ${isFlashlightOn ? 'On' : 'Off'}`, "info");
    } else {
      isFlashlightOn = !isFlashlightOn;
      showToast(`Torch toggled (simulated)`, "info");
    }
  }
}

function setScanMode(mode) {
  currentScanMode = mode;
  const prodBtn = document.getElementById("modeProductBtn");
  const rackBtn = document.getElementById("modeRackBtn");
  const angleBar = document.getElementById("angleSlotsBar");
  const rackOverlay = document.getElementById("rackAnnotatedOverlay");

  if (mode === "rack") {
    rackBtn.className = "px-2.5 py-1 rounded-full font-bold bg-[#2563eb] text-white transition-all";
    prodBtn.className = "px-2.5 py-1 rounded-full font-bold text-white/70 hover:text-white transition-all";
    if (angleBar) angleBar.classList.add("hidden");
    updateCameraStatus("Shelf Counter Ready", "Align rack or box carton to count items", "bg-blue-400");
  } else {
    prodBtn.className = "px-2.5 py-1 rounded-full font-bold bg-[#2563eb] text-white transition-all";
    rackBtn.className = "px-2.5 py-1 rounded-full font-bold text-white/70 hover:text-white transition-all";
    if (angleBar) angleBar.classList.remove("hidden");
    if (rackOverlay) rackOverlay.classList.add("hidden");
    updateCameraStatus("Camera Ready", "Point at products, boxes or racks", "bg-emerald-400");
  }
}

function selectSlotAngle(angle) {
  activeSlot = angle;
  updateAngleChipsUI();
  updateCameraStatus(`Ready: ${angle.toUpperCase()} Angle`, "Center item inside reticles and tap shutter", "bg-blue-400");
}

function updateAngleChipsUI() {
  angleSequence.forEach(ang => {
    const chip = document.getElementById(`chip-${ang}`);
    if (chip) {
      if (ang === activeSlot) {
        chip.className = "px-2.5 py-1 rounded-xl bg-[#0f2438]/90 backdrop-blur-md border border-blue-400 text-white text-[10px] font-bold shadow-md flex items-center space-x-1";
      } else if (capturedAngles[ang]) {
        chip.className = "px-2.5 py-1 rounded-xl bg-emerald-950/80 backdrop-blur-md border border-emerald-500/50 text-emerald-300 text-[10px] font-bold shadow-md flex items-center space-x-1";
      } else {
        chip.className = "px-2.5 py-1 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 text-white/70 text-[10px] font-medium shadow-md flex items-center space-x-1";
      }
    }
  });
}

function updateCameraStatus(title, subtitle, dotClass = "bg-emerald-400") {
  const titleEl = document.getElementById("cameraStatusTitle");
  const subEl = document.getElementById("cameraStatusSubtitle");
  const dot = document.getElementById("statusPulseDot");

  if (titleEl) titleEl.innerText = title;
  if (subEl) subEl.innerText = subtitle;
  if (dot && dotClass) {
    dot.className = `w-2.5 h-2.5 rounded-full ${dotClass}`;
  }
}

function triggerShutterFlash() {
  playShutterSound();
  const flash = document.getElementById("flashEffectLayer");
  if (flash) {
    flash.classList.remove("active");
    void flash.offsetWidth;
    flash.classList.add("active");
  }
}

async function handleShutterPress() {
  triggerShutterFlash();

  const video = document.getElementById("cameraFeed");
  const canvas = document.createElement("canvas");

  if (video && video.videoWidth) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } else {
    // Canvas fallback to sample image
    const fallback = document.getElementById("cameraFallbackImg");
    canvas.width = fallback.naturalWidth || 600;
    canvas.height = fallback.naturalHeight || 800;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(fallback, 0, 0, canvas.width, canvas.height);
  }

  const base64Data = canvas.toDataURL("image/jpeg", 0.9);

  if (currentScanMode === "rack") {
    // Process Rack Counter
    await processRackPhoto(base64Data);
  } else {
    // Process Product Angle
    await processProductAnglePhoto(activeSlot, base64Data);
  }
}

async function handleGalleryUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result;
    triggerShutterFlash();
    if (currentScanMode === "rack") {
      await processRackPhoto(base64Data);
    } else {
      await processProductAnglePhoto(activeSlot, base64Data);
    }
  };
  reader.readAsDataURL(file);
}

async function processProductAnglePhoto(angle, base64Data) {
  updateCameraStatus(`Saving ${angle.toUpperCase()}...`, "Transferring frame to AI engine", "bg-blue-400");

  try {
    const res = await fetch("/api/scanner/upload-angle-base64", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angle: angle, image_base64: base64Data })
    });
    const data = await res.json();

    if (data.success) {
      capturedAngles[angle] = {
        url: data.url,
        path: data.path,
        base64: base64Data
      };
      updateAngleChipsUI();

      const capturedCount = Object.values(capturedAngles).filter(Boolean).length;

      // Auto advance to next slot
      const nextIdx = angleSequence.indexOf(angle) + 1;
      if (nextIdx < angleSequence.length) {
        activeSlot = angleSequence[nextIdx];
        updateAngleChipsUI();
        updateCameraStatus(`${angle.toUpperCase()} Done! Ready: ${activeSlot.toUpperCase()}`, "Align next side of product packaging", "bg-emerald-400");
      }

      // Automatically trigger AI analysis once we have photos
      triggerProductAnalysis();
    }
  } catch (err) {
    showToast("Error saving angle photo", "error");
    updateCameraStatus("Camera Ready", "Point at products, boxes or racks", "bg-emerald-400");
  }
}

async function triggerProductAnalysis() {
  const validAngles = Object.entries(capturedAngles)
    .filter(([_, v]) => v !== null)
    .map(([k, v]) => ({ angle: k, url: v.url, path: v.path }));

  if (validAngles.length === 0) return;

  updateCameraStatus("Gemini 3.5 Flash Analyzing...", "Extracting Title, Brand, Expiry & Details", "bg-purple-400 animate-pulse");

  try {
    const res = await fetch("/api/scanner/analyze-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angles: validAngles })
    });
    const data = await res.json();

    if (data.success && data.analysis) {
      const p = data.analysis;
      populateDrawerForm(p);
      openDrawer();
      updateCameraStatus("AI Analysis Complete!", `${p.name.substring(0, 22)}... recognized`, "bg-emerald-400");
    }
  } catch (err) {
    console.error("AI Analysis error", err);
  }
}

async function processRackPhoto(base64Data) {
  updateCameraStatus("Gemini Counting Rack...", "Detecting individual box bounding boxes", "bg-blue-400 animate-pulse");

  try {
    const res = await fetch("/api/scanner/count-rack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: base64Data })
    });
    const data = await res.json();

    if (data.success) {
      window.lastRackData = data;
      const overlay = document.getElementById("rackAnnotatedOverlay");
      if (overlay) {
        overlay.src = data.annotated_image_url;
        overlay.classList.remove("hidden");
      }

      // Update quantity
      document.getElementById("drawerQuantity").value = data.count;
      document.getElementById("drawerDetectedBadge").innerText = `Rack: ${data.count} Units`;

      updateCameraStatus(`Detected ${data.count} Boxes!`, "Numbered boxes highlighted on rack image", "bg-emerald-400");
      openDrawer();
    }
  } catch (err) {
    showToast("Error counting rack boxes", "error");
    updateCameraStatus("Camera Ready", "Point at products, boxes or racks", "bg-emerald-400");
  }
}

function populateDrawerForm(p) {
  window.analyzedProductData = p;
  document.getElementById("drawerName").value = p.name || "";
  document.getElementById("drawerBrand").value = p.brand || "";
  document.getElementById("drawerCategory").value = p.category || "General";
  document.getElementById("drawerExpiry").value = p.expiry_date || "";
  document.getElementById("drawerBatch").value = p.batch_no || "";
  document.getElementById("drawerNetWeight").value = p.net_weight || "";
  document.getElementById("drawerMrp").value = p.mrp || 0;
  document.getElementById("drawerBarcode").value = p.barcode || "";
}

function openDrawer() {
  const drawer = document.getElementById("scanResultDrawer");
  if (drawer) drawer.classList.add("open");
}

function closeDrawer() {
  const drawer = document.getElementById("scanResultDrawer");
  if (drawer) drawer.classList.remove("open");
}

function toggleDrawer() {
  const drawer = document.getElementById("scanResultDrawer");
  if (drawer) drawer.classList.toggle("open");
}

function adjustDrawerQty(delta) {
  const input = document.getElementById("drawerQuantity");
  if (!input) return;
  const cur = parseInt(input.value) || 0;
  const next = Math.max(0, cur + delta);
  input.value = next;
  document.getElementById("drawerDetectedBadge").innerText = `Stock: ${next} Units`;
}

async function submitDrawerToStock() {
  const name = document.getElementById("drawerName").value.trim();
  if (!name) {
    showToast("Product title is required", "warning");
    return;
  }

  const btn = document.getElementById("drawerSubmitBtn");
  if (btn) btn.disabled = true;

  const angleUrls = Object.values(capturedAngles).filter(Boolean).map(v => v.url);
  const primaryImg = angleUrls[0] || (window.lastRackData?.annotated_image_url || "/static/uploads/store_shelf_preview.jpg");

  const payload = {
    name: name,
    brand: document.getElementById("drawerBrand").value.trim(),
    category: document.getElementById("drawerCategory").value.trim() || "General",
    barcode: document.getElementById("drawerBarcode").value.trim(),
    net_weight: document.getElementById("drawerNetWeight").value.trim(),
    mrp: parseFloat(document.getElementById("drawerMrp").value) || 0,
    cost_price: (parseFloat(document.getElementById("drawerMrp").value) || 0) * 0.78,
    quantity: parseInt(document.getElementById("drawerQuantity").value) || 1,
    min_stock_alert: 5,
    location: document.getElementById("drawerLocation").value.trim() || "Main Rack",
    expiry_date: document.getElementById("drawerExpiry").value,
    batch_no: document.getElementById("drawerBatch").value.trim(),
    primary_image: primaryImg,
    angle_images: angleUrls,
    rack_image: window.lastRackData?.annotated_image_url || "",
    rack_box_count: window.lastRackData?.count || 0,
    ai_confidence: window.analyzedProductData?.confidence || 0.98,
    ai_summary: window.analyzedProductData?.summary || "Added via Store Manager Mobile Scanner"
  };

  showToast("Transferring to Stock Manager...", "info");

  try {
    const res = await fetch("/api/scanner/transfer-to-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || "Added to stock successfully!", "success");
      setTimeout(() => {
        window.location.href = data.redirect_url || "/inventory";
      }, 600);
    } else {
      showToast(data.detail || "Transfer failed", "error");
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    showToast("Network error transferring to stock", "error");
    if (btn) btn.disabled = false;
  }
}
