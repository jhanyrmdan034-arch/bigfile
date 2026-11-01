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
        node.__instanceResize = { from: sym.size, to: raw.size };
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
    let children = rawKids.map((k) => visit(k, childPath, childOv, depth + 1, childGuard));
    children = adjustChildren(node, children);
    const out = { ...node, __path: childPath.join('>'), children };
    delete out.__srcKey;
    return out;
  };
  return visit(root, [], null, 0, []);
}

const BG_LAYER = /^(Fill|Blur|Mask|Effect|Gradient Blur|BG|Background|Liquid Glass|Surface|Overlay)$/i;
function near(a, b) { return a != null && b != null && Math.abs(a - b) < 1.5; }

// Figma auto-layout / instance-resize: give child layers the size the design intends.
function adjustChildren(parent, children) {
  const ps = parent.size;
  if (!ps || !children.length) return children;
  const padL = parent.stackHorizontalPadding ?? 0, padR = parent.stackPaddingRight ?? padL;
  const padT = parent.stackVerticalPadding ?? 0, padB = parent.stackPaddingBottom ?? padT;
  const innerW = Math.max(0, ps.x - padL - padR), innerH = Math.max(0, ps.y - padT - padB);
  const rs = parent.__instanceResize;
  return children.map((c) => {
    const cs = c.size;
    if (!cs) return c;
    const tr = c.transform || { m02: 0, m12: 0, m00: 1, m11: 1, m01: 0, m10: 0 };
    const atOrigin = Math.abs(tr.m02) < 0.5 && Math.abs(tr.m12) < 0.5;
    const identity = Math.abs(tr.m00 - 1) < 1e-5 && Math.abs(tr.m11 - 1) < 1e-5 && Math.abs(tr.m01) < 1e-5 && Math.abs(tr.m10) < 1e-5;
    if (!identity) return c;
    let w = cs.x, h = cs.y, changed = false;

    // (a) instance was resized: stretch layers that still carry the symbol's original size
    if (rs && rs.to && rs.from && atOrigin) {
      if (near(cs.x, rs.from.x) && near(cs.y, rs.from.y) && (!near(rs.from.x, rs.to.x) || !near(rs.from.y, rs.to.y))) {
        w = rs.to.x; h = rs.to.y; changed = true;
      }
    }
    // (b) auto-layout children that fill their parent
    const growW = (c.stackChildPrimaryGrow && parent.stackMode === 'HORIZONTAL') || c.stackPrimarySizing === 'FILL' && parent.stackMode === 'HORIZONTAL' || c.stackCounterSizing === 'FILL' && parent.stackMode === 'VERTICAL';
    const growH = (c.stackChildPrimaryGrow && parent.stackMode === 'VERTICAL') || c.stackPrimarySizing === 'FILL' && parent.stackMode === 'VERTICAL' || c.stackCounterSizing === 'FILL' && parent.stackMode === 'HORIZONTAL';
    if (growW && innerW > w) { w = innerW; changed = true; }
    if (growH && innerH > h) { h = innerH; changed = true; }
    // (d) background layers never stick out of their component
    if (!changed && atOrigin && BG_LAYER.test(c.name) && (w > innerW + 0.5 || h > innerH + 0.5) && innerW > 0 && innerH > 0) {
      w = Math.min(w, innerW); h = Math.min(h, innerH); changed = true;
    }
    // (c) background layers of a component that were left at their default 100x100
    if (!changed && atOrigin && !c.children?.length && BG_LAYER.test(c.name) && (w < innerW - 1 || h < innerH - 1)) {
      if (innerW > 0 && innerH > 0 && w >= innerW * 0.2 && h >= innerH * 0.2) { w = innerW; h = innerH; changed = true; }
    }
    if (!changed) return c;
    return { ...c, size: { x: w, y: h } };
  });
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
