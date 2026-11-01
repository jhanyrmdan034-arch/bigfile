import fs from 'fs';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';

const outDir = process.argv[2] || 'out';
const file = process.argv[3] || '/home/user/bigfile/design/canvas.fig';

const buf = fs.readFileSync(file);
let p = 8 + 4;
const schemaLen = buf.readUInt32LE(p); p += 4;
const zlib = await import('zlib');
const schemaBin = zlib.inflateRawSync(buf.slice(p, p + schemaLen));
const schema = decodeBinarySchema(schemaBin);
const compiled = compileSchema(schema);
const msg = compiled.decodeMessage(fs.readFileSync(`${outDir}/block0.raw`));

const changes = msg.nodeChanges;
const blobs = msg.blobs || [];
console.log('nodeChanges:', changes.length, 'blobs:', blobs.length);
console.log('blob keys sample:', Object.keys(blobs[0] || {}));

const types = {};
for (const c of changes) types[c.type] = (types[c.type] || 0) + 1;
console.log('types:', Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));

// build map
const byGuid = new Map();
for (const c of changes) {
  const key = c.guid ? `${c.guid.sessionID}:${c.guid.localID}` : null;
  c.__key = key;
  if (key) byGuid.set(key, c);
}
function parentKey(c) {
  const pgn = c.parentIndex && c.parentIndex.guid;
  if (pgn) return `${pgn.sessionID}:${pgn.localID}`;
  return null;
}
// children index
const childrenOf = new Map();
for (const c of changes) {
  const pk = parentKey(c);
  if (!pk) continue;
  if (!childrenOf.has(pk)) childrenOf.set(pk, []);
  childrenOf.get(pk).push(c);
}

const phases = {};
for (const c of changes) phases[c.phase] = (phases[c.phase] || 0) + 1;
console.log('phases:', JSON.stringify(phases));

// top-level nodes (no parent or parent not present)
const roots = changes.filter(c => {
  const pk = parentKey(c);
  return !pk || !byGuid.has(pk);
});
console.log('\n== roots ==', roots.length);
for (const r of roots.slice(0, 60)) {
  const kids = (childrenOf.get(r.__key) || []).length;
  console.log(`${r.type}\t${r.name}\t${r.size ? `${r.size.x}x${r.size.y}` : ''}\tkids=${kids}\tphase=${r.phase}`);
}

// all pages (CANVAS type) with children frames
console.log('\n== canvases ==');
const canvases = changes.filter(c => c.type === 'CANVAS');
for (const cv of canvases) {
  const kids = childrenOf.get(cv.__key) || [];
  console.log(`PAGE "${cv.name}" frames=${kids.length}`);
}
fs.writeFileSync(`${outDir}/nodes-index.json`, JSON.stringify(changes.map(c => ({
  key: c.__key, type: c.type, name: c.name, phase: c.phase,
  size: c.size ? { x: c.size.x, y: c.size.y } : null,
  parent: parentKey(c),
  kids: (childrenOf.get(c.__key) || []).length,
}))));
console.log('\nwrote nodes-index.json');
