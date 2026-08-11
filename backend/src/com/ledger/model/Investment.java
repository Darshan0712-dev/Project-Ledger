package com.ledger.model;

import com.ledger.util.Json;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Represents money intentionally moved toward an asset.
 * Examples of "type": Stock, Mutual Fund, FD, Other.
 * No live pricing, valuation, or profit/loss logic - that belongs to a future version.
 */
public class Investment extends Transaction {

    private final String type;

    public Investment(String type, BigDecimal amount, LocalDate date) {
        super(amount, date);
        this.type = type;
    }

    public String getType() {
        return type;
    }

    @Override
    public String getTypeLabel() {
        return "Investment";
    }

    @Override
    public String toJson() {
        return "{"
                + "\"kind\":\"Investment\","
                + "\"type\":\"" + Json.escape(type) + "\","
                + "\"amount\":" + getAmount().toPlainString() + ","
                + "\"date\":\"" + getDate() + "\""
                + "}";
    }
}
