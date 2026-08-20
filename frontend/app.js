 // Project Ledger - frontend logic
//
// This file has one job: talk to the Java backend over fetch() and
// update the page with whatever comes back. There is no financial
// logic here at all - every calculation happens in Ledger.java.
// The frontend is intentionally "dumb": it displays, it doesn't decide.

const API = {
  income: "/api/income",
  expense: "/api/expense",
  investment: "/api/investment",
  transactions: "/api/transactions",
  summary: "/api/summary",
  categories: "/api/categories",
};

const monthInput = document.getElementById("month-input");

// ---------- Smart Expense Suggestions (V1.1 Milestone 1) ----------
//
// Two sources of suggestions:
//   1. The user's own expense history (learned from past entries) - always
//      shown first, since it reflects the user's real spending habits.
//   2. A small predefined list of common expenses - shown after history,
//      as a fallback for descriptions the user hasn't typed before.
//
// This is intentionally simple: no ML, no external API, no database.
// History comes from the existing /api/transactions endpoint (already
// built), filtered down to expenses on the client side. Nothing new
// was added to the backend for this feature.

const PREDEFINED_EXPENSE_SUGGESTIONS = [
  { description: "Petrol", category: "Travel" },
  {description:"Diesel",category:"Travel"},
  { description: "Lunch", category: "Food" },
  { description: "Bus", category: "Travel" },
  { description: "Coffee", category: "Food" },
  { description: "Groceries", category: "Food" },
  { description: "Movie", category: "Entertainment" },
  { description: "Electricity", category: "Bills" },
  { description: "Rent", category: "Bills" },
  { description: "Breakfast", category: "Food" },
  { description: "Dinner", category: "Food" },
  { description: "Taxi", category: "Travel" },
  { description: "Recharge", category: "Bills" },
  { description: "Internet", category: "Bills" },
  { description: "Medicine", category: "Other" },
];

// Populated from the user's transaction history. Each entry looks like
// { description: "Lunch", category: "Food" }. Kept de-duplicated by
// description (case-insensitive), most recent category wins.
let expenseHistorySuggestions = [];

const descriptionInput = document.getElementById("expense-description");
const categorySelect = document.getElementById("expense-category");
const suggestionsList = document.getElementById("expense-suggestions");

/**
 * Rebuilds expenseHistorySuggestions from ALL of the user's past expenses
 * (not just the currently selected month - history should span everything
 * they've ever entered, so a description typed in July still autocompletes
 * in August).
 */
async function loadExpenseHistorySuggestions() {
  try {
    const allTransactions = await getJson(API.transactions); // no ?month= => all transactions
    const seen = new Map(); // key: lowercase description -> {description, category}

    for (const t of allTransactions) {
      if (t.kind !== "Expense") continue;
      const key = t.description.trim().toLowerCase();
      if (!key) continue;
      // Transactions arrive most-recent-first, so the first time we see
      // a description is already its most recent category.
      if (!seen.has(key)) {
        seen.set(key, { description: t.description, category: t.category });
      }
    }

    expenseHistorySuggestions = Array.from(seen.values());
  } catch (err) {
    console.error("Could not load expense history for suggestions:", err);
    expenseHistorySuggestions = [];
  }
}

/**
 * Returns up to `limit` suggestions matching the given query.
 * History matches always come before predefined matches, per spec.
 * Matching is case-insensitive "starts with" (so "pe" matches "Petrol").
 */
function getMatchingSuggestions(query, limit = 6) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const historyMatches = expenseHistorySuggestions.filter((item) =>
    item.description.toLowerCase().startsWith(normalizedQuery)
  );

  const historyDescriptionsLower = new Set(
    historyMatches.map((item) => item.description.toLowerCase())
  );

  const predefinedMatches = PREDEFINED_EXPENSE_SUGGESTIONS.filter(
    (item) =>
      item.description.toLowerCase().startsWith(normalizedQuery) &&
      !historyDescriptionsLower.has(item.description.toLowerCase())
  );

  return [...historyMatches, ...predefinedMatches].slice(0, limit);
}

