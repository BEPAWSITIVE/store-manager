/**
 * StoreScan AI - Billing & POS Web App Controller
 * Directly integrated with Supabase stock & inventory
 */

let allBillingProducts = [];
let filteredBillingProducts = [];
let currentCart = []; // [{ product_id, name, price, quantity, max_stock, barcode, image }]
let currentPaymentMode = "Cash";
let isCartDrawerOpen = false;
let currentInvoiceData = null;

async function initBillingPOS() {
  await fetchBillingCatalog();
  calculateBillTotals();
}

async function fetchBillingCatalog() {
  const listContainer = document.getElementById("billingProductList");
  try {
    const res = await fetch("/api/billing/products");
    const data = await res.json();
    if (data.success && Array.isArray(data.products)) {
      allBillingProducts = data.products;
      filteredBillingProducts = [...allBillingProducts];
      renderBillingCatalog();
    } else {
      if (listContainer) {
        listContainer.innerHTML = `<div class="text-center py-8 text-xs text-slate-400">No products available in stock.</div>`;
      }
    }
  } catch (err) {
    console.error("Error fetching billing catalog:", err);
    if (listContainer) {
      listContainer.innerHTML = `<div class="text-center py-8 text-xs text-rose-500">Failed to load stock. Please check database connection.</div>`;
    }
  }
}

