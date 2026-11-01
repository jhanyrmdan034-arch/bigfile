import fs from 'fs'; import zlib from 'zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';
const buf = fs.readFileSync('/home/user/bigfile/design/canvas.fig');
let p=12; const sl=buf.readUInt32LE(p); p+=4;
const schema = decodeBinarySchema(zlib.inflateRawSync(buf.slice(p,p+sl)));
const c = compileSchema(schema);
const msg = c.decodeMessage(fs.readFileSync('out/block0.raw'));
const changes = msg.nodeChanges;
const f = {}; let n=0, ov=0;
for (const node of changes) {
  if (node.type!=='INSTANCE' || !node.symbolData || !node.symbolData.symbolOverrides) continue;
  for (const o of node.symbolData.symbolOverrides) { ov++; for (const k of Object.keys(o)) f[k]=(f[k]||0)+1; }
}
console.log('instances with overrides total overrides', ov);
console.log(JSON.stringify(f,null,1));
// node-level fields frequency
const nf={};
for (const node of changes) for (const k of Object.keys(node)) nf[k]=(nf[k]||0)+1;
console.log('\nnode fields:', Object.entries(nf).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' '));
