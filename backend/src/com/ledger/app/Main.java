package com.ledger.app;

import com.ledger.ledger.Ledger;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Application entry point. Its only job is to wire the pieces together
 * and start the server. It intentionally contains no business logic.
 */
public class Main {

    private static final int PORT = 8081;

    public static void main(String[] args) throws IOException {
        Ledger ledger = new Ledger();

        // The frontend folder sits next to the backend folder in the
        // project root. We resolve it relative to the current working
        // directory, which should be the project root when you run this.
        Path frontendDirectory = Path.of("frontend").toAbsolutePath().normalize();

        LedgerServer server = new LedgerServer(ledger, frontendDirectory);
        server.start(PORT);
    }
}
