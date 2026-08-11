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
    await Promise.all([refreshSummary(), refreshCategories(), refreshTransactions()]);
  } catch (err) {
    console.error(err);
  }
}

refreshAll();
