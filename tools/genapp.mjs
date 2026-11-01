import { fileURLToPath } from 'url';
// Generate the Android UI prototype (HTML/CSS/JS) from the Figma .fig scene graph.
import fs from 'fs';
import path from 'path';
import { loadFig, buildIndex, resolveTree, parseCommands, guidKey } from './lib/fig.mjs';

const ROOT = process.env.FIG_ROOT || fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const OUT = `${ROOT}/www`;
const IMG_DIR = `${OUT}/assets/img`;

const FONTS = { Roboto: 1 };
const WEIGHT = { Thin: 100, ExtraLight: 200, UltraLight: 200, Light: 300, Regular: 400, Normal: 400, Medium: 500, SemiBold: 600, DemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900, Heavy: 900 };
const ASCENT = 0.9277, DESCENT = 0.2441;

const hexOf = (c) => {
  const r = Math.round(Math.min(1, Math.max(0, c?.r ?? 0)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, c?.g ?? 0)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, c?.b ?? 0)) * 255);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
};
const rgba = (c) => `rgba(${Math.round((c?.r ?? 0) * 255)},${Math.round((c?.g ?? 0) * 255)},${Math.round((c?.b ?? 0) * 255)},${+(c?.a ?? 1).toFixed(3)})`;
const h2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hashHex = (h) => Array.from({ length: 20 }, (_, i) => (h?.[i] ?? 0).toString(16).padStart(2, '0')).join('');

const imageManifest = new Map(); // hash -> {maxW,maxH,names:Set}
function noteImage(hash, w, h, name) {
  const cur = imageManifest.get(hash) || { maxW: 0, maxH: 0, names: new Set() };
  cur.maxW = Math.max(cur.maxW, Math.ceil(w || 0));
  cur.maxH = Math.max(cur.maxH, Math.ceil(h || 0));
  if (name) cur.names.add(name);
  imageManifest.set(hash, cur);
}
function imageSrc(hash) {
  if (!hash) return null;
  for (const ext of ['webp', 'png', 'jpg', 'jpeg']) {
    if (fs.existsSync(`${IMG_DIR}/${hash}.${ext}`)) return `assets/img/${hash}.${ext}`;
  }
  return null;
}

function gradientCss(paint, w, h) {
  const stops = (paint.stops || []).slice().sort((a, b) => a.position - b.position)
    .map((s) => `${rgba(s.color)} ${h2(s.position * 100)}%`).join(',');
  const hp = paint.gradientHandlePositions || [];
  const [p0, p1] = hp;
  if (!p0 || !p1) return (paint.stops || [])[0] ? rgba(paint.stops[0].color) : 'transparent';
  const dx = (p1.x - p0.x) * (w || 1), dy = (p1.y - p0.y) * (h || 1);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  if (paint.type === 'GRADIENT_LINEAR') {
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    return `linear-gradient(${h2(ang)}deg, ${stops})`;
  }
  if (paint.type === 'GRADIENT_RADIAL' || paint.type === 'GRADIENT_DIAMOND') {
    return `radial-gradient(${h2(len)}px ${h2(len)}px at ${h2(p0.x * 100)}% ${h2(p0.y * 100)}%, ${stops})`;
  }
  return `linear-gradient(${stops})`;
}

function paintsToBackground(paints, w, h) {
  const layers = [];
  for (const p of paints.slice().reverse()) { // Figma: last = topmost; CSS: first = topmost
    if (p.visible === false) continue;
    if (p.type === 'SOLID') {
      layers.push(`${rgba({ ...p.color, a: (p.color?.a ?? 1) * (p.opacity ?? 1) })}`);
    } else if (p.type && p.type.startsWith('GRADIENT')) {
      layers.push(gradientCss(p, w, h));
    } else if (p.type === 'IMAGE') {
      const src = imageSrc(hashHex(p.image?.hash));
      if (src) layers.push(`url(${src})`);
      else layers.push('#c9d3dd');
    } else if (p.type === 'PATTERN') {
      layers.push('#dfe7ee');
    }
  }
  return layers;
}

let clipCounter = 0;

