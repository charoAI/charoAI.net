#!/usr/bin/env python3
"""
Site Survey receiver — runs on your home machine, receives surveys pushed
from the CharoAI Site Survey web app over your tailnet.

Python 3.8+, standard library only. No dependencies.

Quick start:
    python3 receiver.py --token pick-a-long-random-string

    # then expose it with valid HTTPS on your tailnet:
    tailscale serve --bg localhost:8777

    # your sync endpoint in the app becomes:
    #   https://<machine-name>.<tailnet>.ts.net
    # (see README.md in this folder for details)

Data lands in ~/SiteSurveys/<site-slug>-<id8>/:
    survey.json     — full structured survey (repushes overwrite; prior
                      versions kept in history/)
    report.html     — self-contained interactive report (if enabled in app)
    media/          — geotagged photos/videos + .meta.json sidecars
"""

import argparse
import base64
import json
import os
import re
import sys
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

TOKEN = None
ROOT = None
MAX_BODY = 2 * 1024 * 1024 * 1024  # 2 GB safety cap per request


def slugify(s):
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (s or "survey")).strip("-").lower()
    return (s or "survey")[:60]


def survey_dir(survey_id, site_name=None):
    """Find existing dir for this survey id, or create one."""
    sid8 = survey_id[:8]
    for entry in os.listdir(ROOT):
        if entry.endswith("-" + sid8) and os.path.isdir(os.path.join(ROOT, entry)):
            return os.path.join(ROOT, entry)
    name = f"{slugify(site_name)}-{sid8}"
    path = os.path.join(ROOT, name)
    os.makedirs(os.path.join(path, "media"), exist_ok=True)
    os.makedirs(os.path.join(path, "history"), exist_ok=True)
    return path


class Handler(BaseHTTPRequestHandler):
    server_version = "SiteSurveyReceiver/1.0"

    # ---------- plumbing ----------

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type, X-Survey-Id, X-Media-Id, X-Filename, X-Meta",
        )
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        if not TOKEN:
            return True
        got = self.headers.get("Authorization", "")
        return got == f"Bearer {TOKEN}"

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BODY:
            return None
        remaining, chunks = length, []
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 1 << 20))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

    # ---------- endpoints ----------

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/ping":
            if not self._authed():
                return self._json(401, {"ok": False, "error": "bad token"})
            return self._json(200, {"ok": True, "name": os.uname().nodename if hasattr(os, "uname") else "receiver", "root": ROOT})
        if url.path == "/api/have":
            if not self._authed():
                return self._json(401, {"ok": False, "error": "bad token"})
            q = parse_qs(url.query)
            sid = (q.get("survey") or [""])[0]
            if not sid:
                return self._json(400, {"ok": False, "error": "survey param required"})
            d = survey_dir(sid)
            ids = []
            media_dir = os.path.join(d, "media")
            if os.path.isdir(media_dir):
                for f in os.listdir(media_dir):
                    if f.endswith(".meta.json"):
                        ids.append(f[: -len(".meta.json")].split("__")[0])
            return self._json(200, {"ok": True, "ids": ids})
        return self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if not self._authed():
            return self._json(401, {"ok": False, "error": "bad token"})
        url = urlparse(self.path)
        body = self._body()
        if body is None:
            return self._json(400, {"ok": False, "error": "empty or oversized body"})

        if url.path == "/api/survey":
            try:
                survey = json.loads(body.decode("utf-8"))
            except Exception:
                return self._json(400, {"ok": False, "error": "invalid JSON"})
            sid = survey.get("id") or "unknown"
            site = (survey.get("meta") or {}).get("siteName") or survey.get("name")
            d = survey_dir(sid, site)
            target = os.path.join(d, "survey.json")
            if os.path.exists(target):
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                os.replace(target, os.path.join(d, "history", f"survey-{stamp}.json"))
            with open(target, "w", encoding="utf-8") as f:
                json.dump(survey, f, indent=2, ensure_ascii=False)
            self.log_message("survey saved: %s", target)
            return self._json(200, {"ok": True, "dir": d})

        if url.path == "/api/media":
            sid = self.headers.get("X-Survey-Id", "")
            mid = self.headers.get("X-Media-Id", "")
            fname = os.path.basename(self.headers.get("X-Filename", mid or "file.bin"))
            if not sid or not mid:
                return self._json(400, {"ok": False, "error": "X-Survey-Id and X-Media-Id required"})
            d = survey_dir(sid)
            safe = f"{mid}__{slugify(os.path.splitext(fname)[0])}{os.path.splitext(fname)[1]}"
            path = os.path.join(d, "media", safe)
            with open(path, "wb") as f:
                f.write(body)
            meta = {}
            raw_meta = self.headers.get("X-Meta", "")
            if raw_meta:
                try:
                    meta = json.loads(base64.b64decode(raw_meta).decode("utf-8"))
                except Exception:
                    meta = {}
            meta.update({"id": mid, "filename": fname, "bytes": len(body), "receivedAt": time.time()})
            with open(os.path.join(d, "media", f"{mid}__{slugify(os.path.splitext(fname)[0])}.meta.json"), "w") as f:
                json.dump(meta, f, indent=2)
            self.log_message("media saved: %s (%d bytes)", safe, len(body))
            return self._json(200, {"ok": True})

        if url.path == "/api/report":
            sid = self.headers.get("X-Survey-Id", "")
            if not sid:
                return self._json(400, {"ok": False, "error": "X-Survey-Id required"})
            d = survey_dir(sid)
            with open(os.path.join(d, "report.html"), "wb") as f:
                f.write(body)
            self.log_message("report saved: %s/report.html", d)
            return self._json(200, {"ok": True})

        return self._json(404, {"ok": False, "error": "not found"})


def main():
    global TOKEN, ROOT
    ap = argparse.ArgumentParser(description="CharoAI Site Survey receiver")
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--bind", default="127.0.0.1",
                    help="127.0.0.1 (default) when fronted by `tailscale serve`; "
                         "use 0.0.0.0 only if you know what you're doing")
    ap.add_argument("--dir", default=os.path.expanduser("~/SiteSurveys"))
    ap.add_argument("--token", default=os.environ.get("SURVEY_TOKEN", ""),
                    help="shared secret; the app sends it as a Bearer token "
                         "(or set SURVEY_TOKEN env var)")
    args = ap.parse_args()

    TOKEN = args.token or None
    ROOT = os.path.abspath(args.dir)
    os.makedirs(ROOT, exist_ok=True)

    if not TOKEN:
        print("WARNING: no --token set; anyone who can reach this port can upload.", file=sys.stderr)

    srv = ThreadingHTTPServer((args.bind, args.port), Handler)
    print(f"Site Survey receiver listening on http://{args.bind}:{args.port}")
    print(f"Saving to {ROOT}")
    print("Front with:  tailscale serve --bg localhost:%d" % args.port)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
