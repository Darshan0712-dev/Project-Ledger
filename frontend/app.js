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

// ---------- Form submissions ----------

document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("expense-error");
  errorEl.textContent = "";
  try {
    await postJson(API.expense, {
      category: document.getElementById("expense-category").value,
      description: document.getElementById("expense-description").value,
      amount: document.getElementById("expense-amount").value,
      date: document.getElementById("expense-date").value,
    });
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
  try {
    await postJson(API.income, {
      type: document.getElementById("income-type").value,
      amount: document.getElementById("income-amount").value,
      date: document.getElementById("income-date").value,
    });
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
  try {
    await postJson(API.investment, {
      type: document.getElementById("investment-type").value,
      amount: document.getElementById("investment-amount").value,
      date: document.getElementById("investment-date").value,
    });
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
      </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function refreshAll() {
  try {
    await Promise.all([
      refreshSummary(),
      refreshCategories(),
      refreshTransactions(),
      loadExpenseHistorySuggestions(),
    ]);
  } catch (err) {
    console.error(err);
  }
}

refreshAll();