function nodeStyle(n, ctx) {
  const tr = n.transform || { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
  const st = [];
  const simple = Math.abs(tr.m00 - 1) < 1e-5 && Math.abs(tr.m11 - 1) < 1e-5 && Math.abs(tr.m01) < 1e-5 && Math.abs(tr.m10) < 1e-5;
  if (simple) {
    st.push(`left:${h2(tr.m02)}px`, `top:${h2(tr.m12)}px`);
  } else {
    st.push('left:0', 'top:0', `transform:matrix(${h2(tr.m00)},${h2(tr.m10)},${h2(tr.m01)},${h2(tr.m11)},${h2(tr.m02)},${h2(tr.m12)})`, 'transform-origin:0 0');
  }
  const w = n.size?.x ?? 0, h = n.size?.y ?? 0;
  if (w || h) st.push(`width:${h2(w)}px`, `height:${h2(h)}px`);
  if (n.opacity !== undefined && n.opacity !== 1) st.push(`opacity:${h2(n.opacity)}`);

  // corner radii
  const indep = n.rectangleCornerRadiiIndependent;
  const r0 = indep ? (n.rectangleTopLeftCornerRadius ?? 0) : (n.cornerRadius ?? n.rectangleTopLeftCornerRadius ?? 0);
  const r1 = indep ? (n.rectangleTopRightCornerRadius ?? 0) : r0;
  const r2 = indep ? (n.rectangleBottomRightCornerRadius ?? 0) : r0;
  const r3 = indep ? (n.rectangleBottomLeftCornerRadius ?? 0) : r0;
  const hasRadius = [r0, r1, r2, r3].some((v) => v > 0);
  if (hasRadius) st.push(`border-radius:${h2(r0)}px ${h2(r1)}px ${h2(r2)}px ${h2(r3)}px`);

  // fills
  const fills = (n.fillPaints || []).filter((p) => p.visible !== false);
  if (fills.length && n.type !== 'TEXT') {
    const layers = paintsToBackground(fills, w, h);
    if (layers.length) {
      st.push(`background:${layers.join(',')}`);
      // sizing for image layers
      const sizes = [];
      const positions = [];
      for (const p of fills.slice().reverse()) {
        if (p.visible === false) continue;
        if (p.type === 'IMAGE') {
          const mode = p.imageScaleMode || 'FILL';
          sizes.push(mode === 'FIT' ? 'contain' : mode === 'STRETCH' ? '100% 100%' : 'cover');
          positions.push('center');
        } else { sizes.push('auto'); positions.push('0 0'); }
      }
      if (sizes.length > 1) { st.push(`background-size:${sizes.join(',')}`); st.push(`background-position:${positions.join(',')}`); }
      else if (sizes.length === 1 && fills.some((p) => p.type === 'IMAGE')) { st.push(`background-size:${sizes[0]}`); st.push('background-position:center'); }
      st.push('background-repeat:no-repeat');
    }
    for (const p of fills) if (p.type === 'IMAGE' && p.image?.hash) noteImage(hashHex(p.image.hash), w, h, p.image.name);
  }

  // strokes
  const strokes = (n.strokePaints || []).filter((p) => p.visible !== false);
  if (strokes.length) {
    const s = strokes[0];
    const sw = n.strokeWeight ?? 1;
    if (s.type === 'SOLID') {
      if (n.strokeAlign === 'OUTSIDE') st.push(`box-shadow:0 0 0 ${h2(sw)}px ${rgba({ ...s.color, a: (s.color?.a ?? 1) * (s.opacity ?? 1) })}`);
      else st.push(`border:${h2(sw)}px solid ${rgba({ ...s.color, a: (s.color?.a ?? 1) * (s.opacity ?? 1) })}`, 'box-sizing:border-box');
    }
  }
  // independent border weights (dividers)
  if (n.borderTopWeight || n.borderBottomWeight) {
    const w2 = n.borderBottomWeight || n.borderTopWeight || 1;
    if (n.borderBottomWeight) st.push(`border-bottom:${h2(w2)}px solid currentColor`, 'box-sizing:border-box');
  }

  // effects
  for (const e of n.effects || []) {
    if (e.visible === false) continue;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      const off = e.offset || { x: 0, y: 0 };
      const inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
      st.push(`${e.type === 'INNER_SHADOW' ? 'box-shadow' : 'box-shadow'}:${inset}${h2(off.x || 0)}px ${h2(off.y || 0)}px ${h2(e.radius || 0)}px ${h2(e.spread || 0)}px ${rgba({ ...e.color, a: (e.color?.a ?? 1) * (e.opacity ?? 1) })}`);
    } else if (e.type === 'BACKGROUND_BLUR') {
      st.push(`backdrop-filter:blur(${h2((e.radius || 10) / 2)}px)`, '-webkit-backdrop-filter:blur(' + h2((e.radius || 10) / 2) + 'px)');
    } else if (e.type === 'LAYER_BLUR') {
      st.push(`filter:blur(${h2((e.radius || 4) / 2)}px)`);
    }
  }

  // clipping
  const clip = n.type === 'FRAME' || n.type === 'SYMBOL' || n.type === 'BOOLEAN_OPERATION' || n.type === 'COMPONENT_SET';
  if (clip && n.frameMaskDisabled !== true) st.push('overflow:hidden');
  if (n.type === 'INSTANCE' || n.type === 'SYMBOL') st.push('overflow:visible');
  if (n.blendMode && n.blendMode !== 'NORMAL' && n.blendMode !== 'PASS_THROUGH') {
    st.push(`mix-blend-mode:${n.blendMode.toLowerCase().replace(/_/g, '-')}`);
  }
  return st.join(';');
}

