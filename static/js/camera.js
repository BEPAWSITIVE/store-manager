/**
 * StoreScan AI - Homepage Multi-Angle Camera & Analysis Controller
 */

let videoStream = null;
let currentFacingMode = "environment";
let isFlashlightOn = false;
let capturedPhotos = []; // [{ id: number, angle: string, dataUrl: string }]

function initCameraSystem() {
  startCamera();
  updateThumbnailsTray();
}

async function startCamera() {
  const video = document.getElementById("cameraFeed");
  const loader = document.getElementById("cameraLoadingPlaceholder");
  const title = document.getElementById("cameraLoadingTitle");
  const desc = document.getElementById("cameraLoadingDesc");
  const retryBtn = document.getElementById("retryCameraBtn");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (title) title.innerText = "Camera Not Supported";
    if (desc) desc.innerText = "Please upload photos using the gallery button below.";
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
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          if (loader) loader.classList.add("hidden");
        } catch (e) {
          console.warn("Video play failed:", e);
        }
      };
      // Fallback check in case metadata already loaded
      setTimeout(async () => {
        try {
          if (video.paused) await video.play();
          if (loader && video.videoWidth > 0) loader.classList.add("hidden");
        } catch (e) {}
      }, 600);
    }
  } catch (err) {
    console.warn("Camera access error:", err);
    if (loader) loader.classList.remove("hidden");
    if (title) title.innerText = "Camera Access Blocked";
    if (desc) desc.innerText = "Allow camera access in your browser, or upload photos with the gallery icon.";
    if (retryBtn) retryBtn.classList.remove("hidden");
  }
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
      showToast("Torch toggled", "info");
    }
  }
}

function triggerShutterFlash() {
  if (typeof playShutterSound === "function") {
    playShutterSound();
  }
  const flash = document.getElementById("flashEffectLayer");
  if (flash) {
    flash.classList.remove("active");
    void flash.offsetWidth;
    flash.classList.add("active");
  }
  if (navigator.vibrate) {
    try { navigator.vibrate(35); } catch (e) {}
  }
}

/**
 * Capture a photo frame strictly from the live video stream (NO fallback to stock images)
 */
function grabCurrentFrameBase64() {
  const video = document.getElementById("cameraFeed");
  if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Click Shutter Button: Only triggered by explicitly tapping the photo button
 */
function clickShutterPhoto() {
  const video = document.getElementById("cameraFeed");
  if (!video || !video.videoWidth || video.readyState < 2) {
    showToast("Camera feed is starting, please tap again in a moment.", "warning");
    return;
  }

  const base64Data = grabCurrentFrameBase64();
  if (!base64Data) {
    showToast("Could not capture frame from camera. Please tap again.", "warning");
    return;
  }

  triggerShutterFlash();

  const nextIndex = capturedPhotos.length + 1;
  let angleLabel = `Angle ${nextIndex}`;
  if (nextIndex === 1) angleLabel = "Front View";
  else if (nextIndex === 2) angleLabel = "Back & Details";
  else if (nextIndex === 3) angleLabel = "Barcode & Expiry";
  else if (nextIndex === 4) angleLabel = "Shelf / Box View";

  capturedPhotos.push({
    id: Date.now() + Math.random(),
    angle: angleLabel,
    dataUrl: base64Data
  });

  updateThumbnailsTray();
  showToast(`Captured ${angleLabel} (${capturedPhotos.length} total)`, "success");
}

/**
 * Updates the floating multi-photo gallery tray
 */
function updateThumbnailsTray() {
  const tray = document.getElementById("capturedThumbnailsTray");
  const list = document.getElementById("thumbnailsList");
  const countLabel = document.getElementById("capturedCountLabel");
  const analyzeBtnLabel = document.getElementById("analyzeBtnLabel");
  const statusText = document.getElementById("cameraStatusText");
  const clearBtn = document.getElementById("clearPhotosBtn");
  const navBadge = document.getElementById("centerCaptureCountBadge");

  const count = capturedPhotos.length;

  if (count === 0) {
    if (tray) tray.classList.add("hidden");
    if (clearBtn) clearBtn.classList.add("hidden");
    if (navBadge) navBadge.classList.add("hidden");
    if (statusText) statusText.innerText = "Point camera & tap shutter button";
    return;
  }

  if (tray) tray.classList.remove("hidden");
  if (clearBtn) clearBtn.classList.remove("hidden");
  if (navBadge) {
    navBadge.classList.remove("hidden");
    navBadge.innerText = count;
  }

  if (countLabel) {
    countLabel.innerText = `${count} Angle${count > 1 ? "s" : ""} Captured`;
  }
  if (analyzeBtnLabel) {
    analyzeBtnLabel.innerText = `Analyze & Review (${count} Photo${count > 1 ? "s" : ""})`;
  }
  if (statusText) {
    statusText.innerText = `${count} photo${count > 1 ? "s" : ""} ready • Snap more or tap Review`;
  }

  if (list) {
    list.innerHTML = capturedPhotos.map((item, idx) => `
      <div class="relative flex-shrink-0 group">
        <img src="${item.dataUrl}" alt="${item.angle}" class="w-14 h-14 object-cover rounded-xl border-2 border-blue-400 shadow-md">
        <span class="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[8px] font-bold text-white text-center rounded-b-xl py-0.5 truncate px-1">
          #${idx + 1}
        </span>
        <button type="button" onclick="removeCapturedPhoto(${item.id})" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-black shadow-md hover:bg-red-700 active:scale-95 transition-transform" title="Remove angle">
          ×
        </button>
      </div>
    `).join("");
  }
}

/**
 * Remove a specific angle from captured set
 */
function removeCapturedPhoto(id) {
  capturedPhotos = capturedPhotos.filter(p => p.id !== id);
  // Re-number labels if needed
  capturedPhotos.forEach((p, idx) => {
    if (p.angle.startsWith("Angle ")) {
      p.angle = `Angle ${idx + 1}`;
    }
  });
  updateThumbnailsTray();
}

/**
 * Reset and clear all captured photos
 */
function clearAllCapturedPhotos() {
  capturedPhotos = [];
  updateThumbnailsTray();
  showToast("All captured angles cleared", "info");
}

/**
 * Handles multiple photo selection via gallery/files
 */
function handleMultiPhotoUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  triggerShutterFlash();

  let loaded = 0;
  files.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      capturedPhotos.push({
        id: Date.now() + Math.random() + index,
        angle: `Photo ${capturedPhotos.length + 1}`,
        dataUrl: e.target.result
      });
      loaded++;
      if (loaded === files.length) {
        updateThumbnailsTray();
        showToast(`Loaded ${files.length} photo(s) from device`, "success");
      }
    };
    reader.readAsDataURL(file);
  });
  // Reset input value so same files can be chosen again
  event.target.value = "";
}

