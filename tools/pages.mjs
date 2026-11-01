import fs from 'fs';
import zlib from 'zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';

const file = '/home/user/bigfile/design/canvas.fig';
const outDir = '/home/user/bigfile/tools/out';
const buf = fs.readFileSync(file);
let p = 12;
const schemaLen = buf.readUInt32LE(p); p += 4;
const schemaBin = zlib.inflateRawSync(buf.slice(p, p + schemaLen));
const schema = decodeBinarySchema(schemaBin);
const compiled = compileSchema(schema);
const msg = compiled.decodeMessage(fs.readFileSync(`${outDir}/block0.raw`));
const changes = msg.nodeChanges;

const byGuid = new Map();
for (const c of changes) {
  const k = c.guid ? `${c.guid.sessionID}:${c.guid.localID}` : null;
  c.__key = k;
  if (k) byGuid.set(k, c);
}
const pk = (c) => (c.parentIndex && c.parentIndex.guid ? `${c.parentIndex.guid.sessionID}:${c.parentIndex.guid.localID}` : null);
const kids = new Map();
for (const c of changes) {
  const k = pk(c);
  if (!k) continue;
  if (!kids.has(k)) kids.set(k, []);
  kids.get(k).push(c);
}
const kind = (c) => (c.type === 'SYMBOL' ? 'C' : c.type === 'INSTANCE' ? 'I' : c.type);
function desc(c) {
  const s = c.size ? ` ${Math.round(c.size.x)}x${Math.round(c.size.y)}` : '';
  return `${kind(c)} "${c.name}"${s}`;
}
const doc = changes.find(c => c.type === 'DOCUMENT');
const pages = kids.get(doc.__key) || [];
const lines = [];
let out = '';
for (const page of pages) {
  const pchildren = kids.get(page.__key) || [];
  out += `\n##### PAGE: ${page.name} (${pchildren.length} children)\n`;
  const walk = (n, depth, maxDepth) => {
    const cs = kids.get(n.__key) || [];
    out += `${'  '.repeat(depth)}${desc(n)} kids=${cs.length}\n`;
    if (depth < maxDepth) for (const c of cs.slice(0, 40)) walk(c, depth + 1, maxDepth);
  };
  for (const c of pchildren) {
    const cs = kids.get(c.__key) || [];
    out += `- ${desc(c)} kids=${cs.length}\n`;
    if (depthCap(pchildren) && cs.length) {
      for (const cc of cs.slice(0, 30)) out += `    · ${desc(cc)} kids=${(kids.get(cc.__key) || []).length}\n`;
    }
  }
}
function depthCap(arr) { return arr.length < 400; }
fs.writeFileSync('/home/user/bigfile/tools/out/pages.txt', out);
console.log(out.slice(0, 20000));