function textHtml(n, blobs) {
  const chars = n.textData?.characters ?? '';
  if (!chars) return '';
  const fs_ = n.fontSize ?? 14;
  const style = n.fontName?.style ?? 'Regular';
  const weight = /\d/.test(style) ? style : (WEIGHT[style] ?? 400);
  const famRaw = n.fontName?.family ?? 'Roboto';
  const fam = /Google Sans/i.test(famRaw) ? "'Google Sans', Roboto" : /Inter/i.test(famRaw) ? 'Inter, Roboto' : /SF Pro/i.test(famRaw) ? "'SF Pro Display', Roboto" : `${famRaw}, Roboto`;
  const lhSpec = n.lineHeight?.value ?? fs_ * 1.2;
  const L = n.lineHeight?.units === 'PERCENT' ? (lhSpec / 100) * fs_ : lhSpec;
  const baselines = n.derivedTextData?.baselines || [];
  const y0 = baselines[0] ? baselines[0].position.y : fs_;
  const baselineInBox = (L - (ASCENT + DESCENT) * fs_) / 2 + ASCENT * fs_;
  const top = y0 - baselineInBox;
  const fills = (n.fillPaints || []).filter((p) => p.visible !== false);
  let color = 'transparent';
  if (fills.length) {
    const p = fills[0];
    if (p.type === 'SOLID') color = rgba({ ...p.color, a: (p.color?.a ?? 1) * (p.opacity ?? 1) });
    else if (p.type && p.type.startsWith('GRADIENT')) color = (p.stops || [])[0] ? rgba(p.stops[0].color) : '#000';
    else if (p.type === 'IMAGE') color = '#000';
  }
  const tr = n.transform || { m02: 0, m12: 0, m00: 1, m11: 1, m01: 0, m10: 0 };
  const st = [`left:${h2(tr.m02)}px`, `top:${h2(tr.m12 + top)}px`, `font-family:${fam}`, `font-size:${h2(fs_)}px`, `font-weight:${weight}`, `line-height:${h2(L)}px`, `color:${color}`, 'white-space:pre'];
  if (n.size?.x) st.push(`width:${h2(n.size.x)}px`);
  if (n.textAlignHorizontal === 'CENTER') st.push('text-align:center');
  else if (n.textAlignHorizontal === 'RIGHT') st.push('text-align:right');
  if (n.letterSpacing) {
    const ls = n.letterSpacing.units === 'PERCENT' ? (n.letterSpacing.value / 100) * fs_ : n.letterSpacing.value;
    st.push(`letter-spacing:${h2(ls)}px`);
  }
  if (n.textCase === 'UPPER') st.push('text-transform:uppercase');
  if (n.textCase === 'LOWER') st.push('text-transform:lowercase');
  if (n.textDecoration === 'UNDERLINE') st.push('text-decoration:underline');
  if (n.textDecoration === 'STRIKETHROUGH') st.push('text-decoration:line-through');
  if (n.opacity !== undefined && n.opacity !== 1) st.push(`opacity:${h2(n.opacity)}`);
  return `<div class="t" style="${st.join(';')}">${esc(chars)}</div>`;
}

