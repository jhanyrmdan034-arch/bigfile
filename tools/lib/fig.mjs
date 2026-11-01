// Load a Figma .fig file into a resolved scene tree (instances expanded).
import fs from 'fs';
import zlib from 'zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';

export function loadFig(file) {
  const buf = fs.readFileSync(file);
  if (buf.slice(0, 8).toString() !== 'fig-kiwi') throw new Error('not fig-kiwi');
  let p = 12;
  const schemaLen = buf.readUInt32LE(p); p += 4;
  const schema = decodeBinarySchema(zlib.inflateRawSync(buf.slice(p, p + schemaLen)));
  p += schemaLen;
  const compiled = compileSchema(schema);
  const len = buf.readUInt32LE(p); p += 4;
  const comp = buf.slice(p, p + len);
  const raw = comp[0] === 0x28 && comp[1] === 0xb5 ? zlib.zstdDecompressSync(comp) : zlib.inflateRawSync(comp);
  const msg = compiled.decodeMessage(raw);
  return { schema, msg };
}

export const guidKey = (g) => (g ? `${g.sessionID}:${g.localID}` : null);

export function buildIndex(msg) {
  const nodes = msg.nodeChanges;
  const byKey = new Map();
  const kids = new Map();
  for (const n of nodes) {
    n.__key = guidKey(n.guid);
    byKey.set(n.__key, n);
  }
  for (const n of nodes) {
    const pk = n.parentIndex && n.parentIndex.guid ? guidKey(n.parentIndex.guid) : null;
    if (!pk) continue;
    if (!kids.has(pk)) kids.set(pk, []);
    kids.get(pk).push(n);
  }
  for (const arr of kids.values()) {
    arr.sort((a, b) => (String(a.parentIndex.position) < String(b.parentIndex.position) ? -1 : String(a.parentIndex.position) > String(b.parentIndex.position) ? 1 : 0));
  }
  return { byKey, kids, nodes };
}

const OVERRIDE_FIELDS = ['fillPaints', 'strokePaints', 'textData', 'visible', 'opacity', 'cornerRadius',
  'rectangleTopLeftCornerRadius', 'rectangleTopRightCornerRadius', 'rectangleBottomLeftCornerRadius',
  'rectangleBottomRightCornerRadius', 'strokeWeight', 'effects', 'fontName', 'letterSpacing', 'name', 'dashPattern',
  'strokeAlign', 'blendMode', 'textDecoration', 'maxLines', 'styleIdForFill', 'fontSize', 'componentPropAssignments'];

function overrideMap(inst) {
  const m = new Map();
  const sds = inst.symbolData;
  for (const ov of (sds && sds.symbolOverrides) || []) {
    if (!ov.guidPath || !ov.guidPath.guids) continue;
    const path = ov.guidPath.guids.map(guidKey).join('>');
    if (!m.has(path)) m.set(path, []);
    m.get(path).push(ov);
  }
  return m;
}

function applyOverrides(node, ovs, depthInfo) {
  if (!ovs || !ovs.length) return node;
  const out = { ...node };
  for (const ov of ovs) {
    for (const f of OVERRIDE_FIELDS) if (ov[f] !== undefined) out[f] = ov[f];
    if (ov.overriddenSymbolID && out.symbolData) {
      out.symbolData = { ...out.symbolData, symbolID: ov.overriddenSymbolID, symbolOverrides: [] };
      out.__swapped = true;
    }
  }
  if (depthInfo) Object.assign(out, depthInfo);
  return out;
}

// Resolve a node (raw scene node) into a plain tree with instances expanded.
export function resolveTree(root, index, opts = {}) {
  const maxDepth = opts.maxDepth ?? 30;
  const visit = (raw, path, ovMap, depth, guard) => {
    if (depth > maxDepth) return { ...raw, children: [] };
    let node = raw;
    let childPath = path.concat([guidKey(raw.guid)]);
    let childOv = ovMap;
    let childGuard = guard;

    if (raw.type === 'INSTANCE') {
      const sds = raw.symbolData;
      const symId = sds && sds.symbolID ? guidKey(sds.symbolID) : null;
      const sym = symId ? index.byKey.get(symId) : null;
      if (sym && !guard.includes(symId)) {
        const m = overrideMap(raw);
        const symPath = guidKey(sym.guid);
        node = applyOverrides(sym, m.get(symPath), { __instanceOf: raw.name, __instanceSize: raw.size, __instanceKey: guidKey(raw.guid) });
        node.size = raw.size || sym.size;
        node.transform = raw.transform || sym.transform;
        node.name = raw.name;
        node.__srcKey = sym.__key;
        childPath = [symPath];
        childOv = m;
        childGuard = guard.concat([symId]);
        // resolve swapped symbol if any
        if (node.__swapped && node.symbolData?.symbolID) {
          const sw = index.byKey.get(guidKey(node.symbolData.symbolID));
          if (sw && !guard.includes(guidKey(sw.guid))) {
            node = applyOverrides(sw, m.get(guidKey(sw.guid)), { __instanceOf: raw.name, __instanceSize: raw.size, __instanceKey: guidKey(raw.guid) });
            node.__srcKey = sw.__key;
            childPath = [guidKey(sw.guid)];
            childGuard = guard.concat([guidKey(sw.guid)]);
          }
        }
      } else {
        return { ...raw, children: [] };
      }
    } else {
      const ovs = ovMap ? ovMap.get(childPath.join('>')) : null;
      if (ovs) node = applyOverrides(node, ovs, null);
    }

    const srcKey = node.__srcKey || guidKey(node.guid);
    const rawKids = index.kids.get(srcKey) || [];
    // instance-level structural overrides (children added/removed) are not represented; fine for this kit
    const children = rawKids.map((k) => visit(k, childPath, childOv, depth + 1, childGuard));
    const out = { ...node, __path: childPath.join('>'), children };
    delete out.__srcKey;
    return out;
  };
  return visit(root, [], null, 0, []);
}

export function findByName(page, index, name, type) {
  const found = [];
  const walk = (n) => {
    if (n.name === name && (!type || n.type === type)) found.push(n);
    for (const k of index.kids.get(n.__key) || []) walk(k);
  };
  walk(page);
  return found;
}

export function parseCommands(blobIn) {
  const blob = Buffer.isBuffer(blobIn) ? blobIn : Buffer.from(blobIn.buffer || blobIn, blobIn.byteOffset || 0, blobIn.length);
  const parts = [];
  let i = 0;
  const f = (o) => blob.readFloatLE(o);
  const r = (v) => Math.round(v * 100) / 100;
  while (i < blob.length) {
    const op = blob[i]; i += 1;
    if (op === 0) continue;
    if (op === 3) { parts.push('Z'); continue; }
    if (op === 1) { parts.push(`M${r(f(i))} ${r(f(i + 4))}`); i += 8; continue; }
    if (op === 2) { parts.push(`L${r(f(i))} ${r(f(i + 4))}`); i += 8; continue; }
    if (op === 4) { parts.push(`C${r(f(i))} ${r(f(i + 4))} ${r(f(i + 8))} ${r(f(i + 12))} ${r(f(i + 16))} ${r(f(i + 20))}`); i += 24; continue; }
    break;
  }
  return parts.join(' ');
}
