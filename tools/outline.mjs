import { loadFig, buildIndex, resolveTree, guidKey } from './lib/fig.mjs';
const { msg } = loadFig('/home/user/bigfile/design/canvas.fig');
const idx = buildIndex(msg);
const pname = process.argv[2] || 'General';
const page = idx.nodes.find((n) => n.type === 'CANVAS' && n.name === pname);
const frameName = process.argv[3];
const frame = (idx.kids.get(page.__key) || []).find((n) => n.name === frameName);
const t = resolveTree(frame, idx);
const out = [];
const walk = (n, d) => {
  const tr = n.transform || {};
  const txt = n.textData?.characters;
  out.push(`${'  '.repeat(d)}${n.type}|${n.name}|${Math.round(tr.m02 || 0)},${Math.round(tr.m12 || 0)}|${n.size ? Math.round(n.size.x) + 'x' + Math.round(n.size.y) : ''}${txt ? '|"' + txt.replace(/\n/g, '\\n').slice(0, 40) + '"' : ''}`);
  (n.children || []).forEach((c) => walk(c, d + 1));
};
walk(t, 0);
console.log(out.join('\n'));
