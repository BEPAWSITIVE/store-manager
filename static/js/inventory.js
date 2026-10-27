/**
 * StoreScan AI - Mobile-First Stock Manager & Inventory Controller
 */

let allInventory = [];
let searchTimeout = null;

function initInventoryPage() {
  fetchInventoryStats();
  loadInventory();

  const urlParams = new URLSearchParams(window.location.search);
  const highlightId = urlParams.get("highlight");
  if (highlightId) {
    setTimeout(() => {
      highlightRow(highlightId);
    }, 400);
  }
}

async function fetchInventoryStats() {
  try {
    const res = await fetch("/api/inventory/stats");
    const data = await res.json();
    if (data.success && data.stats) {
      const s = data.stats;
      const elUnits = document.getElementById("statTotalUnits");
      const elSkus = document.getElementById("statTotalSkus");
      const elLow = document.getElementById("statLowStock");
      const elOut = document.getElementById("statOutOfStock");
      const elVal = document.getElementById("statTotalValuation");

      if (elUnits) elUnits.innerText = (s.total_units || 0).toLocaleString();
      if (elSkus) elSkus.innerText = (s.total_skus || 0).toLocaleString();
      if (elLow) elLow.innerText = s.low_stock_count || 0;
      if (elOut) elOut.innerText = s.out_of_stock_count || 0;
      if (elVal) elVal.innerText = `₹${(s.total_value || 0).toLocaleString()}`;

      const catSelect = document.getElementById("filterCategory");
      if (catSelect && s.categories) {
        const current = catSelect.value;
        catSelect.innerHTML = `<option value="all">All Categories</option>`;
        s.categories.forEach(cat => {
          const opt = document.createElement("option");
          opt.value = cat;
          opt.innerText = cat;
          if (cat === current) opt.selected = true;
          catSelect.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.error("Stats load failed", err);
  }
}

async function loadInventory() {
  const searchInput = document.getElementById("inventorySearchInput");
  const search = searchInput ? searchInput.value.trim() : "";
  const catSelect = document.getElementById("filterCategory");
  const category = catSelect ? catSelect.value : "all";

  const container = document.getElementById("mobileProductsList");
  const emptyNotice = document.getElementById("inventoryEmptyNotice");

  try {
    const query = new URLSearchParams({
      search: search,
      category: category,
      status: window.activeStatusFilter || "all",
      sort_by: "updated_at"
    });

    const res = await fetch(`/api/inventory?${query.toString()}`);
    const data = await res.json();

    if (data.success) {
      allInventory = data.products || [];
      renderMobileProducts(allInventory);
    }
  } catch (err) {
    showToast("Failed to fetch inventory", "error");
  }
}

function renderMobileProducts(products) {
  const container = document.getElementById("mobileProductsList");
  const emptyNotice = document.getElementById("inventoryEmptyNotice");

  if (!products || products.length === 0) {
    if (container) container.innerHTML = "";
    if (emptyNotice) emptyNotice.classList.remove("hidden");
    return;
  }

  if (emptyNotice) emptyNotice.classList.add("hidden");

  container.innerHTML = products.map(p => {
    // Expiry badge
    let expiryBadge = `<span class="text-slate-400 text-[10px]">No expiry</span>`;
    if (p.expiry_date) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const exp = new Date(p.expiry_date);
      const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        expiryBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200">EXPIRED</span>`;
      } else if (diffDays <= 30) {
        expiryBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">${diffDays}d left</span>`;
      } else {
        expiryBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">${p.expiry_date}</span>`;
      }
    }

    const defaultSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='7' width='20' height='14' rx='2' ry='2'></rect><path d='M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'></path></svg>";
    const thumb = (p.primary_image && p.primary_image !== "/static/uploads/store_shelf_preview.jpg") ? p.primary_image : defaultSvg;
    const isLow = p.quantity <= (p.min_stock_alert || 5);

    return `
      <div id="row-prod-${p.id}" class="p-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm transition-all relative">
        <div class="flex items-start space-x-3">
          <!-- Thumbnail -->
          <div onclick="openPhotosModal(${p.id})" class="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 cursor-pointer relative shadow-inner">
            <img src="${thumb}" alt="${p.name}" class="w-full h-full object-cover">
          </div>

          <!-- Product Details -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between">
              <h3 class="font-bold text-slate-900 text-xs truncate max-w-[160px] md:max-w-none">${p.name}</h3>
              <div class="text-right">
                <div class="text-xs font-black text-slate-900">₹${(p.mrp || 0).toLocaleString()}</div>
              </div>
            </div>

            <div class="flex items-center space-x-1.5 text-[10px] text-slate-500 mt-0.5">
              <span class="font-bold text-[#2563eb]">${p.brand || 'Retail'}</span>
              <span>•</span>
              <span class="truncate">${p.category || 'General'}</span>
            </div>

            <div class="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-50">
              <!-- Location & Expiry -->
              <div class="flex items-center space-x-1.5">
                <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[9px] font-semibold flex items-center">
                  <i data-lucide="map-pin" class="w-2.5 h-2.5 mr-1 text-slate-400"></i>
                  ${p.location || 'Shelf'}
                </span>
                ${expiryBadge}
              </div>

              <!-- Quantity Steppers -->
              <div class="flex items-center space-x-1">
                <button onclick="inlineAdjustStock(${p.id}, -1)" class="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center active:scale-95">-</button>
                <span id="qty-val-${p.id}" class="text-xs font-black w-7 text-center ${isLow ? 'text-amber-600' : 'text-slate-900'}">${p.quantity}</span>
                <button onclick="inlineAdjustStock(${p.id}, 1)" class="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center active:scale-95">+</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Card Actions -->
        <div class="flex items-center justify-end space-x-2 mt-2 pt-2 border-t border-slate-100/60 text-[10px]">
          <button onclick="openPhotosModal(${p.id})" class="text-blue-600 font-bold hover:underline flex items-center">
            <i data-lucide="image" class="w-3 h-3 mr-1"></i> Photos
          </button>
          <span class="text-slate-300">•</span>
          <button onclick="openEditModal(${p.id})" class="text-slate-600 font-semibold hover:text-slate-900 flex items-center">
            <i data-lucide="edit" class="w-3 h-3 mr-1"></i> Edit
          </button>
          <span class="text-slate-300">•</span>
          <button onclick="confirmDeleteProduct(${p.id}, '${escapeHtml(p.name)}')" class="text-rose-500 font-semibold hover:text-rose-700 flex items-center">
            <i data-lucide="trash-2" class="w-3 h-3 mr-1"></i> Delete
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadInventory();
  }, 250);
}

function filterByStatus(statusName) {
  window.activeStatusFilter = statusName;
  loadInventory();
}

function applyFilters() {
  loadInventory();
}

async function inlineAdjustStock(productId, delta) {
  try {
    const res = await fetch(`/api/inventory/${productId}/adjust-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta: delta, reason: "Mobile Quick Adjust" })
    });
    const data = await res.json();
    if (data.success) {
      const qtyEl = document.getElementById(`qty-val-${productId}`);
      if (qtyEl) {
        qtyEl.innerText = data.new_quantity;
        qtyEl.classList.add("scale-125", "text-blue-600");
        setTimeout(() => {
          qtyEl.classList.remove("scale-125", "text-blue-600");
        }, 200);
      }
      fetchInventoryStats();
    }
  } catch (err) {
    showToast("Error updating stock", "error");
  }
}

