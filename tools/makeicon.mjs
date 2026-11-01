import fs from 'fs';
import sharp from 'sharp';
import { loadFig, buildIndex, resolveTree, parseCommands } from './lib/fig.mjs';
const ROOT = '/home/user/bigfile';
const { msg } = loadFig(`${ROOT}/design/canvas.fig`);
const idx = buildIndex(msg);
const sym = idx.nodes.find(n => n.type === 'SYMBOL' && n.name === 'telegram');
console.log('telegram symbol', sym && sym.__key, sym && sym.size);
const t = resolveTree(sym, idx);
const gather = (n, out = []) => { if (n.type === 'VECTOR' && n.fillGeometry) out.push(n); (n.children || []).forEach(c => gather(c, out)); return out; };
const vecs = gather(t);
let inner = '';
for (const v of vecs) for (const g of v.fillGeometry || []) {
  const b = msg.blobs[g.commandsBlob];
  if (!b) continue;
  const d = parseCommands(b.bytes);
  const f = (v.fillPaints || [])[0];
  const fill = f && f.type === 'SOLID' ? `#${[f.color.r, f.color.g, f.color.b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}` : '#ffffff';
  inner += `<path d="${d}" fill="${fill}" transform="translate(${v.transform?.m02 || 0},${v.transform?.m12 || 0})"/>`;
}
const S = 512, pad = 96;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2AABEE"/><stop offset="1" stop-color="#229ED9"/></linearGradient></defs><rect width="${S}" height="${S}" rx="112" fill="url(#g)"/><g transform="translate(${pad},${pad}) scale(${(S - pad * 2) / (t.size?.x || 24)})">${inner}</g></svg>`;
fs.writeFileSync(`${ROOT}/android/app/src/main/res/icon-source.svg`, svg);
const res = `${ROOT}/android/app/src/main/res`;
await sharp(Buffer.from(svg), { density: 72 }).png().resize(512, 512).toFile(`${res}/mipmap-xxxhdpi/ic_launcher.png`).catch(async () => {
  fs.mkdirSync(`${res}/mipmap-xxxhdpi`, { recursive: true });
  await sharp(Buffer.from(svg), { density: 72 }).png().resize(512, 512).toFile(`${res}/mipmap-xxxhdpi/ic_launcher.png`);
});
for (const [dir, size] of [['mipmap-mdpi', 48], ['mipmap-hdpi', 72], ['mipmap-xhdpi', 96], ['mipmap-xxhdpi', 144]]) {
  fs.mkdirSync(`${res}/${dir}`, { recursive: true });
  await sharp(Buffer.from(svg), { density: 72 }).png().resize(size, size).toFile(`${res}/${dir}/ic_launcher.png`);
}
await sharp(Buffer.from(svg), { density: 72 }).png().resize(432, 432).toFile(`${ROOT}/assets/icon-512-preview.png`).catch(() => {});
console.log('icon written');
