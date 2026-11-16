#!/usr/bin/env python3
"""Static file server with HTTP Range support (needed for audio/video playback)."""
import os
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class RangeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            rng = self.headers.get('Range')
            if rng:
                m = re.match(r'bytes=(\d*)-(\d*)', rng)
                if m:
                    size = os.path.getsize(path)
                    start = int(m.group(1)) if m.group(1) else 0
                    end = int(m.group(2)) if m.group(2) else size - 1
                    end = min(end, size - 1)
                    if start > end or start >= size:
                        self.send_error(416)
                        return None
                    self.send_response(206)
                    self.send_header('Content-Type', self.guess_type(path))
                    self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                    self.send_header('Content-Length', str(end - start + 1))
                    self.end_headers()
                    f = open(path, 'rb')
                    f.seek(start)
                    self._range_len = end - start + 1
                    return f
        return super().send_head()

    def copyfile(self, source, outputfile):
        if hasattr(self, '_range_len'):
            remaining = self._range_len
            while remaining > 0:
                chunk = source.read(min(65536, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        else:
            super().copyfile(source, outputfile)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    directory = sys.argv[2] if len(sys.argv) > 2 else '.'
    os.chdir(directory)
    server = HTTPServer(('127.0.0.1', port), RangeHandler)
    print(f'Serving {os.path.abspath(directory)} on http://127.0.0.1:{port}', flush=True)
    server.serve_forever()
