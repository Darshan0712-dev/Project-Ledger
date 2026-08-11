package com.ledger.model;

import com.ledger.util.Json;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Represents money spent on goods, services, or experiences.
 * Categorized (e.g. Food, Travel) with a short description (e.g. "Lunch").
 */
public class Expense extends Transaction {

    private final String category;
    private final String description;

    public Expense(String category, String description, BigDecimal amount, LocalDate date) {
        super(amount, date);
        this.category = category;
        this.description = description;
    }

    public String getCategory() {
        return category;
    }

    public String getDescription() {
        return description;
    }

    @Override
    public String getTypeLabel() {
        return "Expense";
    }

    @Override
    public String toJson() {
        return "{"
                + "\"kind\":\"Expense\","
                + "\"category\":\"" + Json.escape(category) + "\","
                + "\"description\":\"" + Json.escape(description) + "\","
                + "\"amount\":" + getAmount().toPlainString() + ","
                + "\"date\":\"" + getDate() + "\""
                + "}";
    }
}
