"""Local-only development server. Revalidate source files during UI iteration."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class GameHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.split('?', 1)[0].endswith(('.js', '.css', '.html')) or self.path.split('?', 1)[0] == '/':
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    server = ThreadingHTTPServer(('127.0.0.1', 8765), partial(GameHandler, directory=str(root)))
    print('模型育成计划：http://127.0.0.1:8765/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
