// Render a resolved Figma scene node to SVG.
import { resolveTree, parseCommands } from './fig.mjs';
import fs from 'fs';
import crypto from 'crypto';

const IMG_DIR = process.env.IMG_DIR || '/home/user/bigfile/assets/images';
const WEIGHT = { Thin: 100, ExtraLight: 200, UltraLight: 200, Light: 300, Regular: 400, Normal: 400, Medium: 500, SemiBold: 600, DemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900, Heavy: 900 };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = (v) => Math.round(v * 100) / 100;
const hex = (c) => {
  const r = Math.round((c.r ?? 0) * 255), g = Math.round((c.g ?? 0) * 255), b = Math.round((c.b ?? 0) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const hashHex = (h) => {
  const arr = [];
  for (let i = 0; i < 20; i++) arr.push((h[i] ?? 0).toString(16).padStart(2, '0'));
  return arr.join('');
};
function imageDataUri(hash) {
  if (!hash) return null;
  const name = hashHex(hash);
  for (const ext of ['webp', 'png', 'jpg', 'jpeg']) {
    const p = `${IMG_DIR}/${name}.${ext}`;
    if (fs.existsSync(p)) {
      const mime = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
    }
  }
  return null;
}

export function renderSvg(root, opts = {}) {
  const defs = [];
  let uid = 0;
  const W = root.size ? root.size.x : 412;
  const H = root.size ? root.size.y : 917;
  const body = [];
  const imageCache = new Map();

  const clipFor = (n, shape) => {
    const id = `clip${uid++}`;
    defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
    return id;
  };
  const rectShape = (n) => {
    const w = n.size?.x ?? 0, h = n.size?.y ?? 0;
    const tl = n.rectangleTopLeftCornerRadius ?? n.cornerRadius ?? 0;
    const tr = n.rectangleTopRightCornerRadius ?? n.cornerRadius ?? 0;
    const br = n.rectangleBottomRightCornerRadius ?? n.cornerRadius ?? 0;
    const bl = n.rectangleBottomLeftCornerRadius ?? n.cornerRadius ?? 0;
    if (!tl && !tr && !br && !bl) return `<rect x="0" y="0" width="${n2(w)}" height="${n2(h)}"/>`;
    if (tl === tr && tr === br && br === bl) return `<rect x="0" y="0" width="${n2(w)}" height="${n2(h)}" rx="${n2(tl)}"/>`;
    return `<path d="M${n2(tl)} 0 H${n2(w - tr)} A${n2(tr)} ${n2(tr)} 0 0 1 ${n2(w)} ${n2(tr)} V${n2(h - br)} A${n2(br)} ${n2(br)} 0 0 1 ${n2(w - br)} ${n2(h)} H${n2(bl)} A${n2(bl)} ${n2(bl)} 0 0 1 0 ${n2(h - bl)} V${n2(tl)} A${n2(tl)} ${n2(tl)} 0 0 1 ${n2(tl)} 0 Z"/>`;
  };
  const geomPath = (n, geom) => {
    if (!geom || !n.__blobs) return null;
    const b = n.__blobs[geom.commandsBlob];
    if (!b) return null;
    const d = parseCommands(b.bytes);
    return d ? `<path d="${d}"/>` : null;
  };
  const paintAttrs = (paint, n, shapeRef, geomForImage) => {
    if (paint.type === 'SOLID') {
      return { fill: hex(paint.color), opacity: paint.opacity ?? 1 };
    }
    if (paint.type && paint.type.startsWith('GRADIENT')) {
      const id = `grad${uid++}`;
      const stops = (paint.stops || []).slice().sort((a, b) => a.position - b.position)
        .map((s) => `<stop offset="${n2(s.position)}" stop-color="${hex(s.color)}" stop-opacity="${n2(s.color.a ?? 1)}"/>`).join('');
      const hp = paint.gradientHandlePositions || [];
      const [p0, p1, p2] = hp;
      const degenerate = !p0 || !p1 || (Math.abs(p1.x - p0.x) < 1e-4 && Math.abs(p1.y - p0.y) < 1e-4) || !(n.size && n.size.x > 0 && n.size.y > 0);
      if (degenerate) {
        const st = (paint.stops || [])[0];
        return { fill: st ? hex(st.color) : '#cccccc', opacity: (paint.opacity ?? 1) * (st ? (st.color.a ?? 1) : 1) };
      }
      let grad;
      if (paint.type === 'GRADIENT_LINEAR' && p0 && p1) {
        grad = `<linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="${n2(p0.x)}" y1="${n2(p0.y)}" x2="${n2(p1.x)}" y2="${n2(p1.y)}">${stops}</linearGradient>`;
      } else if (paint.type === 'GRADIENT_RADIAL' && p0 && p1) {
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const rad = Math.sqrt(dx * dx + dy * dy);
        grad = `<radialGradient id="${id}" gradientUnits="objectBoundingBox" cx="${n2(p0.x)}" cy="${n2(p0.y)}" r="${n2(rad)}">${stops}</radialGradient>`;
      } else {
        grad = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>`;
      }
      defs.push(grad);
      return { fill: `url(#${id})`, opacity: paint.opacity ?? 1 };
    }
    if (paint.type === 'IMAGE') {
      const uri = imageDataUri(paint.image?.hash);
      if (!uri) return { fill: '#cfd8e3', opacity: paint.opacity ?? 1 };
      return { image: uri, scaleMode: paint.imageScaleMode || 'FILL', opacity: paint.opacity ?? 1, transform: paint.transform };
    }
    if (paint.type === 'PATTERN') return { fill: '#e5e5e5', opacity: 1 };
    return { fill: 'none' };
  };

  const drawNode = (n, parentClip, depth) => {
    if (n.visible === false) return;
    const tr = n.transform;
    const tx = tr ? tr.m02 : 0, ty = tr ? tr.m12 : 0;
    const m00 = tr ? tr.m00 : 1, m01 = tr ? tr.m01 : 0, m10 = tr ? tr.m10 : 0, m11 = tr ? tr.m11 : 1;
    const hasMatrix = Math.abs(m00 - 1) > 1e-6 || Math.abs(m01) > 1e-6 || Math.abs(m10) > 1e-6 || Math.abs(m11 - 1) > 1e-6;
    const transform = hasMatrix
      ? `matrix(${n2(m00)} ${n2(m10)} ${n2(m01)} ${n2(m11)} ${n2(tx)} ${n2(ty)})`
      : `translate(${n2(tx)} ${n2(ty)})`;
    const attrs = [`transform="${transform}"`];
    const op = n.opacity === undefined ? 1 : n.opacity;
    const parts = [];
    let shape = null;
    let clipId = null;

    if (n.type === 'TEXT') {
      parts.push(drawText(n));
    } else {
      // shape
      if (n.fillGeometry && n.fillGeometry.length) {
        shape = geomPath(n, n.fillGeometry[0]);
      }
      if (!shape && (n.type === 'FRAME' || n.type === 'ROUNDED_RECTANGLE' || n.type === 'RECTANGLE' || n.type === 'SECTION' || n.type === 'ELLIPSE' || n.type === 'SYMBOL' || n.type === 'INSTANCE')) {
        if (n.type === 'ELLIPSE') {
          shape = `<ellipse cx="${n2((n.size?.x ?? 0) / 2)}" cy="${n2((n.size?.y ?? 0) / 2)}" rx="${n2((n.size?.x ?? 0) / 2)}" ry="${n2((n.size?.y ?? 0) / 2)}"/>`;
        } else {
          shape = rectShape(n);
        }
      }
      const fills = (n.fillPaints || []).filter((p) => p.visible !== false);
      if (shape && fills.length) {
        // last paint is topmost in figma; array order is bottom->top? assume order as given (first = bottom)
        for (const paint of fills) {
          const a = paintAttrs(paint, n, shape);
          if (a.image) {
            const id = `clip${uid++}`;
            defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
            const par = a.scaleMode === 'FIT' ? 'xMidYMid meet' : a.scaleMode === 'STRETCH' ? 'none' : 'xMidYMid slice';
            parts.push(`<g clip-path="url(#${id})" opacity="${n2(a.opacity)}"><image x="0" y="0" width="${n2(n.size?.x ?? 0)}" height="${n2(n.size?.y ?? 0)}" preserveAspectRatio="${par}" href="${a.image}"/></g>`);
          } else {
            parts.push(`<g opacity="${n2(a.opacity ?? 1)}">${shape.replace('/>', ` fill="${a.fill}"/>`)}</g>`);
          }
        }
      }
      // strokes
      const strokes = (n.strokePaints || []).filter((p) => p.visible !== false);
      if (strokes.length && (n.fillGeometry || n.type === 'FRAME')) {
        const sp = strokes[0];
        const sw = n.strokeWeight ?? 1;
        if (sp.type === 'SOLID') {
          const sShape = n.fillGeometry && n.fillGeometry.length ? shape : shape;
          if (sShape) parts.push(`<g opacity="${n2(sp.opacity ?? 1)}">${sShape.replace('/>', ` fill="none" stroke="${hex(sp.color)}" stroke-width="${n2(sw)}"/>`)}</g>`);
        }
      }
      // clipping frame
      if (n.type === 'FRAME' || n.type === 'SYMBOL') {
        if (n.frameMaskDisabled !== true) {
          const s = n.fillGeometry && n.fillGeometry.length ? shape : rectShape(n);
          const id = `clip${uid++}`;
          defs.push(`<clipPath id="${id}">${s}</clipPath>`);
          clipId = id;
        }
      }
      if (n.type === 'INSTANCE' && n.frameMaskDisabled !== true && n.size) {
        const id = `clip${uid++}`;
        defs.push(`<clipPath id="${id}">${rectShape(n)}</clipPath>`);
        clipId = id;
      }
    }

    let inner = '';
    if (n.children && n.children.length) {
      inner = n.children.map((c) => drawNode(c, clipId || parentClip, depth + 1)).join('');
    }
    if (!parts.length && !inner) return '';
    const clipAttr = clipId ? ` clip-path="url(#${clipId})"` : '';
    const opacityAttr = op !== 1 ? ` opacity="${n2(op)}"` : '';
    const g = `<g ${attrs.join(' ')}${clipAttr}${opacityAttr}>${parts.join('')}${inner}</g>`;
    return g;
  };

  const drawText = (n) => {
    const chars = n.textData?.characters ?? '';
    if (!chars.trim()) return '';
    const fs_ = n.fontSize ?? 14;
    const fam = n.fontName?.family ?? 'Roboto';
    const style = n.fontName?.style ?? 'Regular';
    const weight = /\d/.test(style) ? style : (WEIGHT[style] ?? 400);
    const italic = /Italic|Oblique/i.test(style);
    const align = n.textAlignHorizontal === 'CENTER' ? 'middle' : n.textAlignHorizontal === 'RIGHT' ? 'end' : 'start';
    const anchorX = align === 'middle' ? (n.size?.x ?? 0) / 2 : align === 'end' ? (n.size?.x ?? 0) : 0;
    const lh = (n.lineHeight?.value ?? fs_ * 1.2) * (n.lineHeight?.units === 'PERCENT' ? fs_ / 100 : 1);
    const fills = (n.fillPaints || []).filter((p) => p.visible !== false);
    let fill = '#000';
    if (fills.length) {
      const p = fills[0];
      fill = p.type === 'SOLID' ? hex(p.color) : '#000';
    }
    const baselines = n.derivedTextData?.baselines || [];
    const lines = chars.split('\n');
    const tspans = lines.map((line, i) => {
      const bl = baselines[Math.min(i, Math.max(0, baselines.length - 1))];
      const y = bl ? bl.position.y : fs_ + i * lh;
      return `<tspan x="${n2(anchorX)}" y="${n2(y)}">${esc(line) || ' '}</tspan>`;
    }).join('');
    const ls = n.letterSpacing ? ` letter-spacing="${n2(n.letterSpacing.value ?? n.letterSpacing)}"` : '';
    const transform = n.transform ? '' : '';
    return `<text font-family="${esc(fam)}, Roboto, sans-serif" font-size="${n2(fs_)}" font-weight="${weight}" ${italic ? 'font-style="italic"' : ''} text-anchor="${align}" fill="${fill}" xml:space="preserve"${ls}${transform}>${tspans}</text>`;
  };

  const content = drawNode(root, null, 0);
  const bg = opts.background === false ? '' : `<rect x="0" y="0" width="${n2(W)}" height="${n2(H)}" fill="#ffffff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n2(W)}" height="${n2(H)}" viewBox="0 0 ${n2(W)} ${n2(H)}"><defs>${defs.join('')}</defs>${bg}${content}</svg>`;
}

export function renderNodeToSvg(node, index, blobs, opts) {
  const tree = resolveTree(node, { byKey: index.byKey, kids: index.kids });
  tagBlobs(tree, blobs);
  return renderSvg(tree, opts);
}
function tagBlobs(n, blobs) {
  n.__blobs = blobs;
  (n.children || []).forEach((c) => tagBlobs(c, blobs));
}