function renderBillingCatalog() {
  const container = document.getElementById("billingProductList");
  if (!container) return;

  if (filteredBillingProducts.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-slate-400 text-xs">
        <i data-lucide="package-search" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
        No matching products found in stock.
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = filteredBillingProducts.map(prod => {
    const qty = parseInt(prod.quantity) || 0;
    const isOut = qty <= 0;
    const isLow = qty > 0 && qty <= (prod.min_stock_alert || 5);

    let stockBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800">${qty} in stock</span>`;
    if (isOut) {
      stockBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-red-100 text-red-800">Out of Stock</span>`;
    } else if (isLow) {
      stockBadge = `<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800">${qty} left (Low)</span>`;
    }

    const imgUrl = prod.primary_image || "/static/uploads/store_shelf_preview.jpg";

    return `
      <div class="p-3 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-between space-x-3 transition-all hover:shadow-md">
        <div class="flex items-center space-x-3 flex-1 min-w-0">
          <img src="${imgUrl}" alt="${prod.name}" class="w-12 h-12 rounded-xl object-cover border border-slate-100 flex-shrink-0 bg-slate-50">
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-bold text-slate-900 truncate leading-snug">${prod.name}</h4>
            <div class="flex items-center space-x-1.5 mt-0.5 text-[10px] text-slate-500">
              <span class="font-semibold text-slate-700">${prod.brand || "General"}</span>
              <span>•</span>
              <span>${prod.net_weight || ""}</span>
            </div>
            <div class="flex items-center space-x-2 mt-1">
              <span class="text-xs font-black text-[#2563eb]">₹${parseFloat(prod.mrp || 0).toFixed(2)}</span>
              ${stockBadge}
            </div>
          </div>
        </div>

        <button type="button" 
          onclick="addToCart(${prod.id})" 
          ${isOut ? "disabled" : ""} 
          class="w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all ${
            isOut 
              ? "bg-slate-100 text-slate-300 cursor-not-allowed" 
              : "bg-blue-50 text-[#2563eb] hover:bg-[#2563eb] hover:text-white active:scale-95 shadow-sm"
          }"
          title="Add to Bill">
          <i data-lucide="plus" class="w-4 h-4 stroke-[2.5]"></i>
        </button>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

function handleBillingSearch(event) {
  const query = event.target.value.toLowerCase().trim();
  if (!query) {
    filteredBillingProducts = [...allBillingProducts];
  } else {
    filteredBillingProducts = allBillingProducts.filter(p => 
      (p.name || "").toLowerCase().includes(query) ||
      (p.brand || "").toLowerCase().includes(query) ||
      (p.barcode || "").toLowerCase().includes(query) ||
      (p.category || "").toLowerCase().includes(query)
    );
  }
  renderBillingCatalog();
}

function filterBillingCategory(category) {
  document.querySelectorAll(".category-chip").forEach(btn => {
    btn.classList.remove("active", "bg-[#2563eb]", "text-white");
    btn.classList.add("bg-slate-100", "text-slate-600");
  });
  
  event.target.classList.add("active", "bg-[#2563eb]", "text-white");
  event.target.classList.remove("bg-slate-100", "text-slate-600");

  if (category === "All") {
    filteredBillingProducts = [...allBillingProducts];
  } else {
    filteredBillingProducts = allBillingProducts.filter(p => (p.category || "").toLowerCase() === category.toLowerCase());
  }
  renderBillingCatalog();
}

function addToCart(productId) {
  const product = allBillingProducts.find(p => p.id === productId);
  if (!product) return;

  const availableStock = parseInt(product.quantity) || 0;
  if (availableStock <= 0) {
    showToast("This item is currently out of stock", "warning");
    return;
  }

  const existing = currentCart.find(item => item.product_id === productId);
  if (existing) {
    if (existing.quantity >= availableStock) {
      showToast(`Only ${availableStock} units available in stock`, "warning");
      return;
    }
    existing.quantity += 1;
    existing.total = existing.quantity * existing.price;
  } else {
    currentCart.push({
      product_id: product.id,
      name: product.name,
      price: parseFloat(product.mrp || 0),
      quantity: 1,
      total: parseFloat(product.mrp || 0),
      max_stock: availableStock,
      barcode: product.barcode || "",
      image: product.primary_image || "/static/uploads/store_shelf_preview.jpg"
    });
  }

  showToast(`Added ${product.name}`, "info");
  renderCartDrawer();
  calculateBillTotals();
}

function adjustCartQty(productId, delta) {
  const item = currentCart.find(i => i.product_id === productId);
  if (!item) return;

  const newQty = item.quantity + delta;
  if (newQty <= 0) {
    currentCart = currentCart.filter(i => i.product_id !== productId);
  } else if (newQty > item.max_stock) {
    showToast(`Maximum stock available: ${item.max_stock}`, "warning");
    return;
  } else {
    item.quantity = newQty;
    item.total = item.quantity * item.price;
  }

  renderCartDrawer();
  calculateBillTotals();
}

function renderCartDrawer() {
  const list = document.getElementById("cartItemsList");
  const countBadge = document.getElementById("cartCountBadge");
  const summaryText = document.getElementById("cartItemsSummaryText");

  const totalCount = currentCart.reduce((sum, i) => sum + i.quantity, 0);
  if (countBadge) countBadge.innerText = totalCount;
  if (summaryText) summaryText.innerText = `${totalCount} Item${totalCount === 1 ? '' : 's'} in Cart`;

  if (!list) return;

  if (currentCart.length === 0) {
    list.innerHTML = `<div class="text-center py-4 text-xs text-slate-400 font-medium">No items added to bill yet.</div>`;
    return;
  }

  list.innerHTML = currentCart.map(item => `
    <div class="p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-between space-x-2">
      <div class="flex-1 min-w-0">
        <h5 class="text-xs font-bold text-slate-900 truncate">${item.name}</h5>
        <div class="text-[10px] text-slate-500 font-medium">₹${item.price.toFixed(2)} / unit</div>
      </div>

      <div class="flex items-center space-x-2">
        <div class="flex items-center space-x-1.5 bg-slate-100 rounded-lg p-0.5">
          <button type="button" onclick="adjustCartQty(${item.product_id}, -1)" class="w-6 h-6 rounded bg-white text-slate-800 font-black text-xs flex items-center justify-center hover:bg-slate-200">-</button>
          <span class="w-5 text-center text-xs font-bold text-slate-900">${item.quantity}</span>
          <button type="button" onclick="adjustCartQty(${item.product_id}, 1)" class="w-6 h-6 rounded bg-white text-slate-800 font-black text-xs flex items-center justify-center hover:bg-slate-200">+</button>
        </div>

        <span class="w-16 text-right text-xs font-black text-slate-900">₹${item.total.toFixed(2)}</span>

        <button type="button" onclick="adjustCartQty(${item.product_id}, -9999)" class="text-slate-400 hover:text-red-500 p-1" title="Remove">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join("");

  if (window.lucide) lucide.createIcons();
}

function calculateBillTotals() {
  const subtotal = currentCart.reduce((sum, item) => sum + item.total, 0);
  const discountInput = document.getElementById("billDiscountInput");
  const discount = Math.max(0, parseFloat(discountInput ? discountInput.value : 0) || 0);
  
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * 0.05; // 5% GST
  const grandTotal = taxable + tax;

  const subtotalEl = document.getElementById("billSubtotalText");
  const taxEl = document.getElementById("billTaxText");
  const grandTotalEl = document.getElementById("billGrandTotalText");
  const bottomTotalEl = document.getElementById("cartBottomTotalText");

  if (subtotalEl) subtotalEl.innerText = `₹${subtotal.toFixed(2)}`;
  if (taxEl) taxEl.innerText = `₹${tax.toFixed(2)}`;
  if (grandTotalEl) grandTotalEl.innerText = `₹${grandTotal.toFixed(2)}`;
  if (bottomTotalEl) bottomTotalEl.innerText = `₹${grandTotal.toFixed(2)}`;
}

function toggleCartDrawer() {
  if (window.innerWidth >= 768) return; // Permanently open on desktop/laptop
  const drawer = document.getElementById("billingCartDrawer");
  const chevron = document.getElementById("cartDrawerChevron");
  if (!drawer) return;

  isCartDrawerOpen = !isCartDrawerOpen;
  if (isCartDrawerOpen) {
    drawer.classList.remove("translate-y-[calc(100%-68px)]");
    drawer.classList.add("translate-y-0");
    if (chevron) chevron.style.transform = "rotate(180deg)";
  } else {
    drawer.classList.add("translate-y-[calc(100%-68px)]");
    drawer.classList.remove("translate-y-0");
    if (chevron) chevron.style.transform = "rotate(0deg)";
  }
}

function selectPaymentMode(mode) {
  currentPaymentMode = mode;
  document.querySelectorAll(".pay-mode-btn").forEach(b => {
    b.classList.remove("active", "border-blue-500", "bg-blue-50", "text-blue-700");
    b.classList.add("border-slate-200", "bg-white", "text-slate-700");
  });

  const activeId = mode === "Cash" ? "payModeCash" : mode === "Card" ? "payModeCard" : "payModeUpi";
  const btn = document.getElementById(activeId);
  if (btn) {
    btn.classList.add("active", "border-blue-500", "bg-blue-50", "text-blue-700");
    btn.classList.remove("border-slate-200", "bg-white", "text-slate-700");
  }
}

function resetCurrentBill() {
  currentCart = [];
  const custName = document.getElementById("customerNameInput");
  const custMob = document.getElementById("customerMobileInput");
  const discountInput = document.getElementById("billDiscountInput");

  if (custName) custName.value = "";
  if (custMob) custMob.value = "";
  if (discountInput) discountInput.value = "0";

  renderCartDrawer();
  calculateBillTotals();
  showToast("Bill reset", "info");
}

async function promptBarcodeScan() {
  const code = prompt("Scan or enter product barcode (EAN-13 / UPC):");
  if (!code) return;

  try {
    const res = await fetch(`/api/billing/lookup-barcode/${encodeURIComponent(code.trim())}`);
    const data = await res.json();
    if (data.success && data.product) {
      addToCart(data.product.id);
      showToast(`Scanned: ${data.product.name}`, "success");
    } else {
      showToast(data.detail || "Barcode not found in inventory", "warning");
    }
  } catch (err) {
    showToast("Error looking up barcode", "error");
  }
}

async function submitCheckoutBill() {
  if (currentCart.length === 0) {
    showToast("Please add items to bill before checkout", "warning");
    return;
  }

  const btn = document.getElementById("checkoutBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Updating Stock in Supabase...</span>
    `;
  }

  const subtotal = currentCart.reduce((sum, item) => sum + item.total, 0);
  const discount = Math.max(0, parseFloat(document.getElementById("billDiscountInput")?.value || 0));
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * 0.05;
  const grandTotal = taxable + tax;

  const customerName = document.getElementById("customerNameInput")?.value.trim() || "Walk-in Customer";
  const customerMobile = document.getElementById("customerMobileInput")?.value.trim() || "";

  // Get active staff user
  let cashierEmail = "cashier@store.com";
  try {
    const user = JSON.parse(localStorage.getItem("store_auth_user") || "{}");
    if (user.email) cashierEmail = user.email;
  } catch (e) {}

  const payload = {
    customer_name: customerName,
    customer_mobile: customerMobile,
    items: currentCart.map(i => ({
      product_id: i.product_id,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      total: i.total,
      barcode: i.barcode
    })),
    subtotal: subtotal,
    discount_amount: discount,
    tax_amount: tax,
    grand_total: grandTotal,
    payment_mode: currentPaymentMode,
    cashier_email: cashierEmail
  };

  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success && data.invoice) {
      showToast("Stock deducted & invoice recorded!", "success");
      currentInvoiceData = data.invoice;
      renderInvoiceReceipt(data.invoice);
      // Refresh inventory catalog to show new stock counts
      await fetchBillingCatalog();
    } else {
      showToast(data.detail || "Checkout failed", "error");
    }
  } catch (err) {
    showToast("Network error processing bill", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Complete Bill & Deduct Stock</span><i data-lucide="check" class="w-5 h-5 stroke-[2.5]"></i>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function renderInvoiceReceipt(inv) {
  const modal = document.getElementById("invoiceReceiptModal");
  const area = document.getElementById("printableInvoiceArea");
  if (!modal || !area) return;

  const items = Array.isArray(inv.items) ? inv.items : [];
  const itemsHtml = items.map(it => `
    <div class="flex items-center justify-between py-1 text-xs border-b border-slate-100">
      <div class="flex-1 pr-2 truncate">
        <div class="font-bold text-slate-900">${it.name}</div>
        <div class="text-[10px] text-slate-500">${it.quantity} × ₹${parseFloat(it.price).toFixed(2)}</div>
      </div>
      <div class="font-black text-slate-900">₹${parseFloat(it.total).toFixed(2)}</div>
    </div>
  `).join("");

  area.innerHTML = `
    <div class="text-center pb-2 border-b border-slate-100">
      <div class="w-10 h-10 rounded-xl bg-blue-50 text-[#2563eb] flex items-center justify-center mx-auto mb-1">
        <i data-lucide="store" class="w-5 h-5"></i>
      </div>
      <h3 class="text-base font-black text-slate-900">STORE MANAGER RETAIL</h3>
      <p class="text-[10px] text-slate-500">Tax Invoice / Cash Memo</p>
      <div class="mt-1 inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-mono font-bold text-slate-800">
        ${inv.invoice_number}
      </div>
    </div>

    <div class="text-[10px] text-slate-600 space-y-0.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
      <div class="flex justify-between"><span>Date:</span> <span class="font-bold">${new Date().toLocaleString()}</span></div>
      <div class="flex justify-between"><span>Customer:</span> <span class="font-bold">${inv.customer_name}</span></div>
      ${inv.customer_mobile ? `<div class="flex justify-between"><span>Mobile:</span> <span class="font-bold">${inv.customer_mobile}</span></div>` : ''}
      <div class="flex justify-between"><span>Payment:</span> <span class="font-bold text-blue-600">${inv.payment_mode}</span></div>
    </div>

    <div class="space-y-1">
      <div class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Itemized Breakdown</div>
      ${itemsHtml}
    </div>

    <div class="p-2.5 rounded-xl bg-blue-50/80 border border-blue-100 text-xs space-y-1">
      <div class="flex justify-between text-slate-600"><span>Subtotal:</span> <span class="font-bold">₹${parseFloat(inv.subtotal).toFixed(2)}</span></div>
      ${inv.discount_amount > 0 ? `<div class="flex justify-between text-emerald-600"><span>Discount:</span> <span class="font-bold">-₹${parseFloat(inv.discount_amount).toFixed(2)}</span></div>` : ''}
      <div class="flex justify-between text-slate-600"><span>GST / Tax:</span> <span class="font-bold">₹${parseFloat(inv.tax_amount).toFixed(2)}</span></div>
      <div class="flex justify-between text-slate-900 pt-1 border-t border-blue-200 text-sm font-black">
        <span>Grand Total:</span>
        <span class="text-[#2563eb]">₹${parseFloat(inv.grand_total).toFixed(2)}</span>
      </div>
    </div>

    <div class="text-center text-[10px] text-slate-400 pt-1">
      Thank you for shopping with us! Please visit again.
    </div>
  `;

  modal.classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function closeInvoiceReceiptModal() {
  const modal = document.getElementById("invoiceReceiptModal");
  if (modal) modal.classList.add("hidden");
}

function printCurrentInvoice() {
  window.print();
}

async function openInvoiceHistoryModal() {
  const modal = document.getElementById("invoiceHistoryModal");
  const list = document.getElementById("invoiceHistoryList");
  if (!modal || !list) return;

  modal.classList.remove("hidden");
  list.innerHTML = `<div class="text-center py-6 text-xs text-slate-400">Loading bills history...</div>`;

  try {
    const res = await fetch("/api/billing/invoices?limit=25");
    const data = await res.json();
    if (data.success && data.invoices.length) {
      list.innerHTML = data.invoices.map(inv => `
        <div class="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-slate-900 font-mono">${inv.invoice_number}</div>
            <div class="text-[10px] text-slate-500">${inv.customer_name} • ${new Date(inv.created_at).toLocaleDateString()}</div>
            <div class="text-[9px] text-blue-600 font-bold">${inv.payment_mode}</div>
          </div>
          <div class="text-right">
            <div class="text-xs font-black text-slate-900">₹${parseFloat(inv.grand_total).toFixed(2)}</div>
            <button type="button" onclick='renderInvoiceReceipt(${JSON.stringify(inv)})' class="text-[10px] text-[#2563eb] font-bold hover:underline">View</button>
          </div>
        </div>
      `).join("");
    } else {
      list.innerHTML = `<div class="text-center py-6 text-xs text-slate-400">No invoices recorded yet.</div>`;
    }
  } catch (err) {
    list.innerHTML = `<div class="text-center py-6 text-xs text-red-500">Failed to load invoices.</div>`;
  }
}

function closeInvoiceHistoryModal() {
  const modal = document.getElementById("invoiceHistoryModal");
  if (modal) modal.classList.add("hidden");
}
