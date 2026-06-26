import os
import json
import traceback
from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = 8000
SCORES_FILE = 'scores.json'

# Ensure scores.json exists with default scores if it doesn't
if not os.path.exists(SCORES_FILE):
    with open(SCORES_FILE, 'w', encoding='utf-8') as f:
        json.dump([
            {"name": "KIEROWCA A", "score": 1200},
            {"name": "KIEROWCA B", "score": 800},
            {"name": "KIEROWCA C", "score": 400}
        ], f, indent=4)

class GameRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        try:
            if self.path == '/api/scores':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(SCORES_FILE, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                # Call SimpleHTTPRequestHandler's do_GET explicitly
                SimpleHTTPRequestHandler.do_GET(self)
        except Exception as e:
            print("ERROR IN GET REQUEST:")
            traceback.print_exc()
            self.send_response(500)
            self.end_headers()

    def do_POST(self):
        try:
            if self.path == '/api/scores':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                data = json.loads(post_data.decode('utf-8'))
                name = data.get('name', 'Kierowca').strip().upper()[:8]
                if not name:
                    name = "KIEROWCA"
                score = int(data.get('score', 0))
                
                # Load existing scores
                if os.path.exists(SCORES_FILE):
                    try:
                        with open(SCORES_FILE, 'r', encoding='utf-8') as f:
                            scores = json.load(f)
                    except Exception:
                        scores = []
                else:
                    scores = []
                
                if not isinstance(scores, list):
                    scores = []
                    
                # Add new score
                scores.append({"name": name, "score": score})
                
                # Sort and limit to top 10
                scores.sort(key=lambda x: x['score'], reverse=True)
                scores = scores[:10]
                
                # Save back to file
                with open(SCORES_FILE, 'w', encoding='utf-8') as f:
                    json.dump(scores, f, indent=4)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(scores).encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            print("ERROR IN POST REQUEST:")
            traceback.print_exc()
            self.send_response(500)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    print(f"Starting TenneT Cable Run backend server on http://localhost:{PORT}...")
    server = HTTPServer(('0.0.0.0', PORT), GameRequestHandler)
    server.serve_forever()
