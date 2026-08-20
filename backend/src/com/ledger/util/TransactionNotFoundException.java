package com.ledger.util;

/**
 * Thrown when an operation targets a transaction id that doesn't exist
 * (e.g. editing or deleting a transaction that was already removed, or
 * never existed). Kept separate from ValidationException because it
 * maps to a different HTTP status: 404, not 400.
 */
public class TransactionNotFoundException extends RuntimeException {

    public TransactionNotFoundException(String message) {
        super(message);
    }
}