/**
 * Sends all captured photos to AI for multimodal analysis.
 * NOTE: Does NOT show the model name during processing!
 */
async function submitAllPhotosForAnalysis() {
  if (capturedPhotos.length === 0) {
    showToast("Please tap the shutter button to click at least 1 photo first", "warning");
    return;
  }

  const overlay = document.getElementById("analyzingOverlay");
  const loadingTitle = document.getElementById("analysisLoadingTitle");
  const loadingSubtitle = document.getElementById("analysisLoadingSubtitle");

  if (overlay) overlay.classList.remove("hidden");
  if (loadingTitle) loadingTitle.innerText = "Analyzing product photos...";
  if (loadingSubtitle) loadingSubtitle.innerText = `Extracting details from ${capturedPhotos.length} angle photo(s)...`;

  // Client-side barcode detection from photos using device BarcodeDetector (if available on phone)
  let detectedBarcode = "";
  if ('BarcodeDetector' in window) {
    try {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] });
      for (const p of capturedPhotos) {
        const img = new Image();
        img.src = p.dataUrl;
        await new Promise(r => img.onload = r);
        const barcodes = await detector.detect(img);
        if (barcodes && barcodes.length > 0) {
          detectedBarcode = barcodes[0].rawValue;
          break;
        }
      }
    } catch (e) {
      console.debug("Native barcode detector notice:", e);
    }
  }

  const savedApiKey = localStorage.getItem("store_gemini_api_key") || "";

  const payload = {
    images: capturedPhotos.map(p => ({
      angle: p.angle,
      image_base64: p.dataUrl
    }))
  };

  try {
    const response = await fetch("/api/scanner/analyze-batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-Api-Key": savedApiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.success && data.analysis) {
      const p = data.analysis;

      const reviewData = {
        name: p.name || "",
        brand: p.brand || "",
        category: p.category || "",
        expiry_date: p.expiry_date || "",
        batch_no: p.batch_no || "",
        net_weight: p.net_weight || "",
        mrp: (p.mrp && parseFloat(p.mrp) > 0) ? parseFloat(p.mrp) : "",
        barcode: p.barcode || detectedBarcode || "",
        quantity: (p.quantity && parseInt(p.quantity) > 0) ? parseInt(p.quantity) : 1,
        units_per_package: p.units_per_package || 1,
        package_count: p.package_count || 1,
        quantity_calculation: p.quantity_calculation || "",
        detected_packaging_type: p.detected_packaging_type || "",
        location: p.location || "",
        is_ai_live: !!p.is_ai_live,
        primary_image: capturedPhotos[0] ? capturedPhotos[0].dataUrl : "",
        angle_images: capturedPhotos.map(cp => cp.dataUrl)
      };

      sessionStorage.setItem("captured_product_data", JSON.stringify(reviewData));
      window.location.href = "/review";
      return;
    } else {
      throw new Error(data.detail || "Analysis could not parse images.");
    }
  } catch (err) {
    console.warn("Analysis request error:", err);
    // Proceed to review with actual captured photos (NO fallback stock photo)
    const blankReviewData = {
      name: "",
      brand: "",
      category: "",
      expiry_date: "",
      batch_no: "",
      net_weight: "",
      mrp: "",
      barcode: detectedBarcode || "",
      quantity: 1,
      units_per_package: 1,
      package_count: 1,
      quantity_calculation: "",
      detected_packaging_type: "",
      location: "",
      is_ai_live: false,
      primary_image: capturedPhotos[0] ? capturedPhotos[0].dataUrl : "",
      angle_images: capturedPhotos.map(cp => cp.dataUrl)
    };
    sessionStorage.setItem("captured_product_data", JSON.stringify(blankReviewData));
    window.location.href = "/review";
  }
}

// Global hook for the center nav capture button
function triggerMainCapture() {
  clickShutterPhoto();
}
