"""Local public-edition preview. Strict static allowlist; never opens the personal database."""
import argparse
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parent
DB=ROOT/'data'/'public-research.sqlite3'

@contextmanager
def connect(path=DB):
    path.parent.mkdir(parents=True,exist_ok=True)
    con=sqlite3.connect(path)
    con.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY,type TEXT,observed_at TEXT,payload TEXT)')
    try:
        with con:yield con
    finally:con.close()

def put(con,key,kind,payload):
    con.execute('INSERT OR IGNORE INTO records VALUES (?,?,?,?)',(key,kind,payload.get('observed_at'),json.dumps(payload,allow_nan=False)))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        name={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/feed.json':'feed.json'}.get(urlsplit(self.path).path)
        if not name:self.send_error(404);return
        body=(ROOT/'site'/name).read_bytes()
        mime={'html':'text/html','css':'text/css','js':'text/javascript','json':'application/json'}[name.split('.')[-1]]
        self.send_response(200);self.send_header('Content-Type',mime+'; charset=utf-8');self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers();self.wfile.write(body)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8877);args=parser.parse_args()
    print(f'Public edition DEMO: http://127.0.0.1:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
