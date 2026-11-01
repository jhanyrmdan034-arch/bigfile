import fs from 'fs';
import sharp from 'sharp';
import { loadFig, buildIndex, resolveTree, parseCommands } from './lib/fig.mjs';
const { msg } = loadFig('/home/user/bigfile/design/canvas.fig');
const idx = buildIndex(msg);
const sources = idx.nodes.find(n => n.type === 'CANVAS' && n.name === 'Sources');
const wrap = (idx.kids.get(sources.__key) || []).find(n => n.name === 'Icons - svg');
const icons = (idx.kids.get(wrap.__key) || []).slice(0, 64);
const gather = (n, out = []) => { if (n.type === 'VECTOR' && n.fillGeometry) out.push(n); (n.children||[]).forEach(c=>gather(c,out)); return out; };
const cells = icons.map((ic, i) => {
  const t = resolveTree(ic, idx);
  const vecs = gather(t);
  let inner = '';
  for (const v of vecs) {
    for (const g of v.fillGeometry || []) {
      const b = msg.blobs[g.commandsBlob];
      if (!b) continue;
      const d = parseCommands(b.bytes);
      const f = (v.fillPaints||[])[0];
      const fill = f && f.type === 'SOLID' ? `rgb(${Math.round(f.color.r*255)},${Math.round(f.color.g*255)},${Math.round(f.color.b*255)})` : '#000';
      inner += `<path d="${d}" fill="${fill}" transform="translate(${(v.transform?.m02||0)},${(v.transform?.m12||0)})"/>`;
    }
  }
  const cx = (i % 8) * 40, cy = Math.floor(i / 8) * 40;
  return `<g transform="translate(${cx + 8},${cy + 8})">${inner}</g>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${8*40}" height="${Math.ceil(icons.length/8)*40}"><rect width="100%" height="100%" fill="#fff"/>${cells}</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).png().toFile('out/icons.png');
fs.writeFileSync('out/icons.svg', svg);
console.log('icons', icons.map(i=>i.name).slice(0,16).join(','));
console.log(svg.length);