function bboxOfPath(d) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1]);
  }
  return { minX, minY, maxX, maxY };
}

function vectorHtml(n, blobs) {
  const fillGeoms = n.fillGeometry || [];
  const strokeGeoms = n.strokeGeometry || [];
  if (!fillGeoms.length && !strokeGeoms.length) return '';
  const w = Math.max(1, n.size?.x ?? 1), h = Math.max(1, n.size?.y ?? 1);
  const paths = [];
  const boxes = [];
  const fills = (n.fillPaints || []).filter((p) => p.visible !== false);
  const strokes = (n.strokePaints || []).filter((p) => p.visible !== false);
  let fill = 'none';
  if (fills.length) {
    const p = fills[0];
    if (p.type === 'SOLID') fill = rgba({ ...p.color, a: (p.color?.a ?? 1) * (p.opacity ?? 1) });
    else if (p.type && p.type.startsWith('GRADIENT')) fill = (p.stops || [])[0] ? rgba(p.stops[0].color) : '#000';
    else if (p.type === 'IMAGE') fill = 'none';
    else if (p.type === 'PATTERN') fill = '#dfe7ee';
  }
  for (const g of fillGeoms) {
    const b = blobs[g.commandsBlob];
    if (!b) continue;
    const d = parseCommands(b.bytes);
    if (!d) continue;
    paths.push(`<path d="${d}" fill="${fill}" fill-rule="${(g.windingRule || 'NONZERO').toLowerCase() === 'evenodd' ? 'evenodd' : 'nonzero'}"/>`);
    boxes.push(bboxOfPath(d));
  }
  for (const st of strokes) {
    if (st.type !== 'SOLID') continue;
    for (const g of strokeGeoms) {
      const b = blobs[g.commandsBlob];
      if (!b) continue;
      const d = parseCommands(b.bytes);
      if (!d) continue;
      paths.push(`<path d="${d}" fill="none" stroke="${rgba({ ...st.color, a: (st.color?.a ?? 1) * (st.opacity ?? 1) })}" stroke-width="${h2(n.strokeWeight ?? 1)}" stroke-linejoin="${(n.strokeJoin || 'MITER').toLowerCase()}" stroke-linecap="${(n.strokeCap || 'NONE').toLowerCase() === 'round' ? 'round' : 'butt'}"/>`);
      boxes.push(bboxOfPath(d));
    }
  }
  if (!paths.length) return '';
  // viewBox: the geometry's own bounds, so artwork is scaled into the node box
  let vb = { x: 0, y: 0, w, h };
  if (boxes.length) {
    const u = boxes.reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const bw = u.maxX - u.minX, bh = u.maxY - u.minY;
    // only re-base when the geometry doesn't already match the node box (avoids 1px drift)
    if (bw > 0.5 && bh > 0.5 && (Math.abs(bw - w) > 1.5 || Math.abs(bh - h) > 1.5 || Math.abs(u.minX) > 1.5 || Math.abs(u.minY) > 1.5)) {
      vb = { x: u.minX, y: u.minY, w: bw, h: bh };
    }
  }
  const tr = n.transform || { m02: 0, m12: 0, m00: 1, m11: 1, m01: 0, m10: 0 };
  const simple = Math.abs(tr.m00 - 1) < 1e-5 && Math.abs(tr.m11 - 1) < 1e-5 && Math.abs(tr.m01) < 1e-5 && Math.abs(tr.m10) < 1e-5;
  const st = simple
    ? `left:${h2(tr.m02)}px;top:${h2(tr.m12)}px;width:${h2(w)}px;height:${h2(h)}px`
    : `left:0;top:0;width:${h2(w)}px;height:${h2(h)}px;transform:matrix(${h2(tr.m00)},${h2(tr.m10)},${h2(tr.m01)},${h2(tr.m11)},${h2(tr.m02)},${h2(tr.m12)});transform-origin:0 0`;
  const op = n.opacity !== undefined && n.opacity !== 1 ? `;opacity:${h2(n.opacity)}` : '';
  return `<div class="v" style="${st}${op}"><svg width="100%" height="100%" viewBox="${h2(vb.x)} ${h2(vb.y)} ${h2(vb.w)} ${h2(vb.h)}" preserveAspectRatio="xMidYMid meet" overflow="visible">${paths.join('')}</svg></div>`;
}