function renderSuggestions(matches) {
  if (matches.length === 0) {
    suggestionsList.innerHTML = "";
    suggestionsList.hidden = true;
    return;
  }

  suggestionsList.innerHTML = matches
    .map((item, index) => {
      const isHistory = expenseHistorySuggestions.some(
        (h) => h.description.toLowerCase() === item.description.toLowerCase()
      );
      const metaLabel = isHistory ? "Recent" : "Suggested";
      const metaClass = isHistory ? "suggestion-meta from-history" : "suggestion-meta";
      return `<li class="suggestion-item" data-index="${index}">
        <span class="suggestion-text">${escapeHtml(item.description)}</span>
        <span class="${metaClass}">${metaLabel}</span>
      </li>`;
    })
    .join("");

  suggestionsList.hidden = false;
  suggestionsList._matches = matches; // stash for click handling
}

function hideSuggestions() {
  suggestionsList.hidden = true;
  suggestionsList.innerHTML = "";
}

descriptionInput.addEventListener("input", () => {
  const matches = getMatchingSuggestions(descriptionInput.value);
  renderSuggestions(matches);
});

descriptionInput.addEventListener("focus", () => {
  if (descriptionInput.value.trim()) {
    renderSuggestions(getMatchingSuggestions(descriptionInput.value));
  }
});

// Use mousedown (fires before blur) so a click on a suggestion registers
// before the input loses focus and hides the list.
suggestionsList.addEventListener("mousedown", (e) => {
  const item = e.target.closest(".suggestion-item");
  if (!item) return;
  e.preventDefault();

  const index = Number(item.dataset.index);
  const matches = suggestionsList._matches || [];
  const chosen = matches[index];
  if (!chosen) return;

  descriptionInput.value = chosen.description;
  // Fill the category automatically when we know it (from history or
  // the predefined list). The user can still change it manually.
  if (chosen.category) {
    categorySelect.value = chosen.category;
  }
  hideSuggestions();
  descriptionInput.focus();
});

descriptionInput.addEventListener("blur", () => {
  // Small delay so the mousedown handler above still gets a chance to fire.
  setTimeout(hideSuggestions, 150);
});

descriptionInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideSuggestions();
  }
});

// ---------- Setup: default to current month, default date fields to today ----------

function todayIsoDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function currentYearMonth() {
  return todayIsoDate().slice(0, 7);
}

monthInput.value = currentYearMonth();
document.getElementById("expense-date").value = todayIsoDate();
document.getElementById("income-date").value = todayIsoDate();
document.getElementById("investment-date").value = todayIsoDate();

// ---------- Tabs ----------

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(button.dataset.tab).classList.add("active");
  });
});

// ---------- Edit / Delete Transactions (V1.2 Milestone 1) ----------
//
// Editing reuses the existing Add forms rather than introducing a
// separate edit page: clicking "Edit" on a transaction switches to that
// transaction's tab, fills the form with its current values, and swaps
// the form into an "editing" state (tab label + save button say "Edit"/
// "Update" instead of "Add"/"Save", and a Cancel option appears). Saving
// sends a PUT to /api/transactions/{id} instead of a POST to the normal
// add endpoint. Nothing about the Smart Suggestions wiring on the
// description field changes - it works the same whether the form is in
// add mode or edit mode.

// Holds whatever the transaction list last fetched, so clicking "Edit"
// can look up the full record locally without an extra network request.
let currentTransactions = [];

// Set to { id, kind } while a transaction is being edited, otherwise null.
let editingTransaction = null;

const expenseTabButton = document.querySelector('[data-tab="expense-form"]');
const incomeTabButton = document.querySelector('[data-tab="income-form"]');
const investmentTabButton = document.querySelector('[data-tab="investment-form"]');

const expenseSaveButton = document.querySelector("#expense-form .save-button");
const incomeSaveButton = document.querySelector("#income-form .save-button");
const investmentSaveButton = document.querySelector("#investment-form .save-button");

function activateTab(tabId) {
  document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add("active");
  document.getElementById(tabId).classList.add("active");
}

