import fs from 'fs';
import sharp from 'sharp';
import { loadFig, buildIndex } from './lib/fig.mjs';
import { renderNodeToSvg } from './lib/render.mjs';

const [,, name, pageName, outFile, scaleArg] = process.argv;
const scale = +(scaleArg || 1);
const { msg } = loadFig('/home/user/bigfile/design/canvas.fig');
const idx = buildIndex(msg);
const page = idx.nodes.find(n => n.type === 'CANVAS' && n.name === pageName);
if (!page) { console.error('page not found'); process.exit(1); }
const find = (n, depth=0) => {
  if (n.name === name) return n;
  for (const k of (idx.kids.get(n.__key)||[])) { const r = find(k, depth+1); if (r) return r; }
  return null;
};
const target = find(page);
if (!target) { console.error('node not found'); process.exit(1); }
const svg = renderNodeToSvg(target, idx, msg.blobs, {});
fs.writeFileSync(outFile.replace(/\.png$/, '.svg'), svg);
const png = await sharp(Buffer.from(svg), { density: 72 * scale }).png().toBuffer();
fs.writeFileSync(outFile, png);
console.log('wrote', outFile, (png.length/1024).toFixed(0)+'KB');
