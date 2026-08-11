package com.ledger.app;

import com.ledger.ledger.Ledger;
import com.ledger.model.Expense;
import com.ledger.model.Income;
import com.ledger.model.Investment;
import com.ledger.model.Transaction;
import com.ledger.util.Json;
import com.ledger.util.ValidationException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/**
 * LedgerServer is the HTTP layer. Its only job is translating between
 * "the outside world" (HTTP requests carrying JSON) and the Ledger
 * (plain Java objects). It contains NO financial logic itself -
 * every calculation and validation rule lives in Ledger.
 *
 * We use Java's built-in com.sun.net.httpserver.HttpServer so that V1
 * needs zero external dependencies (no Spring Boot, no build tool required
 * beyond the JDK itself).
 */
public class LedgerServer {

    private final Ledger ledger;
    private final Path frontendDirectory;
    private HttpServer server;

    public LedgerServer(Ledger ledger, Path frontendDirectory) {
        this.ledger = ledger;
        this.frontendDirectory = frontendDirectory;
    }

    public void start(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);

        // API endpoints
        server.createContext("/api/income", this::handleAddIncome);
        server.createContext("/api/expense", this::handleAddExpense);
        server.createContext("/api/investment", this::handleAddInvestment);
        server.createContext("/api/transactions", this::handleGetTransactions);
        server.createContext("/api/summary", this::handleGetSummary);
        server.createContext("/api/categories", this::handleGetCategoryTotals);

        // Everything else is treated as a request for a static frontend file.
        server.createContext("/", this::handleStaticFile);

        server.setExecutor(null); // default executor is fine for V1
        server.start();
        System.out.println("Project Ledger running at http://localhost:" + port);
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    // ---------- API handlers ----------

    private void handleAddIncome(HttpExchange exchange) throws IOException {
        if (!methodIs(exchange, "POST")) {
            sendMethodNotAllowed(exchange);
            return;
        }
        try {
            Map<String, String> body = Json.parseFlatObject(readBody(exchange));
            String type = body.get("type");
            BigDecimal amount = parseAmount(body.get("amount"));
            LocalDate date = parseDate(body.get("date"));

            Income income = ledger.addIncome(type, amount, date);
            sendJson(exchange, 200, income.toJson());
        } catch (ValidationException e) {
            sendError(exchange, 400, e.getMessage());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not process the request. Please check the values you entered.");
        }
    }

    private void handleAddExpense(HttpExchange exchange) throws IOException {
        if (!methodIs(exchange, "POST")) {
            sendMethodNotAllowed(exchange);
            return;
        }
        try {
            Map<String, String> body = Json.parseFlatObject(readBody(exchange));
            String category = body.get("category");
            String description = body.get("description");
            BigDecimal amount = parseAmount(body.get("amount"));
            LocalDate date = parseDate(body.get("date"));

            Expense expense = ledger.addExpense(category, description, amount, date);
            sendJson(exchange, 200, expense.toJson());
        } catch (ValidationException e) {
            sendError(exchange, 400, e.getMessage());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not process the request. Please check the values you entered.");
        }
    }

    private void handleAddInvestment(HttpExchange exchange) throws IOException {
        if (!methodIs(exchange, "POST")) {
            sendMethodNotAllowed(exchange);
            return;
        }
        try {
            Map<String, String> body = Json.parseFlatObject(readBody(exchange));
            String type = body.get("type");
            BigDecimal amount = parseAmount(body.get("amount"));
            LocalDate date = parseDate(body.get("date"));

            Investment investment = ledger.addInvestment(type, amount, date);
            sendJson(exchange, 200, investment.toJson());
        } catch (ValidationException e) {
            sendError(exchange, 400, e.getMessage());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not process the request. Please check the values you entered.");
        }
    }

    private void handleGetTransactions(HttpExchange exchange) throws IOException {
        if (!methodIs(exchange, "GET")) {
            sendMethodNotAllowed(exchange);
            return;
        }
        try {
            YearMonth month = parseMonthParam(exchange);
            List<Transaction> transactions = ledger.getTransactionsForMonth(month);

            StringBuilder json = new StringBuilder("[");
            for (int i = 0; i < transactions.size(); i++) {
                if (i > 0) json.append(",");
                json.append(transactions.get(i).toJson());
            }
            json.append("]");

            sendJson(exchange, 200, json.toString());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not load transactions.");
        }
    }