function showCancelEditButton(kind) {
  document.querySelectorAll(".cancel-edit-button").forEach((btn) => (btn.hidden = true));
  const idByKind = {
    Expense: "expense-cancel-edit",
    Income: "income-cancel-edit",
    Investment: "investment-cancel-edit",
  };
  const button = document.getElementById(idByKind[kind]);
  if (button) button.hidden = false;
}

function hideCancelEditButtons() {
  document.querySelectorAll(".cancel-edit-button").forEach((btn) => (btn.hidden = true));
}

/**
 * Populates the matching form with an existing transaction's values and
 * switches that form into "editing" mode.
 */
function enterEditMode(transaction) {
  editingTransaction = { id: transaction.id, kind: transaction.kind };

  if (transaction.kind === "Expense") {
    activateTab("expense-form");
    document.getElementById("expense-category").value = transaction.category;
    document.getElementById("expense-description").value = transaction.description;
    document.getElementById("expense-amount").value = transaction.amount;
    document.getElementById("expense-date").value = transaction.date;
    document.getElementById("expense-error").textContent = "";
    expenseTabButton.textContent = "Edit Expense";
    expenseSaveButton.textContent = "Update Expense";
  } else if (transaction.kind === "Income") {
    activateTab("income-form");
    document.getElementById("income-type").value = transaction.type;
    document.getElementById("income-amount").value = transaction.amount;
    document.getElementById("income-date").value = transaction.date;
    document.getElementById("income-error").textContent = "";
    incomeTabButton.textContent = "Edit Income";
    incomeSaveButton.textContent = "Update Income";
  } else if (transaction.kind === "Investment") {
    activateTab("investment-form");
    document.getElementById("investment-type").value = transaction.type;
    document.getElementById("investment-amount").value = transaction.amount;
    document.getElementById("investment-date").value = transaction.date;
    document.getElementById("investment-error").textContent = "";
    investmentTabButton.textContent = "Edit Investment";
    investmentSaveButton.textContent = "Update Investment";
  }

  showCancelEditButton(transaction.kind);
}

/**
 * Returns every form to normal "add" mode. Called after a successful
 * update and when the user clicks Cancel.
 */
function exitEditMode() {
  editingTransaction = null;
  expenseTabButton.textContent = "Add Expense";
  incomeTabButton.textContent = "Add Income";
  investmentTabButton.textContent = "Add Investment";
  expenseSaveButton.textContent = "Save Expense";
  incomeSaveButton.textContent = "Save Income";
  investmentSaveButton.textContent = "Save Investment";
  hideCancelEditButtons();
}

document.querySelectorAll(".cancel-edit-button").forEach((button) => {
  button.addEventListener("click", () => {
    exitEditMode();
  });
});

// Edit/Delete buttons are rendered fresh every time the transaction list
// refreshes, so we listen on the container once (event delegation)
// instead of re-attaching listeners after every render.
document.getElementById("transaction-list").addEventListener("click", async (e) => {
  const editButton = e.target.closest(".edit-transaction-button");
  const deleteButton = e.target.closest(".delete-transaction-button");

  if (editButton) {
    const id = Number(editButton.dataset.id);
    const transaction = currentTransactions.find((t) => t.id === id);
    if (transaction) {
      enterEditMode(transaction);
    }
    return;
  }

  if (deleteButton) {
    const id = Number(deleteButton.dataset.id);
    const confirmed = window.confirm("Delete this transaction?");
    if (!confirmed) return;

    try {
      await deleteJson(`${API.transactions}/${id}`);
      // If the transaction being edited was just deleted, back out of
      // edit mode instead of leaving a stale form open.
      if (editingTransaction && editingTransaction.id === id) {
        exitEditMode();
      }
      await refreshAll();
    } catch (err) {
      console.error("Could not delete transaction:", err);
      window.alert(err.message || "Could not delete the transaction.");
    }
  }
});

// ---------- Currency formatting ----------

