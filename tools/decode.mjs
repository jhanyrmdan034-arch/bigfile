import fs from 'fs';
import zlib from 'zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';

const file = process.argv[2];
const outDir = process.argv[3] || 'out';
fs.mkdirSync(outDir, { recursive: true });
const buf = fs.readFileSync(file);
if (buf.slice(0, 8).toString() !== 'fig-kiwi') throw new Error('not fig-kiwi');
let p = 8;
const version = buf.readUInt32LE(p); p += 4;
console.log('version', version);

let fzstd = null;
function zstdDecompress(b) {
  if (zlib.zstdDecompressSync) return zlib.zstdDecompressSync(b);
  if (!fzstd) fzstd = require('fzstd');
  return Buffer.from(fzstd.decompress(new Uint8Array(b)));
}
function decompress(b) {
  // fig files use: deflate-raw for schema, zstd for messages
  if (b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd) {
    return zstdDecompress(b);
  }
  try { return zlib.inflateRawSync(b); } catch (e) { return zlib.inflateSync(b); }
}

const schemaLen = buf.readUInt32LE(p); p += 4;
const schemaBin = decompress(buf.slice(p, p + schemaLen)); p += schemaLen;
console.log('schema raw bytes', schemaBin.length, 'next offset', p);
const schema = decodeBinarySchema(schemaBin);
const compiled = compileSchema(schema);
fs.writeFileSync(outDir + '/schema.json', JSON.stringify(schema, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
console.log('defs:', Object.keys(schema.definitions).length);

let idx = 0;
while (p + 4 <= buf.length) {
  const len = buf.readUInt32LE(p); p += 4;
  if (len === 0 || p + len > buf.length) { console.log('stop at', p, 'len', len); break; }
  const raw = decompress(buf.slice(p, p + len)); p += len;
  console.log(`block ${idx}: compressed ${len} -> raw ${raw.length}`);
  fs.writeFileSync(`${outDir}/block${idx}.raw`, raw);
  try {
    const msg = compiled.decodeMessage(raw);
    const json = JSON.stringify(msg);
    fs.writeFileSync(`${outDir}/block${idx}.json`, json);
    console.log(`  keys: ${Object.keys(msg).join(',')} | json ${(json.length / 1e6).toFixed(2)} MB`);
  } catch (e) {
    console.log('  decode fail:', e.message);
  }
  idx++;
}
console.log('done, blocks:', idx);
