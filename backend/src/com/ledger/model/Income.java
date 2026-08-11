package com.ledger.model;

import com.ledger.util.Json;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Represents money entering the user's financial position.
 * Examples of "type": Salary, Gift, Freelance, Scholarship, Other.
 */
public class Income extends Transaction {

    private final String type;

    public Income(String type, BigDecimal amount, LocalDate date) {
        super(amount, date);
        this.type = type;
    }

    public String getType() {
        return type;
    }

    @Override
    public String getTypeLabel() {
        return "Income";
    }

    @Override
    public String toJson() {
        return "{"
                + "\"kind\":\"Income\","
                + "\"type\":\"" + Json.escape(type) + "\","
                + "\"amount\":" + getAmount().toPlainString() + ","
                + "\"date\":\"" + getDate() + "\""
                + "}";
    }
}
