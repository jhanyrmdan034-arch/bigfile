// Screenshot every generated screen (used for visual verification against the Figma design).
import fs from 'fs';
import http from 'http';
import path from 'path';
import puppeteer from 'puppeteer';

const ROOT = '/home/user/bigfile';
const WWW = `${ROOT}/www`;
const OUT = `${ROOT}/previews`;
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(WWW, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(8099, '127.0.0.1', r));

const manifest = JSON.parse(fs.readFileSync(`${WWW}/manifest.json`, 'utf8'));
const only = process.argv[2] ? process.argv[2].split(',') : null;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 917, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE EXC:', String(e).slice(0, 160)));

const targets = [...manifest.screens.map((s) => ({ ...s, kind: 'screen' })), ...manifest.pages, ...(manifest.components || [])];
let n = 0;
for (const t of targets) {
  if (only && !only.includes(t.id)) continue;
  await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  const info = await page.evaluate(async (id) => {
    return await window.__previewScreen(id);
  }, t.id);
  await new Promise((r) => setTimeout(r, 300));
  const file = `${OUT}/${t.id}.png`;
  await page.screenshot({ path: file });
  console.log('shot', t.id, JSON.stringify(info));
  n++;
}
await browser.close();
server.close();
console.log('screenshots:', n);