const SKIP_NAMES = new Set(['Bezel']);
function renderNode(n, blobs, depth, ctx) {
  if (n.visible === false) return '';
  if (SKIP_NAMES.has(n.name) && depth > 0) return '';
  if (n.mask) return ''; // handled by parent as clip shape
  if (n.type === 'TEXT') return textHtml(n, blobs);
  if (n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION' || n.type === 'ELLIPSE' && (n.fillGeometry || []).length) {
    if (n.type === 'ELLIPSE' && !(n.fillGeometry || []).length) {
      const w = n.size?.x ?? 0, h = n.size?.y ?? 0;
      const st = nodeStyle(n, ctx);
      const fills = (n.fillPaints || []).filter((p) => p.visible !== false);
      const bg = paintsToBackground(fills, w, h).join(',') || 'transparent';
      return `<div class="n" data-n="${esc(n.name)}" style="${st};border-radius:50%;background:${bg}"></div>`;
    }
    return vectorHtml(n, blobs);
  }
  // container / shape
  const st = nodeStyle(n, ctx);
  let kids = (n.children || []).map((c) => renderNode(c, blobs, depth + 1, ctx)).join('');
  // mask children: if first child (or any) is a mask, emulate clip on parent
  const maskKids = (n.children || []).filter((c) => c.mask);
  let extra = '';
  if (maskKids.length) {
    const m = maskKids[0];
    const r = m.cornerRadius ?? 0;
    const rx = m.type === 'ELLIPSE' || (m.cornerRadius && m.cornerRadius >= Math.min(m.size?.x || 0, m.size?.y || 0) / 2) ? '50%' : `${h2(r)}px`;
    extra = `;overflow:hidden;border-radius:${rx}`;
  }
  const name = esc(n.name);
  const dataExtra = n.type === 'TEXT' ? '' : '';
  if (!kids && !(n.fillPaints || []).length && !(n.strokePaints || []).length) {
    return ''; // nothing to paint
  }
  return `<div class="n" data-n="${name}" style="${st}${extra}">${kids}</div>`;
}

// ---------------- page/screen extraction ----------------
const { msg } = loadFig(`${ROOT}/design/canvas.fig`);
const idx = buildIndex(msg);
const blobs = msg.blobs;
const pages = idx.nodes.filter((n) => n.type === 'CANVAS');

const SCREEN_DEFS = [
  ['chat-list', 'Chat list', 'Chats'],
  ['contacts', 'Contacts', 'Contacts'],
  ['chat-list-stories', 'Chat list - Stories', 'Chats'],
  ['settings', 'Settings', 'Settings'],
  ['profile', 'Profile', 'Profile'],
  ['profile-scroll', 'Profile - Scroll', 'Profile'],
  ['chat-personal', 'Chat - Personal', ''],
  ['chat-personal-info', 'Chat - Personal - Info', ''],
  ['chat-bot-greeting', 'Chat - Bot - Greeting', ''],
  ['chat-bot', 'Chat - Bot', ''],
  ['chat-bot-info', 'Chat - Bot - Info', ''],
  ['chat-group', 'Chat - Group', ''],
  ['chat-group-info', 'Chat - Group - Info', ''],
];

fs.mkdirSync(`${OUT}/screens`, { recursive: true });
fs.mkdirSync(`${OUT}/assets/img`, { recursive: true });

const general = pages.find((p) => p.name === 'General');
const generalKids = idx.kids.get(general.__key) || [];
const manifest = { screens: [], pages: [] };

function writeScreenJs(id, html, meta) {
  const payload = JSON.stringify({ html, ...meta });
  fs.writeFileSync(`${OUT}/screens/${id}.js`, `window.__SCR(${[JSON.stringify(id)]},${payload});\n`);
}
function buildScreen(id, frameNode, meta = {}) {
  const tree = resolveTree(frameNode, idx);
  tree.transform = { ...(tree.transform || {}), m02: 0, m12: 0 };
  const html = renderNode(tree, blobs, 0, {});
  const screen = { id, name: frameNode.name, title: meta.title || frameNode.name, tab: meta.tab || null, w: Math.round(tree.size?.x || 412), h: Math.round(tree.size?.y || 917), frameName: frameNode.name };
  writeScreenJs(id, html, { w: screen.w, h: screen.h, title: screen.title, tab: screen.tab, kind: 'screen' });
  return screen;
}

