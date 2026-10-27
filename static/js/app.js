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
      const localKey = localStorage.getItem("store_gemini_api_key");
      if (localKey && input && !input.value) {
        input.value = localKey;
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
  const model = modelSelect ? modelSelect.value : "gemini-2.0-flash";

  if (key) {
    localStorage.setItem("store_gemini_api_key", key);
  }
  localStorage.setItem("store_gemini_model", model);

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

function handleCenterCaptureClick() {
  if (typeof clickShutterPhoto === 'function') {
    clickShutterPhoto();
  } else {
    window.location.href = '/scan';
  }
}

function triggerMainCapture() {
  handleCenterCaptureClick();
}

// -------------------------------------------------------------
// Auth & Role-Based Access Guards
// -------------------------------------------------------------

function getStoredUser() {
  try {
    const str = localStorage.getItem("store_auth_user");
    return str ? JSON.parse(str) : null;
  } catch (e) {
    return null;
  }
}

function initAuthGuard() {
  const path = window.location.pathname;
  const user = getStoredUser();

  // If on login page, nothing to guard
  if (path === "/login") return;

  // If not logged in on protected page, redirect to /login
  if (!user) {
    window.location.href = "/login";
    return;
  }

  // Update header role badge
  const badge = document.getElementById("headerRoleBadge");
  if (badge) {
    if (user.role === "billing") {
      badge.innerText = "POS";
      badge.parentElement.classList.remove("bg-[#0d59e8]");
      badge.parentElement.classList.add("bg-emerald-600");
    } else if (user.role === "admin") {
      badge.innerText = "ADM";
      badge.parentElement.classList.remove("bg-[#0d59e8]");
      badge.parentElement.classList.add("bg-indigo-600");
    } else {
      badge.innerText = "BM";
    }
  }

  // On phone screens (< 768px), billing section is hidden; redirect to /scan
  if (window.innerWidth < 768 && path === "/billing") {
    window.location.href = "/scan";
    return;
  }
  // All logged-in staff have full access to all sections on desktop/laptop. No forced restrictions.
}

function logoutStaff() {
  localStorage.removeItem("store_auth_user");
  sessionStorage.clear();
  showToast("Logged out successfully", "info");
  setTimeout(() => {
    window.location.href = "/login";
  }, 300);
}

// -------------------------------------------------------------
// Settings Tabs: Supabase & Gemini
// -------------------------------------------------------------

function switchSettingsTab(tab) {
  const tabSb = document.getElementById("settingsTabSupabase");
  const tabGm = document.getElementById("settingsTabGemini");
  const btnSb = document.getElementById("tabBtnSupabase");
  const btnGm = document.getElementById("tabBtnGemini");

  if (tab === "supabase") {
    if (tabSb) tabSb.classList.remove("hidden");
    if (tabGm) tabGm.classList.add("hidden");
    if (btnSb) {
      btnSb.className = "px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#2563eb] text-white transition-all";
    }
    if (btnGm) {
      btnGm.className = "px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all";
    }
  } else {
    if (tabSb) tabSb.classList.add("hidden");
    if (tabGm) tabGm.classList.remove("hidden");
    if (btnGm) {
      btnGm.className = "px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#2563eb] text-white transition-all";
    }
    if (btnSb) {
      btnSb.className = "px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all";
    }
  }
}

async function saveSupabaseConfig() {
  const urlInput = document.getElementById("supabaseUrlInput");
  const keyInput = document.getElementById("supabaseKeyInput");
  const syncCheck = document.getElementById("syncExistingCheckbox");
  const btn = document.getElementById("saveSupabaseBtn");

  const url = urlInput ? urlInput.value.trim() : "";
  const key = keyInput ? keyInput.value.trim() : "";
  const sync = syncCheck ? syncCheck.checked : false;

  if (!url || !key) {
    showToast("Please enter both Supabase URL and Key", "warning");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Testing Connection...</span>`;
  }

  try {
    const res = await fetch("/api/auth/config-supabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, key, sync_existing: sync })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "Connected to Supabase successfully!", "success");
      setTimeout(() => closeSettingsModal(), 600);
    } else {
      showToast(data.message || data.detail || "Connection failed", "error");
    }
  } catch (err) {
    showToast("Network error connecting to Supabase", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i><span>Connect & Save Supabase</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function copySupabaseSchema() {
  const sql = `-- Supabase SQL Schema for Store Manager & Billing
CREATE TABLE IF NOT EXISTS products (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT DEFAULT 'General',
    barcode TEXT,
    sku TEXT,
    net_weight TEXT,
    mrp NUMERIC DEFAULT 0.0,
    cost_price NUMERIC DEFAULT 0.0,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_alert INTEGER DEFAULT 5,
    location TEXT DEFAULT 'Default Shelf',
    manufacturing_date TEXT,
    expiry_date TEXT,
    batch_no TEXT,
    primary_image TEXT,
    angle_images JSONB DEFAULT '[]'::jsonb,
    rack_image TEXT,
    rack_box_count INTEGER DEFAULT 0,
    ai_confidence NUMERIC DEFAULT 0.95,
    ai_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    customer_name TEXT DEFAULT 'Walk-in Customer',
    customer_mobile TEXT,
    subtotal NUMERIC NOT NULL DEFAULT 0.0,
    discount_amount NUMERIC DEFAULT 0.0,
    tax_amount NUMERIC DEFAULT 0.0,
    grand_total NUMERIC NOT NULL DEFAULT 0.0,
    payment_mode TEXT DEFAULT 'Cash',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    cashier_email TEXT DEFAULT 'cashier@store.com',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_logs (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
    change_amount INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT DEFAULT 'Adjustment',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select products" ON products FOR SELECT USING (true);
CREATE POLICY "Allow public insert products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update products" ON products FOR UPDATE USING (true);
CREATE POLICY "Allow public delete products" ON products FOR DELETE USING (true);

CREATE POLICY "Allow public select invoices" ON invoices FOR SELECT USING (true);
CREATE POLICY "Allow public insert invoices" ON invoices FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select stock_logs" ON stock_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert stock_logs" ON stock_logs FOR INSERT WITH CHECK (true);`;

  navigator.clipboard.writeText(sql).then(() => {
    showToast("SQL schema copied to clipboard! Paste in Supabase SQL Editor.", "success");
  }).catch(() => {
    showToast("Failed to copy automatically", "warning");
  });
}

// Auto-run auth guard
document.addEventListener("DOMContentLoaded", () => {
  initAuthGuard();
});
