// Minimal static server for the generated prototype (localhost preview + LAN testing).
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'www');
const PORT = Number(process.argv[2] || 8080);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log(`prototype on http://0.0.0.0:${PORT}`));
