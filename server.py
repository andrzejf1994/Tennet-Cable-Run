import os
import json
import threading
import traceback
from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = 8000
SCORES_FILE = 'scores.json'
TOP_N = 10
_lock = threading.Lock()

def read_scores():
    if not os.path.exists(SCORES_FILE):
        return []
    try:
        with open(SCORES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def write_scores(scores):
    with open(SCORES_FILE, 'w', encoding='utf-8') as f:
        json.dump(scores, f, indent=4, ensure_ascii=False)

# Ensure scores.json starts clean (empty – no fake placeholder scores)
if not os.path.exists(SCORES_FILE):
    write_scores([])

class GameRequestHandler(SimpleHTTPRequestHandler):

    def _set_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors()
        self.end_headers()

    def do_GET(self):
        try:
            if self.path == '/api/scores':
                with _lock:
                    scores = read_scores()
                scores.sort(key=lambda x: x.get('score', 0), reverse=True)
                body = json.dumps(scores[:TOP_N], ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self._set_cors()
                self.end_headers()
                self.wfile.write(body)
            else:
                SimpleHTTPRequestHandler.do_GET(self)
        except Exception:
            traceback.print_exc()
            try:
                self.send_response(500)
                self.end_headers()
            except Exception:
                pass

    def do_POST(self):
        try:
            if self.path == '/api/scores':
                length = int(self.headers.get('Content-Length', 0))
                raw = self.rfile.read(length)
                data = json.loads(raw.decode('utf-8'))

                name = str(data.get('name', '')).strip().upper()[:8] or 'KIEROWCA'
                score = int(data.get('score', 0))

                if score <= 0:
                    self.send_response(400)
                    self._set_cors()
                    self.end_headers()
                    self.wfile.write(b'{"error":"score must be > 0"}')
                    return

                with _lock:
                    scores = read_scores()
                    # Only keep personal best per player name
                    existing = next((s for s in scores if s.get('name') == name), None)
                    if existing:
                        if score > existing.get('score', 0):
                            existing['score'] = score  # update personal best
                        # else ignore – not better than their best
                    else:
                        scores.append({'name': name, 'score': score})
                    scores.sort(key=lambda x: x.get('score', 0), reverse=True)
                    scores = scores[:TOP_N]
                    write_scores(scores)

                body = json.dumps(scores, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self._set_cors()
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()
        except Exception:
            traceback.print_exc()
            try:
                self.send_response(500)
                self.end_headers()
            except Exception:
                pass

    def do_DELETE(self):
        try:
            if self.path == '/api/scores':
                with _lock:
                    write_scores([])
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._set_cors()
                self.end_headers()
                self.wfile.write(b'{"status":"cleared"}')
            else:
                self.send_response(404)
                self.end_headers()
        except Exception:
            traceback.print_exc()
            try:
                self.send_response(500)
                self.end_headers()
            except Exception:
                pass

    def log_message(self, fmt, *args):
        # Suppress asset request noise, only log API calls
        if '/api/' in args[0] if args else False:
            super().log_message(fmt, *args)

if __name__ == '__main__':
    print(f"TenneT Cable Run – Global Score Server running on http://0.0.0.0:{PORT}")
    print(f"Scores stored in: {os.path.abspath(SCORES_FILE)}")
    server = HTTPServer(('0.0.0.0', PORT), GameRequestHandler)
    server.serve_forever()