function highlightRow(productId) {
  const card = document.getElementById(`row-prod-${productId}`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("ring-2", "ring-blue-500", "bg-blue-50/50");
    setTimeout(() => {
      card.classList.remove("ring-2", "ring-blue-500", "bg-blue-50/50");
    }, 2500);
  }
}

function openPhotosModal(productId) {
  const prod = allInventory.find(p => p.id === productId);
  if (!prod) return;

  const modal = document.getElementById("photosModal");
  document.getElementById("photosModalTitle").innerText = prod.name;
  document.getElementById("photosModalSubtitle").innerText = `${prod.brand || ''} • Rack: ${prod.location || 'Shelf'}`;

  const mainImg = document.getElementById("photosModalMainImg");
  const mainLabel = document.getElementById("photosModalMainLabel");
  const strip = document.getElementById("photosModalThumbStrip");

  const photos = [];
  if (prod.primary_image) {
    photos.push({ label: "Front Angle", url: prod.primary_image });
  }
  if (prod.angle_images && Array.isArray(prod.angle_images)) {
    prod.angle_images.forEach((img, i) => {
      if (img !== prod.primary_image) {
        photos.push({ label: `Angle #${i+1}`, url: img });
      }
    });
  }
  if (prod.rack_image) {
    photos.push({ label: `Rack Count (${prod.rack_box_count || prod.quantity} Boxes)`, url: prod.rack_image });
  }

  if (photos.length === 0) {
    if (prod.primary_image && prod.primary_image !== "/static/uploads/store_shelf_preview.jpg") {
      photos.push({ label: "Product Photo", url: prod.primary_image });
    } else {
      const defaultSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='7' width='20' height='14' rx='2' ry='2'></rect><path d='M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'></path></svg>";
      photos.push({ label: "Product Photo", url: defaultSvg });
    }
  }

  mainImg.src = photos[0].url;
  mainLabel.innerText = photos[0].label;

  strip.innerHTML = photos.map((p, i) => `
    <div onclick="switchModalPhoto('${p.url}', '${escapeHtml(p.label)}')" class="w-14 h-14 rounded-xl bg-slate-900 border border-slate-200 overflow-hidden flex-shrink-0 cursor-pointer">
      <img src="${p.url}" class="w-full h-full object-cover">
    </div>
  `).join("");

  modal.classList.remove("hidden");
}

