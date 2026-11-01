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
const clean = o => JSON.parse(JSON.stringify(o,(k,v)=> typeof v==='bigint'?v.toString(): v instanceof Uint8Array? `<${v.length}b>` : v));
const inst = changes.find(n=>n.type==='INSTANCE' && n.name==='Item');
console.log('=== INSTANCE ===');
console.log(JSON.stringify(clean(inst),null,1).slice(0,4000));