function formatRupees(amount) {
  const num = Number(amount);
  return "\u20B9" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ---------- API helpers ----------

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

async function putJson(url, payload) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

async function deleteJson(url) {
  const response = await fetch(url, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

// ---------- Form submissions ----------

document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("expense-error");
  errorEl.textContent = "";
  const payload = {
    category: document.getElementById("expense-category").value,
    description: document.getElementById("expense-description").value,
    amount: document.getElementById("expense-amount").value,
    date: document.getElementById("expense-date").value,
  };
  try {
    if (editingTransaction && editingTransaction.kind === "Expense") {
      await putJson(`${API.transactions}/${editingTransaction.id}`, payload);
      exitEditMode();
    } else {
      await postJson(API.expense, payload);
    }
    document.getElementById("expense-description").value = "";
    document.getElementById("expense-amount").value = "";
    await refreshAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("income-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("income-error");
  errorEl.textContent = "";
  const payload = {
    type: document.getElementById("income-type").value,
    amount: document.getElementById("income-amount").value,
    date: document.getElementById("income-date").value,
  };
  try {
    if (editingTransaction && editingTransaction.kind === "Income") {
      await putJson(`${API.transactions}/${editingTransaction.id}`, payload);
      exitEditMode();
    } else {
      await postJson(API.income, payload);
    }
    document.getElementById("income-amount").value = "";
    await refreshAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("investment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("investment-error");
  errorEl.textContent = "";
  const payload = {
    type: document.getElementById("investment-type").value,
    amount: document.getElementById("investment-amount").value,
    date: document.getElementById("investment-date").value,
  };
  try {
    if (editingTransaction && editingTransaction.kind === "Investment") {
      await putJson(`${API.transactions}/${editingTransaction.id}`, payload);
      exitEditMode();
    } else {
      await postJson(API.investment, payload);
    }
    document.getElementById("investment-amount").value = "";
    await refreshAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

monthInput.addEventListener("change", refreshAll);

// ---------- Rendering ----------

async function refreshSummary() {
  const month = monthInput.value;
  const summary = await getJson(`${API.summary}?month=${month}`);
  document.getElementById("summary-income").textContent = formatRupees(summary.totalIncome);
  document.getElementById("summary-expenses").textContent = formatRupees(summary.totalExpenses);
  document.getElementById("summary-investments").textContent = formatRupees(summary.totalInvestments);
  document.getElementById("summary-available").textContent = formatRupees(summary.availableMoney);
}

async function refreshCategories() {
  const month = monthInput.value;
  const categories = await getJson(`${API.categories}?month=${month}`);
  const container = document.getElementById("category-list");
  const entries = Object.entries(categories);

  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-message">No expenses recorded for this month yet.</p>';
    return;
  }

  container.innerHTML = entries
    .map(
      ([category, amount]) =>
        `<div class="category-row"><span>${escapeHtml(category)}</span><span>${formatRupees(amount)}</span></div>`
    )
    .join("");
}

async function refreshTransactions() {
  const month = monthInput.value;
  const transactions = await getJson(`${API.transactions}?month=${month}`);
  currentTransactions = transactions; // keep for Edit lookups without a second fetch
  const container = document.getElementById("transaction-list");

  if (transactions.length === 0) {
    container.innerHTML = '<p class="empty-message">No transactions recorded for this month yet.</p>';
    return;
  }

  container.innerHTML = transactions
    .map((t) => {
      const detail = t.kind === "Expense" ? `${t.category} - ${t.description}` : t.type;
      return `<div class="transaction-row">
        <span class="transaction-kind ${t.kind}">${t.kind}</span>
        <span class="transaction-detail">${escapeHtml(detail)} &middot; ${t.date}</span>
        <span class="transaction-amount">${formatRupees(t.amount)}</span>
        <span class="transaction-actions">
          <button type="button" class="link-button edit-transaction-button" data-id="${t.id}">Edit</button>
          <button type="button" class="link-button delete-transaction-button" data-id="${t.id}">Delete</button>
        </span>
      </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Financial Insights (V1.1 Milestone 2) ----------
//
// This block is entirely additive and does not touch any of the Smart
// Expense Suggestions code above. It talks to one new backend endpoint,
// GET /api/insights?show=...&period=..., and renders whatever comes back
// as a small hand-drawn SVG chart. No charting library, no financial
// math here - the backend (Ledger.java) has already done every
// calculation; this code only draws shapes.

const CHART_COLORS = {
  expenses: "var(--expense)",
  income: "var(--income)",
  investments: "var(--investment)",
  available: "var(--available)",
  income_vs_expenses_income: "var(--income)",
  income_vs_expenses_expenses: "var(--expense)",
};

// A small calm, muted palette for pie-slice categories (cycled through).
const PIE_PALETTE = [
  "#2f7d5c", "#b5533c", "#3c5f8a", "#a3853f", "#7a5ea8", "#4a8f8b", "#a1685f", "#5c7a9e",
];

const insightsShowSelect = document.getElementById("insights-show");
const insightsPeriodSelect = document.getElementById("insights-period");
const insightsViewToggle = document.getElementById("insights-view-toggle");
const insightsChartContainer = document.getElementById("insights-chart-container");
const insightsErrorEl = document.getElementById("insights-error");

let currentInsightsView = "bar";
let lastInsightsResult = null;

/**
 * Given the current Show + Period selection, returns which view buttons
 * (bar/line/pie) are semantically valid, per the product rules:
 *   - Single-month category/type breakdowns: Bar or Pie (not Line).
 *   - Multi-month time series (including Available Money, which never
 *     has categories, and Income vs Expenses, which is always a
 *     two-series comparison): Bar or Line (not Pie).
 */
function getValidInsightViews(show, period) {
  if (show === "available" || show === "income_vs_expenses") {
    return ["bar", "line"];
  }
  if (period === "this_month") {
    return ["bar", "pie"];
  }
  return ["bar", "line"];
}

function updateInsightsViewButtons(validViews) {
  if (!validViews.includes(currentInsightsView)) {
    currentInsightsView = validViews[0];
  }
  insightsViewToggle.querySelectorAll(".view-button").forEach((button) => {
    const view = button.dataset.view;
    const allowed = validViews.includes(view);
    button.disabled = !allowed;
    button.classList.toggle("active", allowed && view === currentInsightsView);
  });
}

insightsViewToggle.querySelectorAll(".view-button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    currentInsightsView = button.dataset.view;
    insightsViewToggle.querySelectorAll(".view-button").forEach((b) => {
      b.classList.toggle("active", b === button);
    });
    if (lastInsightsResult) {
      renderInsightsChart(lastInsightsResult);
    }
  });
});

insightsShowSelect.addEventListener("change", loadInsights);
insightsPeriodSelect.addEventListener("change", loadInsights);

async function loadInsights() {
  const show = insightsShowSelect.value;
  const period = insightsPeriodSelect.value;

  updateInsightsViewButtons(getValidInsightViews(show, period));
  insightsErrorEl.textContent = "";
  insightsChartContainer.innerHTML = '<p class="empty-message">Loading...</p>';

  try {
    const result = await getJson(`/api/insights?show=${show}&period=${period}`);
    lastInsightsResult = result;
    renderInsightsChart(result);
  } catch (err) {
    console.error("Could not load financial insights:", err);
    lastInsightsResult = null;
    insightsChartContainer.innerHTML = "";
    insightsErrorEl.textContent = "Could not load insights right now. Please try again.";
  }
}

function renderInsightsChart(result) {
  if (!result || !result.data || result.data.length === 0) {
    insightsChartContainer.innerHTML = '<p class="empty-message">No data available for this period yet.</p>';
    return;
  }

  const show = insightsShowSelect.value;

  if (result.mode === "category") {
    const color = CHART_COLORS[show] || "var(--accent)";
    insightsChartContainer.innerHTML =
      currentInsightsView === "pie"
        ? buildPieChart(result.data, "label", "amount")
        : buildBarChart(result.data, "label", "amount", color);
  } else if (result.mode === "series") {
    const color = CHART_COLORS[show] || "var(--accent)";
    insightsChartContainer.innerHTML =
      currentInsightsView === "line"
        ? buildLineChart(result.data, "month", "amount", color)
        : buildBarChart(result.data, "month", "amount", color);
  } else if (result.mode === "compare") {
    insightsChartContainer.innerHTML =
      currentInsightsView === "line"
        ? buildCompareLineChart(result.data)
        : buildCompareBarChart(result.data);
  }
}

// ---------- Small SVG chart builders ----------
//
// These are deliberately simple: fixed viewBox, plain rects/lines/paths,
// no external dependency. They rely on the existing CSS custom properties
// (--income, --expense, etc.) so colors always match the rest of the app.

function truncateLabel(label, maxLen = 10) {
  const text = String(label);
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "\u2026" : text;
}

function buildBarChart(data, labelKey, valueKey, color) {
  const width = 640;
  const height = 260;
  const padding = 44;
  const maxValue = Math.max(...data.map((d) => Number(d[valueKey])), 1);
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(slot * 0.55, 56);

  let bars = "";
  data.forEach((d, i) => {
    const value = Number(d[valueKey]);
    const barHeight = maxValue > 0 ? (value / maxValue) * plotHeight : 0;
    const x = padding + i * slot + (slot - barWidth) / 2;
    const y = height - padding - barHeight;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" fill="${color}"></rect>`;
    bars += `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" class="chart-value-label">${escapeHtml(formatRupees(value))}</text>`;
    bars += `<text x="${(x + barWidth / 2).toFixed(1)}" y="${height - padding + 18}" text-anchor="middle" class="chart-axis-label">${escapeHtml(truncateLabel(d[labelKey]))}</text>`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="insights-svg" role="img" aria-label="Bar chart">
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis-line"></line>
    ${bars}
  </svg>`;
}

function buildLineChart(data, labelKey, valueKey, color) {
  const width = 640;
  const height = 260;
  const padding = 44;
  const maxValue = Math.max(...data.map((d) => Number(d[valueKey])), 1);
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const value = Number(d[valueKey]);
    const x = padding + (data.length > 1 ? i * step : plotWidth / 2);
    const y = height - padding - (maxValue > 0 ? (value / maxValue) * plotHeight : 0);
    return { x, y, value, label: d[labelKey] };
  });

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  let markers = "";
  points.forEach((p) => {
    markers += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${color}"></circle>`;
    markers += `<text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" text-anchor="middle" class="chart-value-label">${escapeHtml(formatRupees(p.value))}</text>`;
    markers += `<text x="${p.x.toFixed(1)}" y="${height - padding + 18}" text-anchor="middle" class="chart-axis-label">${escapeHtml(truncateLabel(p.label, 8))}</text>`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="insights-svg" role="img" aria-label="Line chart">
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis-line"></line>
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2"></polyline>
    ${markers}
  </svg>`;
}

function buildPieChart(data, labelKey, valueKey) {
  const size = 260;
  const radius = 90;
  const cx = size / 2;
  const cy = size / 2;
  const total = data.reduce((sum, d) => sum + Number(d[valueKey]), 0);

  let angle = -Math.PI / 2; // start at 12 o'clock
  let slices = "";
  let legend = "";

  data.forEach((d, i) => {
    const value = Number(d[valueKey]);
    const fraction = total > 0 ? value / total : 0;
    const sweep = fraction * 2 * Math.PI;
    const x1 = cx + radius * Math.cos(angle);
    const y1 = cy + radius * Math.sin(angle);
    angle += sweep;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const color = PIE_PALETTE[i % PIE_PALETTE.length];

    if (total > 0) {
      slices += `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${color}"></path>`;
    }

    const percent = total > 0 ? Math.round(fraction * 100) : 0;
    legend += `<span class="insights-legend-item">
      <span class="insights-legend-swatch" style="background:${color}"></span>
      ${escapeHtml(d[labelKey])} &middot; ${escapeHtml(formatRupees(value))} (${percent}%)
    </span>`;
  });

  return `<svg viewBox="0 0 ${size} ${size}" class="insights-svg" role="img" aria-label="Pie chart" style="max-width:300px;">
      ${slices}
    </svg>
    <div class="insights-legend">${legend}</div>`;
}

function buildCompareBarChart(data) {
  const width = 640;
  const height = 260;
  const padding = 44;
  const maxValue = Math.max(...data.flatMap((d) => [Number(d.income), Number(d.expenses)]), 1);
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(slot * 0.28, 34);
  const gapBetweenBars = 6;

  let bars = "";
  data.forEach((d, i) => {
    const groupCenter = padding + i * slot + slot / 2;
    const incomeHeight = maxValue > 0 ? (Number(d.income) / maxValue) * plotHeight : 0;
    const expenseHeight = maxValue > 0 ? (Number(d.expenses) / maxValue) * plotHeight : 0;

    const incomeX = groupCenter - barWidth - gapBetweenBars / 2;
    const expenseX = groupCenter + gapBetweenBars / 2;

    bars += `<rect x="${incomeX.toFixed(1)}" y="${(height - padding - incomeHeight).toFixed(1)}" width="${barWidth}" height="${incomeHeight.toFixed(1)}" rx="3" fill="${CHART_COLORS.income_vs_expenses_income}"></rect>`;
    bars += `<rect x="${expenseX.toFixed(1)}" y="${(height - padding - expenseHeight).toFixed(1)}" width="${barWidth}" height="${expenseHeight.toFixed(1)}" rx="3" fill="${CHART_COLORS.income_vs_expenses_expenses}"></rect>`;
    bars += `<text x="${groupCenter.toFixed(1)}" y="${height - padding + 18}" text-anchor="middle" class="chart-axis-label">${escapeHtml(truncateLabel(d.month, 8))}</text>`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="insights-svg" role="img" aria-label="Income vs expenses bar chart">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis-line"></line>
      ${bars}
    </svg>
    <div class="insights-legend">
      <span class="insights-legend-item"><span class="insights-legend-swatch" style="background:var(--income)"></span>Income</span>
      <span class="insights-legend-item"><span class="insights-legend-swatch" style="background:var(--expense)"></span>Expenses</span>
    </div>`;
}

function buildCompareLineChart(data) {
  const width = 640;
  const height = 260;
  const padding = 44;
  const maxValue = Math.max(...data.flatMap((d) => [Number(d.income), Number(d.expenses)]), 1);
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const incomePoints = [];
  const expensePoints = [];

  data.forEach((d, i) => {
    const x = padding + (data.length > 1 ? i * step : plotWidth / 2);
    incomePoints.push({ x, y: height - padding - (maxValue > 0 ? (Number(d.income) / maxValue) * plotHeight : 0) });
    expensePoints.push({ x, y: height - padding - (maxValue > 0 ? (Number(d.expenses) / maxValue) * plotHeight : 0) });
  });

  const incomeLine = incomePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const expenseLine = expensePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  let markers = "";
  incomePoints.forEach((p) => (markers += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--income)"></circle>`));
  expensePoints.forEach((p) => (markers += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--expense)"></circle>`));

  let labels = "";
  data.forEach((d, i) => {
    const x = padding + (data.length > 1 ? i * step : plotWidth / 2);
    labels += `<text x="${x.toFixed(1)}" y="${height - padding + 18}" text-anchor="middle" class="chart-axis-label">${escapeHtml(truncateLabel(d.month, 8))}</text>`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="insights-svg" role="img" aria-label="Income vs expenses line chart">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis-line"></line>
      <polyline points="${incomeLine}" fill="none" stroke="var(--income)" stroke-width="2"></polyline>
      <polyline points="${expenseLine}" fill="none" stroke="var(--expense)" stroke-width="2"></polyline>
      ${markers}
      ${labels}
    </svg>
    <div class="insights-legend">
      <span class="insights-legend-item"><span class="insights-legend-swatch" style="background:var(--income)"></span>Income</span>
      <span class="insights-legend-item"><span class="insights-legend-swatch" style="background:var(--expense)"></span>Expenses</span>
    </div>`;
}

async function refreshAll() {
  try {
    await Promise.all([
      refreshSummary(),
      refreshCategories(),
      refreshTransactions(),
      loadExpenseHistorySuggestions(),
      loadInsights(),
    ]);
  } catch (err) {
    console.error(err);
  }
}

refreshAll();
