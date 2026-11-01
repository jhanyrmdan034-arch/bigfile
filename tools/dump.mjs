import fs from 'fs'; import zlib from 'zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';
const buf = fs.readFileSync('/home/user/bigfile/design/canvas.fig');
let p=12; const sl=buf.readUInt32LE(p); p+=4;
const schema = decodeBinarySchema(zlib.inflateRawSync(buf.slice(p,p+sl)));
const c = compileSchema(schema);
const msg = c.decodeMessage(fs.readFileSync('out/block0.raw'));
const want = process.argv[2].split(',');
const seen = new Set();
for (const n of msg.nodeChanges) {
  if (want.includes(n.type) && !seen.has(n.type)) {
    seen.add(n.type);
    const o = JSON.parse(JSON.stringify(n, (k,v)=> typeof v === 'bigint' ? v.toString()+'n' : (v instanceof Uint8Array ? `<${v.length} bytes>` : v)));
    console.log('\n===== '+n.type+' =====');
    console.log(JSON.stringify(o, null, 1).slice(0, 3500));
  }
}
