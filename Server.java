import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Server {
    private static final int PORT = 8000;
    private static final String GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/16v1WEk06Mr3diBCtwpVFHUZqM1LbNYKr739BeCbF6mI/export?format=csv";
    private static final String LOCAL_FILE = "local_projects.csv";

    public static void main(String[] args) throws IOException {
        // Create HttpServer on port 8000
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        
        // Register API endpoints
        server.createContext("/api/data", new DataHandler());
        server.createContext("/api/add", new AddHandler());
        
        // Serve static files
        server.createContext("/", new StaticFileHandler());
        
        server.setExecutor(null); // default executor
        System.out.println("Java Server and CORS proxy running at http://localhost:" + PORT);
        System.out.println("Serving static files and proxying Google Sheets...");
        System.out.println("Adding local database at: " + LOCAL_FILE + " -> POST /api/add");
        server.start();
    }

    // Helper: Add CORS headers to the response
    private static void setCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
    }

    // Helper: Escape string for CSV insertion
    private static String escapeCsv(String val) {
        if (val == null) return "";
        val = val.replace("\"", "\"\"");
        if (val.contains(",") || val.contains("\"") || val.contains("\n") || val.contains("\r")) {
            return "\"" + val + "\"";
        }
        return val;
    }

    // 1. DataHandler: handles GET /api/data (Proxy and Merge Google Sheet + Local CSV)
    static class DataHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            setCorsHeaders(exchange);
            
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(200, -1);
                return;
            }
            
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            try {
                // Determine cache buster
                String query = exchange.getRequestURI().getRawQuery();
                String tParam = "0";
                if (query != null && query.contains("t=")) {
                    tParam = query.substring(query.indexOf("t=") + 2);
                }
                
                String googleUrlWithBuster = GOOGLE_SHEET_URL + "&t=" + tParam;
                
                // Fetch CSV from Google Sheets
                URL url = new URL(googleUrlWithBuster);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "Mozilla/5.0");
                
                StringBuilder googleCsv = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        googleCsv.append(line).append("\n");
                    }
                }
                
                String mergedCsv = googleCsv.toString();
                
                // Merge local CSV if it exists
                File localFile = new File(LOCAL_FILE);
                if (localFile.exists()) {
                    // Extract existing IDs from google sheet data to filter duplicates
                    Set<String> existingIds = new HashSet<>();
                    List<String[]> googleRows = parseCsvString(googleCsv.toString());
                    
                    if (!googleRows.isEmpty()) {
                        String[] headers = googleRows.get(0);
                        int idxId = 0;
                        for (int i = 0; i < headers.length; i++) {
                            if (headers[i].contains("รหัส")) {
                                idxId = i;
                                break;
                            }
                        }
                        
                        for (int i = 1; i < googleRows.size(); i++) {
                            String[] row = googleRows.get(i);
                            if (row.length > idxId) {
                                existingIds.add(row[idxId].trim());
                            }
                        }
                    }
                    
                    // Parse local file and filter duplicates
                    List<String> localLines = Files.readAllLines(Paths.get(LOCAL_FILE), StandardCharsets.UTF_8);
                    List<String> rowsToAppend = new ArrayList<>();
                    
                    for (String localLine : localLines) {
                        if (localLine.trim().isEmpty()) continue;
                        List<String[]> parsedRow = parseCsvString(localLine);
                        if (!parsedRow.isEmpty()) {
                            String[] row = parsedRow.get(0);
                            String pid = row[0].trim();
                            if (!existingIds.contains(pid)) {
                                StringBuilder escapedLine = new StringBuilder();
                                for (int i = 0; i < row.length; i++) {
                                    escapedLine.append(escapeCsv(row[i]));
                                    if (i < row.length - 1) {
                                        escapedLine.append(",");
                                    }
                                }
                                rowsToAppend.add(escapedLine.toString());
                            }
                        }
                    }
                    
                    if (!rowsToAppend.isEmpty()) {
                        if (!mergedCsv.endsWith("\n")) {
                            mergedCsv += "\n";
                        }
                        mergedCsv += String.join("\n", rowsToAppend) + "\n";
                    }
                }
                
                byte[] responseBytes = mergedCsv.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/csv; charset=utf-8");
                exchange.sendResponseHeaders(200, responseBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(responseBytes);
                }
                
            } catch (Exception e) {
                e.printStackTrace();
                String errorMsg = "Error fetching Google Sheet: " + e.getMessage();
                byte[] errorBytes = errorMsg.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
                exchange.sendResponseHeaders(500, errorBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(errorBytes);
                }
            }
        }
        
        // Simple CSV parser
        private List<String[]> parseCsvString(String csvContent) {
            List<String[]> rows = new ArrayList<>();
            try (BufferedReader r = new BufferedReader(new StringReader(csvContent))) {
                String line;
                while ((line = r.readLine()) != null) {
                    if (line.trim().isEmpty()) continue;
                    List<String> cells = new ArrayList<>();
                    boolean inQuotes = false;
                    StringBuilder cell = new StringBuilder();
                    for (int i = 0; i < line.length(); i++) {
                        char c = line.charAt(i);
                        if (c == '"') {
                            inQuotes = !inQuotes;
                        } else if (c == ',' && !inQuotes) {
                            cells.add(cleanCellQuotes(cell.toString()));
                            cell.setLength(0);
                        } else {
                            cell.append(c);
                        }
                    }
                    cells.add(cleanCellQuotes(cell.toString()));
                    rows.add(cells.toArray(new String[0]));
                }
            } catch (IOException e) {
                // ignore
            }
            return rows;
        }
        
        private String cleanCellQuotes(String val) {
            val = val.trim();
            if (val.startsWith("\"") && val.endsWith("\"")) {
                val = val.substring(1, val.length() - 1);
            }
            return val.replace("\"\"", "\"").trim();
        }
    }

    // 2. AddHandler: handles POST /api/add (Append new project locally)
    static class AddHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            setCorsHeaders(exchange);
            
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(200, -1);
                return;
            }
            
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            try {
                // Read request body JSON
                InputStream is = exchange.getRequestBody();
                String body = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))
                        .lines().collect(Collectors.joining("\n"));
                
                // Simple regex JSON parser for form inputs
                String pid = getJsonField(body, "id");
                String name = getJsonField(body, "name");
                String manager = getJsonField(body, "manager");
                String dept = getJsonField(body, "dept");
                String budgetStr = getJsonField(body, "budget");
                String spentStr = getJsonField(body, "spent");
                String progress = getJsonField(body, "progress");
                String status = getJsonField(body, "status");
                
                double budgetVal = parseDoubleClean(budgetStr);
                double spentVal = parseDoubleClean(spentStr);
                double remainingVal = budgetVal - spentVal;
                
                // Construct CSV Row
                // Header: รหัสโครงการ,ชื่อโครงการ,ผู้รับผิดชอบ,กลุ่มงาน,งบประมาณ,ใช้ไปแล้ว,คงเหลือ,ความคืบหน้า,สถานะ
                String rowStr = String.join(",", 
                    escapeCsv(pid),
                    escapeCsv(name),
                    escapeCsv(manager),
                    escapeCsv(dept),
                    String.valueOf(budgetVal),
                    String.valueOf(spentVal),
                    String.valueOf(remainingVal),
                    escapeCsv(progress),
                    escapeCsv(status)
                ) + "\n";
                
                // Append to local CSV
                try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(
                        new FileOutputStream(LOCAL_FILE, true), StandardCharsets.UTF_8))) {
                    writer.write(rowStr);
                }
                
                String responseJson = "{\"status\":\"success\",\"message\":\"Project added successfully\"}";
                byte[] responseBytes = responseJson.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                exchange.sendResponseHeaders(200, responseBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(responseBytes);
                }
                
            } catch (Exception e) {
                e.printStackTrace();
                String responseJson = "{\"status\":\"error\",\"message\":\"" + e.getMessage() + "\"}";
                byte[] responseBytes = responseJson.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                exchange.sendResponseHeaders(500, responseBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(responseBytes);
                }
            }
        }
        
        private double parseDoubleClean(String val) {
            if (val == null || val.trim().isEmpty()) return 0;
            try {
                return Double.parseDouble(val.replace(",", "").trim());
            } catch (NumberFormatException e) {
                return 0;
            }
        }
        
        // Simple helper to extract JSON fields from JSON string
        private String getJsonField(String json, String field) {
            Pattern pattern = Pattern.compile("\"" + field + "\"\\s*:\\s*(?:\"([^\"]*)\"|([^,}\\s]*))");
            Matcher matcher = pattern.matcher(json);
            if (matcher.find()) {
                if (matcher.group(1) != null) {
                    return matcher.group(1);
                }
                return matcher.group(2);
            }
            return "";
        }
    }

    // 3. StaticFileHandler: Serves index.html, style.css, app.js, school_logo.jpg
    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String pathStr = exchange.getRequestURI().getPath();
            if (pathStr.equals("/")) {
                pathStr = "/index.html";
            }
            
            // Remove leading slash
            String relativePath = pathStr.substring(1);
            File file = new File(relativePath);
            
            if (!file.exists() || file.isDirectory()) {
                // Return 404
                String responseMsg = "File not found: " + pathStr;
                byte[] responseBytes = responseMsg.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(404, responseBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(responseBytes);
                }
                return;
            }
            
            // Set correct content type
            String contentType = "text/plain";
            if (relativePath.endsWith(".html")) {
                contentType = "text/html; charset=utf-8";
            } else if (relativePath.endsWith(".css")) {
                contentType = "text/css; charset=utf-8";
            } else if (relativePath.endsWith(".js")) {
                contentType = "application/javascript; charset=utf-8";
            } else if (relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg")) {
                contentType = "image/jpeg";
            } else if (relativePath.endsWith(".png")) {
                contentType = "image/png";
            }
            
            exchange.getResponseHeaders().set("Content-Type", contentType);
            
            // Write file content to output
            byte[] fileBytes = Files.readAllBytes(file.toPath());
            exchange.sendResponseHeaders(200, fileBytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(fileBytes);
            }
        }
    }
}
