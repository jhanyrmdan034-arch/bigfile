// Interaction smoke test: navigation, tabs, sheets, dialogs, back handling, composer.
import fs from 'fs';
import http from 'http';
import path from 'path';
import puppeteer from 'puppeteer';

const ROOT = process.env.FIG_ROOT || path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const WWW = path.join(ROOT, 'www');
const OUT = path.join(ROOT, 'previews');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(WWW, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(8098, '127.0.0.1', r));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 917, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('EXC ' + String(e).slice(0, 200)));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !/favicon|404 \(Not Found\)/i.test(t)) errors.push('CONSOLE ' + t.slice(0, 200));
});
page.on('requestfailed', () => {});
page.on('response', (r) => { if (r.status() === 404 && !/favicon/.test(r.url())) errors.push('HTTP404 ' + r.url()); });

const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

await page.goto('http://127.0.0.1:8098/index.html', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 900));
check('boot: chat list is the root screen', (await page.evaluate(() => document.querySelectorAll('.screen').length)) === 1);

const tap = (tag) => page.evaluate((t) => {
  const el = document.querySelector('.screen [data-hot="' + t + '"], .screen [data-hot^="' + t + '"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return true;
}, tag);

// open a chat by tapping the first list row
const rowTapped = await tap('row');
check('chat list rows are tappable', rowTapped);
await new Promise((r) => setTimeout(r, 900));
check('tap chat row -> chat screen pushed', (await page.evaluate(() => document.querySelectorAll('.screen').length)) === 2,
  'screens=' + (await page.evaluate(() => document.querySelectorAll('.screen').length)));
await page.screenshot({ path: path.join(OUT, 'smoke-chat-open.png') });

// open the composer and type
const typed = await page.evaluate(async () => {
  const bar = document.querySelector('.screen:last-child [data-n="Write bar"]');
  if (!bar) return 'no write bar';
  const input = bar.querySelector('input');
  if (!input) return 'no input';
  input.focus();
  input.value = 'Hello from the prototype';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  return document.querySelectorAll('.localMsg').length ? 'sent' : 'not sent';
});
check('composer: typed message appears in the chat', typed === 'sent', typed);
await page.screenshot({ path: path.join(OUT, 'smoke-typed-message.png') });

// back gesture pops the screen
await page.evaluate(() => window.__androidBack());
await new Promise((r) => setTimeout(r, 500));
check('system back -> previous screen', (await page.evaluate(() => document.querySelectorAll('.screen').length)) === 1);

// FAB opens the design's bottom sheet
const fabTapped = await tap('fab');
check('FAB hotspot exists', fabTapped);
await new Promise((r) => setTimeout(r, 900));
const sheetOpen = await page.evaluate(() => {
  const ov = document.getElementById('overlay');
  return !!ov && ov.classList.contains('on') && ov.querySelector('.sheetInner').innerHTML.length > 100;
});
check('FAB -> design bottom sheet opens', sheetOpen);
await page.screenshot({ path: path.join(OUT, 'smoke-sheet.png') });

// scrim tap closes it
await page.evaluate(() => document.getElementById('scrim').dispatchEvent(new MouseEvent('click', { bubbles: true })));
await new Promise((r) => setTimeout(r, 500));
check('tap outside -> sheet closes', (await page.evaluate(() => document.getElementById('overlay').classList.contains('on'))) === false);

// tab bar switches root screens
await tap('tab2');
await new Promise((r) => setTimeout(r, 1200));
const tabScreen = await page.evaluate(() => {
  const scr = document.querySelector('.screen');
  return scr ? scr.dataset.screen : null;
});
check('tab bar switches screens', !!tabScreen && tabScreen !== 'chat-list', 'now=' + tabScreen);

check('gallery screens are generated', fs.existsSync(path.join(WWW, 'screens/kit-general.js')) && fs.existsSync(path.join(WWW, 'screens/kit-messages.js')));

// design sections index (every page of the Figma file) opens from a menu row
const kitIndex = await page.evaluate(async () => {
  window.__openKitIndex(window.__MANIFEST.pages);
  await new Promise((r) => setTimeout(r, 300));
  const rows = document.querySelectorAll('#overlay [data-page]');
  if (!rows.length) return 'no rows';
  const want = rows[0].getAttribute('data-page');
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 2200));
  const scr = document.querySelector('.screen');
  return (scr ? scr.dataset.screen : 'none') + '(want ' + want + ')';
});
check('design sections index -> kit gallery page', /^kit-/.test(kitIndex || ''), 'opened=' + kitIndex);
await page.screenshot({ path: path.join(OUT, 'smoke-kit-page.png') });

// dialog overlay
const dialogShown = await page.evaluate(async () => {
  window.__androidBack();
  await new Promise((r) => setTimeout(r, 400));
  return true;
});
check('back from gallery returns to the app', (await page.evaluate(() => {
  const s = document.querySelector('.screen');
  return !!s && !/^kit-/.test(s.dataset.screen);
})));

check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(results.join('\n'));
fs.writeFileSync(path.join(ROOT, 'previews/smoke.txt'), results.join('\n') + '\n');
await browser.close();
server.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
