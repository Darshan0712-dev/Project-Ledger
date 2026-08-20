package com.ledger.app;

import com.ledger.ledger.Ledger;
import com.ledger.model.Expense;
import com.ledger.model.Income;
import com.ledger.model.Investment;
import com.ledger.model.Transaction;
import com.ledger.util.Json;
import com.ledger.util.TransactionNotFoundException;
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
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
        server.createContext("/api/transactions", this::handleTransactionsRoute);
        server.createContext("/api/summary", this::handleGetSummary);
        server.createContext("/api/categories", this::handleGetCategoryTotals);
        server.createContext("/api/insights", this::handleGetInsights);

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

    // ---------- Edit / Delete Transactions (V1.2 Milestone 1) ----------
    //
    // HttpServer's createContext does PREFIX matching: registering
    // "/api/transactions" already routes "/api/transactions/7" here too.
    // So this one router decides, from the path and method, whether the
    // request is:
    //   GET    /api/transactions            -> list (existing behavior)
    //   PUT    /api/transactions/{id}        -> update that transaction
    //   DELETE /api/transactions/{id}        -> delete that transaction

    private void handleTransactionsRoute(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String prefix = "/api/transactions";
        String remainder = path.length() > prefix.length() ? path.substring(prefix.length()) : "";
        remainder = remainder.replaceAll("^/+", "").replaceAll("/+$", "");

        if (remainder.isEmpty()) {
            handleGetTransactions(exchange);
            return;
        }

        int id;
        try {
            id = Integer.parseInt(remainder);
        } catch (NumberFormatException e) {
            sendError(exchange, 400, "Invalid transaction id.");
            return;
        }

        if (methodIs(exchange, "PUT")) {
            handleUpdateTransaction(exchange, id);
        } else if (methodIs(exchange, "DELETE")) {
            handleDeleteTransaction(exchange, id);
        } else {
            sendMethodNotAllowed(exchange);
        }
    }

    /**
     * Updates an existing transaction. The request body only contains the
     * new field values (not the kind), so we first look up the existing
     * transaction to find out whether it's an Income, Expense, or
     * Investment, then dispatch to the matching Ledger.updateX method -
     * which validates the new data the same way addX does, and only
     * replaces the transaction if that validation passes.
     */
    private void handleUpdateTransaction(HttpExchange exchange, int id) throws IOException {
        try {
            Transaction existing = ledger.getTransactionById(id);
            Map<String, String> body = Json.parseFlatObject(readBody(exchange));
            BigDecimal amount = parseAmount(body.get("amount"));
            LocalDate date = parseDate(body.get("date"));

            Transaction updated;
            if (existing instanceof Income) {
                updated = ledger.updateIncome(id, body.get("type"), amount, date);
            } else if (existing instanceof Expense) {
                updated = ledger.updateExpense(id, body.get("category"), body.get("description"), amount, date);
            } else {
                updated = ledger.updateInvestment(id, body.get("type"), amount, date);
            }

            sendJson(exchange, 200, updated.toJson());
        } catch (TransactionNotFoundException e) {
            sendError(exchange, 404, e.getMessage());
        } catch (ValidationException e) {
            sendError(exchange, 400, e.getMessage());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not update the transaction. Please check the values you entered.");
        }
    }

    private void handleDeleteTransaction(HttpExchange exchange, int id) throws IOException {
        try {
            ledger.deleteTransaction(id);
            sendJson(exchange, 200, "{\"deleted\":true,\"id\":" + id + "}");
        } catch (TransactionNotFoundException e) {
            sendError(exchange, 404, e.getMessage());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not delete the transaction.");
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

    // ---------- Financial Insights (V1.1 Milestone 2) ----------
    //
    // A single endpoint serves every "Show x Period" combination the
    // Insights UI can request, rather than one endpoint per chart type.
    //
    // Response shapes (the "mode" field tells the frontend which one it got):
    //
    //   category mode  -> {"mode":"category","data":[{"label":"Food","amount":4200}, ...]}
    //     Used when period = this_month and show = expenses/income/investments.
    //     A single month's breakdown by category/type is more useful than a
    //     one-point time series.
    //
    //   series mode    -> {"mode":"series","data":[{"month":"March 2026","amount":3200}, ...]}
    //     Used for multi-month expenses/income/investments, and always for
    //     "available" (available money has no categories to break down).
    //
    //   compare mode   -> {"mode":"compare","data":[{"month":"March 2026","income":5000,"expenses":3200}, ...]}
    //     Used for "income_vs_expenses", regardless of period.
    //
    // All the actual math (sums, grouping) still happens in Ledger. This
    // handler only decides WHICH Ledger calculations to call and shapes
    // the result into JSON - no financial logic lives here.

    private static final DateTimeFormatter MONTH_LABEL_FORMAT =
            DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH);

    private void handleGetInsights(HttpExchange exchange) throws IOException {
        if (!methodIs(exchange, "GET")) {
            sendMethodNotAllowed(exchange);
            return;
        }
        try {
            String show = requireQueryParam(exchange, "show");
            String period = requireQueryParam(exchange, "period");

            String json;
            if (show.equals("income_vs_expenses")) {
                json = buildCompareJson(resolvePeriodMonths(period));
            } else if (period.equals("this_month") && isCategoryCapable(show)) {
                json = buildCategoryJson(show, YearMonth.now());
            } else if (isKnownShow(show)) {
                json = buildSeriesJson(show, resolvePeriodMonths(period));
            } else {
                throw new ValidationException("Unknown 'show' value: " + show);
            }

            sendJson(exchange, 200, json);
        } catch (ValidationException e) {
            sendError(exchange, 400, e.getMessage());
        } catch (Exception e) {
            sendError(exchange, 400, "Could not load insights for the selected options.");
        }
    }

    private boolean isCategoryCapable(String show) {
        return show.equals("expenses") || show.equals("income") || show.equals("investments");
    }

    private boolean isKnownShow(String show) {
        return show.equals("expenses") || show.equals("income")
                || show.equals("investments") || show.equals("available");
    }

    private String buildCategoryJson(String show, YearMonth month) {
        Map<String, BigDecimal> totals = switch (show) {
            case "expenses" -> ledger.calculateCategoryTotals(month);
            case "income" -> ledger.calculateIncomeTypeTotals(month);
            case "investments" -> ledger.calculateInvestmentTypeTotals(month);
            default -> throw new ValidationException("Unknown 'show' value: " + show);
        };

        StringBuilder data = new StringBuilder("[");
        boolean first = true;
        for (Map.Entry<String, BigDecimal> entry : totals.entrySet()) {
            if (!first) data.append(",");
            first = false;
            data.append("{\"label\":\"").append(Json.escape(entry.getKey())).append("\",")
                    .append("\"amount\":").append(entry.getValue().toPlainString()).append("}");
        }
        data.append("]");

        return "{\"mode\":\"category\",\"data\":" + data + "}";
    }

    private String buildSeriesJson(String show, List<YearMonth> months) {
        StringBuilder data = new StringBuilder("[");
        for (int i = 0; i < months.size(); i++) {
            if (i > 0) data.append(",");
            YearMonth month = months.get(i);
            Ledger.Summary summary = ledger.calculateSummary(month);
            BigDecimal amount = switch (show) {
                case "expenses" -> summary.totalExpenses;
                case "income" -> summary.totalIncome;
                case "investments" -> summary.totalInvestments;
                case "available" -> summary.availableMoney;
                default -> throw new ValidationException("Unknown 'show' value: " + show);
            };
            data.append("{\"month\":\"").append(month.format(MONTH_LABEL_FORMAT)).append("\",")
                    .append("\"amount\":").append(amount.toPlainString()).append("}");
        }
        data.append("]");

        return "{\"mode\":\"series\",\"data\":" + data + "}";
    }

    private String buildCompareJson(List<YearMonth> months) {
        StringBuilder data = new StringBuilder("[");
        for (int i = 0; i < months.size(); i++) {
            if (i > 0) data.append(",");
            YearMonth month = months.get(i);
            Ledger.Summary summary = ledger.calculateSummary(month);
            data.append("{\"month\":\"").append(month.format(MONTH_LABEL_FORMAT)).append("\",")
                    .append("\"income\":").append(summary.totalIncome.toPlainString()).append(",")
                    .append("\"expenses\":").append(summary.totalExpenses.toPlainString()).append("}");
        }
        data.append("]");

        return "{\"mode\":\"compare\",\"data\":" + data + "}";
    }

    /**
     * Translates a period name ("last_6_months", etc.) into the concrete
     * list of YearMonths it covers, oldest first. This is request-parsing
     * logic (interpreting "now" relative to a UI choice), so it lives here
     * in the HTTP layer rather than in Ledger.
     */
    private List<YearMonth> resolvePeriodMonths(String period) {
        YearMonth current = YearMonth.now();
        List<YearMonth> months = new ArrayList<>();

        switch (period) {
            case "this_month" -> months.add(current);
            case "last_3_months" -> {
                for (int i = 2; i >= 0; i--) months.add(current.minusMonths(i));
            }
            case "last_6_months" -> {
                for (int i = 5; i >= 0; i--) months.add(current.minusMonths(i));
            }
            case "this_year" -> {
                for (int m = 1; m <= current.getMonthValue(); m++) {
                    months.add(YearMonth.of(current.getYear(), m));
                }
            }
            default -> throw new ValidationException("Unknown 'period' value: " + period);
        }
        return months;
    }

    private String requireQueryParam(HttpExchange exchange, String key) {
        String query = exchange.getRequestURI().getQuery();
        if (query != null) {
            for (String param : query.split("&")) {
                String[] parts = param.split("=", 2);
                if (parts.length == 2 && parts[0].equals(key) && !parts[1].isEmpty()) {
                    return parts[1];
                }
            }
        }
        throw new ValidationException("Missing required parameter: " + key);
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
