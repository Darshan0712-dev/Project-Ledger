package com.ledger.util;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A deliberately small JSON helper.
 *
 * We are NOT using a JSON library (like Jackson or Gson) for V1, because
 * pulling in a dependency for something this small would add complexity
 * without teaching much. This class only needs to handle:
 *   - Reading simple flat objects the frontend sends us, e.g.
 *     {"category":"Food","description":"Lunch","amount":"120","date":"2026-08-11"}
 *   - Escaping strings so we can safely build JSON responses by hand.
 *
 * This is intentionally NOT a general-purpose JSON parser. It only supports
 * flat objects (no nesting, no arrays as values) because that's all our
 * API needs for V1.
 */
public final class Json {

    private Json() {
        // utility class - never instantiated
    }

    /**
     * Parses a flat JSON object into a Map of String -> String.
     * Example input: {"category":"Food","amount":"120"}
     * Works whether values are quoted strings or bare numbers.
     */
    public static Map<String, String> parseFlatObject(String json) {
        Map<String, String> result = new LinkedHashMap<>();
        if (json == null) {
            return result;
        }

        String trimmed = json.trim();
        if (trimmed.startsWith("{")) {
            trimmed = trimmed.substring(1);
        }
        if (trimmed.endsWith("}")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        trimmed = trimmed.trim();
        if (trimmed.isEmpty()) {
            return result;
        }

        // Split on commas that are NOT inside quotes.
        for (String pair : splitTopLevel(trimmed)) {
            int colonIndex = findKeyValueColon(pair);
            if (colonIndex == -1) {
                continue;
            }
            String rawKey = pair.substring(0, colonIndex).trim();
            String rawValue = pair.substring(colonIndex + 1).trim();
            String key = stripQuotes(rawKey);
            String value = stripQuotes(rawValue);
            result.put(key, value);
        }
        return result;
    }

    private static String[] splitTopLevel(String s) {
        java.util.List<String> parts = new java.util.ArrayList<>();
        int depth = 0;
        boolean inQuotes = false;
        StringBuilder current = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' && (i == 0 || s.charAt(i - 1) != '\\')) {
                inQuotes = !inQuotes;
            }
            if (!inQuotes) {
                if (c == '{' || c == '[') depth++;
                if (c == '}' || c == ']') depth--;
            }
            if (c == ',' && depth == 0 && !inQuotes) {
                parts.add(current.toString());
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        if (current.length() > 0) {
            parts.add(current.toString());
        }
        return parts.toArray(new String[0]);
    }

    private static int findKeyValueColon(String pair) {
        boolean inQuotes = false;
        for (int i = 0; i < pair.length(); i++) {
            char c = pair.charAt(i);
            if (c == '"' && (i == 0 || pair.charAt(i - 1) != '\\')) {
                inQuotes = !inQuotes;
            }
            if (c == ':' && !inQuotes) {
                return i;
            }
        }
        return -1;
    }

    private static String stripQuotes(String s) {
        String t = s.trim();
        if (t.length() >= 2 && t.startsWith("\"") && t.endsWith("\"")) {
            t = t.substring(1, t.length() - 1);
        }
        return t.replace("\\\"", "\"").replace("\\\\", "\\");
    }

    /**
     * Escapes a string so it is safe to embed inside a JSON string value.
     */
    public static String escape(String value) {
        if (value == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (char c : value.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default: sb.append(c);
            }
        }
        return sb.toString();
    }
}
