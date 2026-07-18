#!/usr/bin/env python3
"""Dev server for CYBERSPYKE: serves the repo root with the COOP/COEP headers
cross-origin isolation needs, so SharedArrayBuffer works without the
service-worker reload dance. Run from anywhere; serves the repo root at
http://localhost:8137/ (game at /cyberspyke/)."""

import http.server
import os
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PORT = int(args[0]) if args else 8137
SEND_COI = '--no-coi' not in sys.argv  # --no-coi exercises the service-worker path
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        if SEND_COI:
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler) as httpd:
        print(f'serving {ROOT} at http://localhost:{PORT}/ (game: /cyberspyke/)')
        httpd.serve_forever()