    private void handleGetSummary(HttpExchange exchange) throws IOException {
        if (!methodIs(exchange, "GET")) {
            sendMethodNotAllowed(exchange);
            return;
        }
        try {
            YearMonth month = parseMonthParam(exchange);
            Ledger.Summary summary = ledger.calculateSummary(month);
            sendJson(exchange, 200, summary.toJson());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not calculate summary.");
        }
    }

    private void handleGetCategoryTotals(HttpExchange exchange) throws IOException {
        if (!methodIs(exchange, "GET")) {
            sendMethodNotAllowed(exchange);
            return;
        }
        try {
            YearMonth month = parseMonthParam(exchange);
            Map<String, BigDecimal> totals = ledger.calculateCategoryTotals(month);

            StringBuilder json = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<String, BigDecimal> entry : totals.entrySet()) {
                if (!first) json.append(",");
                first = false;
                json.append("\"").append(Json.escape(entry.getKey())).append("\":")
                        .append(entry.getValue().toPlainString());
            }
            json.append("}");

            sendJson(exchange, 200, json.toString());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not calculate category totals.");
        }
    }

    // ---------- Static file handler (serves the frontend) ----------

    private void handleStaticFile(HttpExchange exchange) throws IOException {
        String requestPath = exchange.getRequestURI().getPath();
        if (requestPath.equals("/")) {
            requestPath = "/index.html";
        }

        Path filePath = frontendDirectory.resolve(requestPath.substring(1)).normalize();

        // Basic safety check: never serve files outside the frontend directory.
        if (!filePath.startsWith(frontendDirectory) || !Files.exists(filePath) || Files.isDirectory(filePath)) {
            byte[] notFound = "404 - Not Found".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
            exchange.sendResponseHeaders(404, notFound.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(notFound);
            }
            return;
        }

        byte[] content = Files.readAllBytes(filePath);
        exchange.getResponseHeaders().set("Content-Type", contentTypeFor(filePath));
        exchange.sendResponseHeaders(200, content.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(content);
        }
    }

    private String contentTypeFor(Path path) {
        String name = path.getFileName().toString();
        if (name.endsWith(".html")) return "text/html; charset=utf-8";
        if (name.endsWith(".css")) return "text/css; charset=utf-8";
        if (name.endsWith(".js")) return "application/javascript; charset=utf-8";
        return "application/octet-stream";
    }

    // ---------- Small shared helpers ----------

    private boolean methodIs(HttpExchange exchange, String method) {
        return exchange.getRequestMethod().equalsIgnoreCase(method);
    }

    private String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private BigDecimal parseAmount(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            throw new ValidationException("Amount is required.");
        }
        try {
            return new BigDecimal(raw.trim());
        } catch (NumberFormatException e) {
            throw new ValidationException("Amount must be a valid number.");
        }
    }

    private LocalDate parseDate(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            throw new ValidationException("Date is required.");
        }
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            throw new ValidationException("Date must be in YYYY-MM-DD format.");
        }
    }

    /**
     * Reads an optional "?month=YYYY-MM" query parameter. Returns null
     * if not provided, meaning "no filter, show everything".
     */
    private YearMonth parseMonthParam(HttpExchange exchange) {
        String query = exchange.getRequestURI().getQuery();
        if (query == null) {
            return null;
        }
        for (String param : query.split("&")) {
            String[] parts = param.split("=", 2);
            if (parts.length == 2 && parts[0].equals("month") && !parts[1].isEmpty()) {
                try {
                    return YearMonth.parse(parts[1]);
                } catch (DateTimeParseException e) {
                    throw new ValidationException("Month must be in YYYY-MM format.");
                }
            }
        }
        return null;
    }

    private void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private void sendError(HttpExchange exchange, int statusCode, String message) throws IOException {
        String json = "{\"error\":\"" + Json.escape(message) + "\"}";
        sendJson(exchange, statusCode, json);
    }

    private void sendMethodNotAllowed(HttpExchange exchange) throws IOException {
        sendError(exchange, 405, "That method is not allowed for this endpoint.");
    }
}
