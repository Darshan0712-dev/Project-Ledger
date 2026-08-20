package com.ledger.model;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Transaction is the common parent for Income, Expense, and Investment.
 * It holds only what every financial event has in common: an amount and a date.
 * It cannot be instantiated directly - only its subclasses can be created.
 */
public abstract class Transaction {

    private final int id;
    private final BigDecimal amount;
    private final LocalDate date;

    protected Transaction(int id, BigDecimal amount, LocalDate date) {
        this.id = id;
        this.amount = amount;
        this.date = date;
    }

    /**
     * Uniquely identifies this transaction for as long as it exists.
     * Assigned once by Ledger when the transaction is created, and never
     * changes - including across edits (an edit replaces the transaction's
     * data but keeps its id, so it stays the "same" transaction from the
     * user's point of view).
     */
    public int getId() {
        return id;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public LocalDate getDate() {
        return date;
    }

    /**
     * Returns a short label identifying the kind of transaction
     * (e.g. "Income", "Expense", "Investment"). Used by the UI and
     * by JSON serialization so the frontend knows what it's looking at.
     */
    public abstract String getTypeLabel();

    /**
     * Each subclass knows how to represent itself as a JSON object.
     * Keeping this on the object itself (rather than a separate "JSON converter"
     * class) keeps things simple for V1 - no reflection, no external library.
     */
    public abstract String toJson();
}
