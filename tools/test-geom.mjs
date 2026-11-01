import { loadFig, buildIndex, resolveTree, parseCommands, bboxOf } from './lib/fig.mjs';
const { msg } = loadFig('/home/user/bigfile/design/canvas.fig');
const idx = buildIndex(msg);
const blobs = msg.blobs;
// icon symbol 'user'
const sym = idx.nodes.find(n => n.type==='SYMBOL' && n.name==='user');
console.log('symbol', sym.name, sym.size);
const t = resolveTree(sym, idx);
const walk=(n,d=0)=>{
  console.log(' '.repeat(d)+n.type, n.name, n.size && `${n.size.x}x${n.size.y}`, n.fillGeometry ? 'geom:'+n.fillGeometry[0].commandsBlob : '');
  (n.children||[]).forEach(c=>walk(c,d+1));
};
walk(t);
const vec = t.children.find(c=>c.type==='VECTOR');
if (vec) {
  const blob = blobs[vec.fillGeometry[0].commandsBlob].bytes;
  const path = parseCommands(blob);
  console.log('\npath:', path.slice(0,200));
  console.log('bbox:', bboxOf(path));
  console.log('transform:', vec.transform, 'size', vec.size);
}
