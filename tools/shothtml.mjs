import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const url = process.argv[2];
const out = process.argv[3];
const width = +(process.argv[4] || 412);
const height = +(process.argv[5] || 917);
const fullPage = process.argv[6] === 'full';

chromium.setHeadlessMode = true;
const execPath = await chromium.executablePath();
console.log('chromium:', execPath);
const browser = await puppeteer.launch({
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--force-color-profile=srgb'],
  executablePath: execPath,
  headless: true,
  defaultViewport: { width, height, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGE EXC:', String(e).slice(0, 300)));
if (url.startsWith('http')) await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
else {
  const html = fs.readFileSync(url, 'utf8');
  await page.setContent(html, { waitUntil: 'networkidle2', timeout: 120000 });
}
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: out, fullPage, captureBeyondViewport: fullPage });
console.log('shot ->', out);
await browser.close();