for (const [id, frameName, tab] of SCREEN_DEFS) {
  const frame = generalKids.find((k) => k.name === frameName && (k.type === 'FRAME' || k.type === 'INSTANCE'));
  if (!frame) { console.warn('missing screen', frameName); continue; }
  manifest.screens.push(buildScreen(id, frame, { tab }));
}

// gallery pages: one screen per page, stacking all top-level nodes at page coordinates
const KIT_SKIP = new Set(['Internal Only Canvas']);
for (const page of pages) {
  const kids = idx.kids.get(page.__key) || [];
  if (!kids.length) continue;
  if (KIT_SKIP.has(page.name)) continue;
  const id = 'kit-' + page.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const parts = [];
  for (const k of kids) {
    const tree = resolveTree(k, idx);
    const tr = tree.transform || { m02: 0, m12: 0 };
    const w = tree.size?.x || 0, h = tree.size?.y || 0;
    minX = Math.min(minX, tr.m02); minY = Math.min(minY, tr.m12);
    maxX = Math.max(maxX, tr.m02 + w); maxY = Math.max(maxY, tr.m12 + h);
    parts.push(renderNode(tree, blobs, 0, {}));
  }
  const html = parts.join('');
  const W = isFinite(maxX - minX) ? maxX - minX : 412, H = isFinite(maxY - minY) ? maxY - minY : 917;
  const GAP = 200;
  const body = `<div style="position:absolute;left:${GAP - minX}px;top:${GAP - minY}px">${html}</div>`;
  const pw = Math.ceil(W + GAP * 2), ph = Math.ceil(H + GAP * 2);
  writeScreenJs(id, body, { w: pw, h: ph, title: page.name, kind: 'page', items: kids.length });
  manifest.pages.push({ id, name: page.name, w: pw, h: ph, items: kids.length });
}

// component screens (menus, dialogs, sheets, tab bars, app bars, buttons...)
const COMPONENT_PAGES = [['Menu', 'menu'], ['Dialogs', 'dialog'], ['Sheets', 'sheet'], ['Tab Bar', 'tabbar'], ['App bars', 'appbar'], ['Buttons', 'button'], ['Swithes', 'switch'], ['Folders', 'folder'], ['Lists', 'list'], ['Utilities', 'utility'], ['Messages', 'message']];
manifest.components = [];
for (const [pageName, kind] of COMPONENT_PAGES) {
  const page = pages.find((p) => p.name === pageName);
  if (!page) continue;
  const kids = idx.kids.get(page.__key) || [];
  kids.slice(0, 40).forEach((k, i) => {
    const tree = resolveTree(k, idx);
    const tr = tree.transform || { m02: 0, m12: 0 };
    const w = Math.round(tree.size?.x || 0), h = Math.round(tree.size?.y || 0);
    if (!w || !h) return;
    const html = `<div style="position:absolute;left:0;top:0">${renderNode(tree, blobs, 0, {})}</div>`;
    const id = `c-${kind}-${i}`;
    writeScreenJs(id, html, { w, h, title: k.name, kind });
    manifest.components.push({ id, name: k.name, kind, w, h });
  });
}

fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ ...manifest, images: [...imageManifest.entries()].map(([hash, v]) => ({ hash, maxW: v.maxW, maxH: v.maxH, name: [...v.names][0] || '' })) }, null, 1));
fs.writeFileSync(`${OUT}/manifest.js`, 'window.__MANIFEST=' + JSON.stringify({ screens: manifest.screens, pages: manifest.pages, components: manifest.components }) + ';\n');
console.log('screens:', manifest.screens.length, 'kit pages:', manifest.pages.length, 'images needed:', imageManifest.size);
console.log(manifest.pages.map((p) => `${p.id} ${p.w}x${p.h} items=${p.items}`).join('\n'));
const total = fs.readdirSync(`${OUT}/screens`).reduce((a, f) => a + fs.statSync(`${OUT}/screens/${f}`).size, 0);
console.log('total screen html MB', (total / 1e6).toFixed(2));
