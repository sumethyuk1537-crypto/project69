import http.server
import socketserver
import urllib.request
import urllib.error

PORT = 8000
GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/16v1WEk06Mr3diBCtwpVFHUZqM1LbNYKr739BeCbF6mI/export?format=csv"

class DashboardProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Check if the request is for the proxy API
        if self.path.startswith('/api/data'):
            try:
                # Add cache buster to google request
                url = f"{GOOGLE_SHEET_URL}&t={self.path.split('?t=')[-1] if '?t=' in self.path else '0'}"
                
                req = urllib.request.Request(
                    url, 
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                )
                
                # Fetch sheet data from Google (server-to-server has no CORS constraints)
                with urllib.request.urlopen(req) as response:
                    data = response.read()
                
                # Send HTTP headers
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                # Write CSV data back to client
                self.wfile.write(data)
                
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

# Ensure we don't get "address already in use" errors immediately on restart
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), DashboardProxyHandler) as httpd:
    print(f"Server and CORS proxy running at http://localhost:{PORT}")
    print(f"Proxying: {GOOGLE_SHEET_URL} -> /api/data")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()
