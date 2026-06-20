import http.server
import socketserver
import urllib.request
import urllib.error
import json
import os
import csv
import io

PORT = 8000
GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/16v1WEk06Mr3diBCtwpVFHUZqM1LbNYKr739BeCbF6mI/export?format=csv"
LOCAL_FILE = 'local_projects.csv'

class DashboardProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        # Handle CORS preflight request
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/add':
            try:
                # Read content length
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                # Parse JSON
                data = json.loads(post_data.decode('utf-8'))
                
                # Extract and clean fields
                pid = str(data.get('id', '')).strip()
                name = str(data.get('name', '')).strip()
                manager = str(data.get('manager', '')).strip()
                dept = str(data.get('dept', '')).strip()
                budget = str(data.get('budget', '0')).strip()
                spent = str(data.get('spent', '0')).strip()
                
                # Calculate remaining budget
                try:
                    b_val = float(budget.replace(',', ''))
                    s_val = float(spent.replace(',', ''))
                    remaining = str(b_val - s_val)
                except ValueError:
                    remaining = budget
                    
                progress = str(data.get('progress', '0')).strip()
                status = str(data.get('status', 'ยังไม่ดำเนินการ')).strip()
                
                # CSV Helper: escape values containing comma, quotes, or newlines
                def escape_csv(val):
                    val = val.replace('"', '""')
                    if ',' in val or '"' in val or '\n' in val:
                        return f'"{val}"'
                    return val
                
                # Format as CSV row
                row_str = f"{escape_csv(pid)},{escape_csv(name)},{escape_csv(manager)},{escape_csv(dept)},{escape_csv(budget)},{escape_csv(spent)},{escape_csv(remaining)},{escape_csv(progress)},{escape_csv(status)}\n"
                
                # Append to local projects CSV file
                with open(LOCAL_FILE, 'a', encoding='utf-8') as f:
                    f.write(row_str)
                
                # Respond
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success", 
                    "message": "Project added successfully",
                    "project": {
                        "id": pid, "name": name, "manager": manager, "dept": dept,
                        "budget": budget, "spent": spent, "remaining": remaining,
                        "progress": progress, "status": status
                    }
                }, ensure_ascii=False).encode('utf-8'))
                
            except Exception as e:
                print(f"Error adding project: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/data'):
            try:
                # Add cache buster to google request
                url = f"{GOOGLE_SHEET_URL}&t={self.path.split('?t=')[-1] if '?t=' in self.path else '0'}"
                
                req = urllib.request.Request(
                    url, 
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                
                # Fetch sheet data from Google Sheets
                with urllib.request.urlopen(req) as response:
                    google_csv = response.read().decode('utf-8')
                
                merged_csv = google_csv
                
                # Merge local projects if they exist
                if os.path.exists(LOCAL_FILE):
                    google_rows = list(csv.reader(io.StringIO(google_csv)))
                    if len(google_rows) > 0:
                        headers = google_rows[0]
                        # Find ID column index (usually 0)
                        idx_id = 0
                        for idx, h in enumerate(headers):
                            if "รหัส" in h:
                                idx_id = idx
                                break
                        
                        existing_ids = set()
                        for row in google_rows[1:]:
                            if len(row) > idx_id:
                                existing_ids.add(row[idx_id].strip())
                        
                        # Read local file and check for duplicates
                        local_rows_to_append = []
                        with open(LOCAL_FILE, 'r', encoding='utf-8') as f:
                            local_csv = f.read()
                            
                        local_parsed = csv.reader(io.StringIO(local_csv))
                        for row in local_parsed:
                            if not row: continue
                            pid = row[0].strip()
                            # Only append if ID is not already present in the Google Sheet
                            if pid not in existing_ids:
                                def escape_csv(val):
                                    val = val.replace('"', '""')
                                    if ',' in val or '"' in val or '\n' in val:
                                        return f'"{val}"'
                                    return val
                                escaped_row = ",".join([escape_csv(cell) for cell in row])
                                local_rows_to_append.append(escaped_row)
                        
                        if local_rows_to_append:
                            if not google_csv.endswith('\n'):
                                merged_csv += '\n'
                            merged_csv += '\n'.join(local_rows_to_append) + '\n'
                
                # Send HTTP headers
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(merged_csv.encode('utf-8'))
                
            except Exception as e:
                print(f"Error proxying Google Sheet: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(f"Error fetching Google Sheet: {str(e)}".encode('utf-8'))
        else:
            # Otherwise serve local static files normally
            super().do_GET()

socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), DashboardProxyHandler) as httpd:
    print(f"Server and CORS proxy running at http://localhost:{PORT}")
    print(f"Proxying: {GOOGLE_SHEET_URL} -> /api/data")
    print(f"Adding local database at: {LOCAL_FILE} -> POST /api/add")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()
