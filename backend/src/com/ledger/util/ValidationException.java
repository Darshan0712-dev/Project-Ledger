package com.ledger.util;

/**
 * Thrown when user input fails validation (e.g. negative amount, empty
 * description, bad date). The message is written to be shown directly
 * to the user - friendly, not a stack trace.
 */
public class ValidationException extends RuntimeException {

    public ValidationException(String message) {
        super(message);
    }
}
