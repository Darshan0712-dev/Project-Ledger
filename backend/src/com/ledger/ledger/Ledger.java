package com.ledger.ledger;

import com.ledger.model.Expense;
import com.ledger.model.Income;
import com.ledger.model.Investment;
import com.ledger.model.Transaction;
import com.ledger.util.ValidationException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Ledger is the "brain" of the application. It owns the single list of
 * transactions and is responsible for:
 *   - adding new transactions (after validating them)
 *   - retrieving transactions (all, or filtered by month)
 *   - calculating totals and summaries
 *
 * It knows nothing about HTTP, JSON requests, or the browser. That
 * separation means the same Ledger class could be reused by a completely
 * different frontend (a command-line tool, a mobile app, etc.) without
 * any changes.
 */
public class Ledger {

    private final List<Transaction> transactions = new ArrayList<>();

    // ---------- Adding transactions ----------

    public Income addIncome(String type, BigDecimal amount, LocalDate date) {
        validateCommon(amount, date);
        validateNotBlank(type, "Income type");

        Income income = new Income(type.trim(), amount, date);
        transactions.add(income);
        return income;
    }

    public Expense addExpense(String category, String description, BigDecimal amount, LocalDate date) {
        validateCommon(amount, date);
        validateNotBlank(category, "Category");
        validateNotBlank(description, "Description");

        Expense expense = new Expense(category.trim(), description.trim(), amount, date);
        transactions.add(expense);
        return expense;
    }

    public Investment addInvestment(String type, BigDecimal amount, LocalDate date) {
        validateCommon(amount, date);
        validateNotBlank(type, "Investment type");

        Investment investment = new Investment(type.trim(), amount, date);
        transactions.add(investment);
        return investment;
    }

    // ---------- Validation ----------

    private void validateCommon(BigDecimal amount, LocalDate date) {
        if (amount == null) {
            throw new ValidationException("Amount is required.");
        }
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ValidationException("Amount must be greater than zero.");
        }
        if (date == null) {
            throw new ValidationException("Date is required.");
        }
        if (date.isAfter(LocalDate.now())) {
            throw new ValidationException("Date cannot be in the future.");
        }
    }

    private void validateNotBlank(String value, String fieldName) {
        if (value == null || value.trim().isEmpty()) {
            throw new ValidationException(fieldName + " is required.");
        }
    }

    // ---------- Retrieving transactions ----------

    /**
     * Returns all transactions, most recent first.
     */
    public List<Transaction> getAllTransactions() {
        List<Transaction> sorted = new ArrayList<>(transactions);
        sorted.sort(Comparator.comparing(Transaction::getDate).reversed());
        return sorted;
    }

    /**
     * Returns transactions that fall within the given month, most recent first.
     * If month is null, returns all transactions (same as getAllTransactions()).
     */
    public List<Transaction> getTransactionsForMonth(YearMonth month) {
        if (month == null) {
            return getAllTransactions();
        }
        List<Transaction> filtered = new ArrayList<>();
        for (Transaction t : transactions) {
            if (YearMonth.from(t.getDate()).equals(month)) {
                filtered.add(t);
            }
        }
        filtered.sort(Comparator.comparing(Transaction::getDate).reversed());
        return filtered;
    }

    // ---------- Summaries ----------

    /**
     * Simple holder for the four headline numbers shown on the dashboard.
     * Available money = Income - Expenses - Investments.
     * (Investments are money leaving the "available" pool, even though
     * they are not treated as expenses - see product decision #11.)
     */
    public static class Summary {
        public final BigDecimal totalIncome;
        public final BigDecimal totalExpenses;
        public final BigDecimal totalInvestments;
        public final BigDecimal availableMoney;

        public Summary(BigDecimal totalIncome, BigDecimal totalExpenses, BigDecimal totalInvestments) {
            this.totalIncome = totalIncome;
            this.totalExpenses = totalExpenses;
            this.totalInvestments = totalInvestments;
            this.availableMoney = totalIncome.subtract(totalExpenses).subtract(totalInvestments);
        }

        public String toJson() {
            return "{"
                    + "\"totalIncome\":" + totalIncome.toPlainString() + ","
                    + "\"totalExpenses\":" + totalExpenses.toPlainString() + ","
                    + "\"totalInvestments\":" + totalInvestments.toPlainString() + ","
                    + "\"availableMoney\":" + availableMoney.toPlainString()
                    + "}";
        }
    }

    public Summary calculateSummary(YearMonth month) {
        BigDecimal income = BigDecimal.ZERO;
        BigDecimal expenses = BigDecimal.ZERO;
        BigDecimal investments = BigDecimal.ZERO;

        for (Transaction t : getTransactionsForMonth(month)) {
            if (t instanceof Income) {
                income = income.add(t.getAmount());
            } else if (t instanceof Expense) {
                expenses = expenses.add(t.getAmount());
            } else if (t instanceof Investment) {
                investments = investments.add(t.getAmount());
            }
        }

        return new Summary(income, expenses, investments);
    }

    /**
     * Returns total expense amount grouped by category, for the given month.
     * Uses a LinkedHashMap so categories appear in first-seen order.
     */
    public Map<String, BigDecimal> calculateCategoryTotals(YearMonth month) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (Transaction t : getTransactionsForMonth(month)) {
            if (t instanceof Expense expense) {
                totals.merge(expense.getCategory(), expense.getAmount(), BigDecimal::add);
            }
        }
        return totals;
    }
}