function switchModalPhoto(url, label) {
  const mainImg = document.getElementById("photosModalMainImg");
  const mainLabel = document.getElementById("photosModalMainLabel");
  if (mainImg) mainImg.src = url;
  if (mainLabel) mainLabel.innerText = label;
}

function closePhotosModal() {
  const modal = document.getElementById("photosModal");
  if (modal) modal.classList.add("hidden");
}

function openEditModal(productId) {
  const prod = allInventory.find(p => p.id === productId);
  if (!prod) return;

  document.getElementById("editProductId").value = prod.id;
  document.getElementById("editName").value = prod.name;
  document.getElementById("editBrand").value = prod.brand || "";
  document.getElementById("editQuantity").value = prod.quantity;
  document.getElementById("editLocation").value = prod.location || "";
  document.getElementById("editExpiry").value = prod.expiry_date || "";
  document.getElementById("editMrp").value = prod.mrp || 0;

  document.getElementById("editProductModal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("editProductModal").classList.add("hidden");
}

async function handleEditFormSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("editProductId").value;

  const payload = {
    name: document.getElementById("editName").value.trim(),
    brand: document.getElementById("editBrand").value.trim(),
    quantity: parseInt(document.getElementById("editQuantity").value) || 0,
    location: document.getElementById("editLocation").value.trim(),
    expiry_date: document.getElementById("editExpiry").value,
    mrp: parseFloat(document.getElementById("editMrp").value) || 0
  };

  try {
    const res = await fetch(`/api/inventory/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast("Stock updated", "success");
      closeEditModal();
      loadInventory();
      fetchInventoryStats();
    }
  } catch (err) {
    showToast("Update failed", "error");
  }
}

async function confirmDeleteProduct(productId, name) {
  if (!confirm(`Delete "${name}" from stock?`)) return;

  try {
    const res = await fetch(`/api/inventory/${productId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      showToast("Item deleted", "info");
      loadInventory();
      fetchInventoryStats();
    }
  } catch (err) {
    showToast("Delete failed", "error");
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
