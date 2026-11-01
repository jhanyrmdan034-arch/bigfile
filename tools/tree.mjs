import fs from 'fs'; import zlib from 'zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';
const buf = fs.readFileSync('/home/user/bigfile/design/canvas.fig');
let p=12; const sl=buf.readUInt32LE(p); p+=4;
const schema = decodeBinarySchema(zlib.inflateRawSync(buf.slice(p,p+sl)));
const c = compileSchema(schema);
const msg = c.decodeMessage(fs.readFileSync('out/block0.raw'));
const changes = msg.nodeChanges;
const key = n => n.guid ? `${n.guid.sessionID}:${n.guid.localID}` : null;
const byGuid = new Map(); changes.forEach(n=>byGuid.set(key(n), n));
const kids = new Map();
for (const n of changes) { const pk=n.parentIndex&&n.parentIndex.guid?`${n.parentIndex.guid.sessionID}:${n.parentIndex.guid.localID}`:null; if(!pk) continue; if(!kids.has(pk))kids.set(pk,[]); kids.get(pk).push(n); }
const target = process.argv[2];
const maxDepth = +(process.argv[3]||6);
const showsz = process.argv[4]==='size';
const page = changes.find(n=>n.type==='CANVAS' && n.name===process.argv[5]);
const roots = page ? kids.get(key(page)) : [changes.find(n=>n.name===target)];
const found = [];
const search = (n) => { if (n.name===target) found.push(n); (kids.get(key(n))||[]).forEach(search); };
roots.forEach(search);
const t = found[0];
if (!t) { console.log('not found; roots:', roots.map(r=>r.name).join(', ')); process.exit(0); }
const walk=(n,d)=>{
  const tr=n.transform||{m02:0,m12:0};
  const extra=[];
  if (n.fillPaints&&n.fillPaints.length) extra.push('fills='+n.fillPaints.map(f=>f.type+(f.color?`(${[f.color.r,f.color.g,f.color.b].map(v=>Math.round(v*255)).join(',')}${f.color.a!==1?',a'+f.color.a.toFixed(2):''})`:'')).join('|'));
  if (n.cornerRadius) extra.push('r='+n.cornerRadius);
  if (n.strokePaints&&n.strokePaints.length) extra.push('stroke='+n.strokeWeight+'/'+n.strokePaints[0].type);
  if (n.opacity!==1&&n.opacity!==undefined) extra.push('op='+n.opacity.toFixed(2));
  if (n.type==='TEXT') extra.push(`"${(n.textData&&n.textData.characters||'').slice(0,40)}" ${n.fontSize}px ${n.fontName&&n.fontName.family}`);
  console.log(`${'  '.repeat(d)}${n.type==='SYMBOL'?'C':n.type} "${n.name}" @(${tr.m02.toFixed(1)},${tr.m12.toFixed(1)}) ${n.size?n.size.x.toFixed(0)+'x'+n.size.y.toFixed(0):''} ${extra.join(' ')}`);
  if (d<maxDepth) (kids.get(key(n))||[]).forEach(k=>walk(k,d+1));
};
walk(t,0);
console.log('total nodes in subtree:', count(t));
function count(n){ let s=1; (kids.get(key(n))||[]).forEach(k=>s+=count(k)); return s; }
