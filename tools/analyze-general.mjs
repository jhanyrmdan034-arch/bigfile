import { fileURLToPath } from 'url';
import fs from 'fs';
import { loadFig, buildIndex, resolveTree } from './lib/fig.mjs';

const SCREENS = ['Contacts', 'Chat list', 'Chat list - Stories', 'Settings', 'Profile', 'Profile - Scroll',
  'Chat - Personal', 'Chat - Personal - Info', 'Chat - Bot - Greeting', 'Chat - Bot', 'Chat - Bot - Info',
  'Chat - Group', 'Chat - Group - Info'];

const { msg } = loadFig(`${process.env.FIG_ROOT || fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')}/design/canvas.fig`);
const idx = buildIndex(msg);
const page = idx.nodes.find((n) => n.type === 'CANVAS' && n.name === 'General');
const frames = (idx.kids.get(page.__key) || []);

const stats = { types: {}, paints: {}, fonts: {}, images: new Map(), patterns: 0, masks: 0, effects: 0, gradients: 0, textNodes: 0, characters: 0, nodes: 0, maxDepth: 0 };
const hexHash = (h) => Array.from({ length: 20 }, (_, i) => (h?.[i] ?? 0).toString(16).padStart(2, '0')).join('');

for (const f of frames) {
  if (f.type !== 'FRAME') continue;
  const tree = resolveTree(f, idx);
  const walk = (n, d) => {
    stats.nodes++;
    stats.maxDepth = Math.max(stats.maxDepth, d);
    stats.types[n.type] = (stats.types[n.type] || 0) + 1;
    for (const p of [...(n.fillPaints || []), ...(n.strokePaints || [])]) {
      stats.paints[p.type] = (stats.paints[p.type] || 0) + 1;
      if (p.type === 'PATTERN') stats.patterns++;
      if (p.type && p.type.startsWith('GRADIENT')) stats.gradients++;
      if (p.type === 'IMAGE' && p.image?.hash) {
        const k = hexHash(p.image.hash);
        const cur = stats.images.get(k) || { count: 0, name: p.image.name, sizes: [] };
        cur.count++;
        if (n.size) cur.sizes.push([Math.round(n.size.x), Math.round(n.size.y)]);
        stats.images.set(k, cur);
      }
    }
    if (n.mask) stats.masks++;
    if (n.effects && n.effects.length) stats.effects++;
    if (n.type === 'TEXT') {
      stats.textNodes++;
      const chars = n.textData?.characters || '';
      stats.characters += chars.length;
      const f2 = `${n.fontName?.family}/${n.fontName?.style}`;
      stats.fonts[f2] = (stats.fonts[f2] || 0) + 1;
    }
    (n.children || []).forEach((c) => walk(c, d + 1));
  };
  walk(tree, 0);
}
console.log('screens:', frames.filter((f) => f.type === 'FRAME').length);
console.log('nodes', stats.nodes, 'maxDepth', stats.maxDepth);
console.log('types', JSON.stringify(stats.types));
console.log('paints', JSON.stringify(stats.paints));
console.log('fonts', JSON.stringify(stats.fonts));
console.log('text nodes', stats.textNodes, 'chars', stats.characters);
console.log('masks', stats.masks, 'effects', stats.effects, 'gradients', stats.gradients, 'patterns', stats.patterns);
console.log('unique images', stats.images.size);
const list = [...stats.images.entries()].map(([hash, v]) => ({ hash, ...v, maxW: Math.max(...v.sizes.map((s) => s[0])), maxH: Math.max(...v.sizes.map((s) => s[1])) }));
fs.writeFileSync('out/general-images.json', JSON.stringify(list, null, 1));
list.sort((a, b) => b.maxW * b.maxH - a.maxW * a.maxH).slice(0, 15).forEach((i) => console.log(i.hash.slice(0, 10), i.name, i.count, i.maxW + 'x' + i.maxH));
