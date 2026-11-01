import { fileURLToPath } from 'url';
// Extract the images referenced by the generated screens from big.zip and downscale them.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import sharp from 'sharp';

const ROOT = process.env.FIG_ROOT || fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const WWW = `${ROOT}/www`;
const IMG_OUT = `${WWW}/assets/img`;
const UNZIP_DIR = '/tmp/figimages';

const manifest = JSON.parse(fs.readFileSync(`${WWW}/manifest.json`, 'utf8'));
const needed = manifest.images || [];
console.log('images referenced by the design:', needed.length);

if (!fs.existsSync(UNZIP_DIR) || fs.readdirSync(UNZIP_DIR).length < needed.length) {
  fs.mkdirSync(UNZIP_DIR, { recursive: true });
  console.log('extracting images from big.zip ...');
  execSync('unzip -o -j -q big.zip "images/*" -d ' + UNZIP_DIR, { cwd: ROOT, stdio: 'inherit' });
}

fs.mkdirSync(IMG_OUT, { recursive: true });
let ok = 0, missing = 0, bytes = 0;
const missingList = [];
for (const img of needed) {
  const src = `${UNZIP_DIR}/${img.hash}`;
  if (!fs.existsSync(src)) { missing++; missingList.push(img.hash); continue; }
  const maxDim = Math.min(768, Math.max(96, Math.max(img.maxW, img.maxH) * 2));
  const out = `${IMG_OUT}/${img.hash}.webp`;
  try {
    const buf = await sharp(src)
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
    fs.writeFileSync(out, buf);
    bytes += buf.length;
    ok++;
  } catch (e) {
    // fall back to a png copy of the original
    try {
      const buf = await sharp(src).resize({ width: maxDim, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      fs.writeFileSync(`${IMG_OUT}/${img.hash}.png`, buf);
      bytes += buf.length; ok++;
    } catch (e2) { missing++; missingList.push(img.hash); }
  }
}
console.log(`images written: ${ok}, missing: ${missing}, total ${(bytes / 1e6).toFixed(2)} MB`);
if (missing) console.log('missing hashes:', missingList.slice(0, 10).join(','));
