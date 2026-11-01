import { fileURLToPath } from 'url';
import fs from 'fs';
import { loadFig, buildIndex, resolveTree } from './lib/fig.mjs';
const { msg } = loadFig(`${process.env.FIG_ROOT || fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')}/design/canvas.fig`);
const idx = buildIndex(msg);
const pages = idx.nodes.filter(n => n.type === 'CANVAS');
let totalNodes = 0;
const perPage = [];
const paintTypes = {}, fonts = {}, imgHashes = new Map(), textSamples = [];
for (const page of pages) {
  const frames = idx.kids.get(page.__key) || [];
  let count = 0;
  for (const f of frames) {
    if (f.type !== 'FRAME' && f.type !== 'INSTANCE') continue;
    const t = resolveTree(f, idx);
    const walk = (n) => {
      count++; totalNodes++;
      for (const p of [...(n.fillPaints||[]), ...(n.strokePaints||[])]) {
        paintTypes[p.type] = (paintTypes[p.type]||0)+1;
        if (p.type==='IMAGE' && p.image?.hash) { const h = Array.from({length:20},(_,i)=>(p.image.hash[i]??0).toString(16).padStart(2,'0')).join(''); imgHashes.set(h, (imgHashes.get(h)||0)+1); }
      }
      if (n.type==='TEXT') {
        const k = `${n.fontName?.family}/${n.fontName?.style}/${n.textAlignHorizontal||'L'}/${n.textData?.lines?.length||0}`;
        fonts[k] = (fonts[k]||0)+1;
        if (textSamples.length < 25) textSamples.push(`${n.fontName?.family}|${n.fontName?.style}|${n.fontSize}|${JSON.stringify((n.textData?.characters||'').slice(0,40))}|lines=${n.textData?.lines?.length}|styles=${[...new Set((n.textData?.lines||[]).map(l=>l.styleId))].join(',')}`);
      }
      (n.children||[]).forEach(walk);
    };
    walk(t);
  }
  perPage.push([page.name, frames.length, count]);
}
console.log('pages (name, topItems, resolvedNodes):');
perPage.forEach(p=>console.log(' ', p.join(' | ')));
console.log('total resolved nodes across kit:', totalNodes);
console.log('paints:', JSON.stringify(paintTypes));
console.log('unique images:', imgHashes.size);
console.log('\nfonts:'); Object.entries(fonts).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  ',k,v));
console.log('\ntext samples:'); textSamples.forEach(s=>console.log('  ',s));
fs.writeFileSync('out/all-images.json', JSON.stringify([...imgHashes.entries()]));
