/**
 * StoreScan AI - Core Application Utilities
 */

// Shutter Audio Synthesizer (Zero external audio file dependency!)
function playShutterSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (e) {
    // Audio context may require prior user interaction
  }
}

// Toast Notifications System
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `pointer-events-auto flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold border transition-all duration-300 transform translate-y-2 opacity-0 ${
    type === "error"
      ? "bg-rose-950/90 text-rose-200 border-rose-800"
      : type === "warning"
      ? "bg-amber-950/90 text-amber-200 border-amber-800"
      : "bg-slate-900/95 text-brand-300 border-brand-500/40"
  }`;

  const iconName = type === "error" ? "alert-circle" : type === "warning" ? "alert-triangle" : "check-circle";
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 flex-shrink-0"></i>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  // Animate in
  setTimeout(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  }, 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

// Settings Modal
function openSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) {
    modal.classList.remove("hidden");
    fetchSettingsStatus();
  }
}

function closeSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.classList.add("hidden");
}

function openReportsModal() {
  const modal = document.getElementById("reportsModal");
  if (modal) modal.classList.remove("hidden");
}

function closeReportsModal() {
  const modal = document.getElementById("reportsModal");
  if (modal) modal.classList.add("hidden");
}

function openAlertsModal() {
  const modal = document.getElementById("alertsModal");
  if (modal) modal.classList.remove("hidden");
}

function closeAlertsModal() {
  const modal = document.getElementById("alertsModal");
  if (modal) modal.classList.add("hidden");
}

function toggleApiKeyVisibility() {
  const input = document.getElementById("geminiApiKeyInput");
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

async function fetchSettingsStatus() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (data.success) {
      const input = document.getElementById("geminiApiKeyInput");
      if (input && data.has_api_key && !input.value) {
        input.placeholder = `Configured: ${data.masked_api_key}`;
      }

      const modelSelect = document.getElementById("geminiModelSelect");
      if (modelSelect && data.model) {
        modelSelect.value = data.model;
      }
    }
  } catch (e) {
    console.error("Settings fetch failed", e);
  }
}

async function saveGeminiApiKey() {
  const input = document.getElementById("geminiApiKeyInput");
  const modelSelect = document.getElementById("geminiModelSelect");
  
  const key = input ? input.value.trim() : "";
  const model = modelSelect ? modelSelect.value : "gemini-3.5-flash";

  const btn = document.getElementById("saveApiKeyBtn");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/settings/gemini-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, model: model })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || `Connected to ${model}!`, "success");
      const navStatus = document.getElementById("navAiStatus");
      if (navStatus) {
        if (data.mode === "live") {
          navStatus.innerText = `${model} (Live)`;
        } else {
          navStatus.innerText = `Demo Mode (${model})`;
        }
      }
      closeSettingsModal();
    } else {
      showToast(data.detail || "Validation failed", "error");
    }
  } catch (e) {
    showToast("Network error saving settings", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
