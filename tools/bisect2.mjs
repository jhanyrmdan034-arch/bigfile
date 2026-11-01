import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
const svg = fs.readFileSync(process.argv[2], 'utf8');
const head = svg.slice(0, svg.indexOf('</defs>') + 7);
const rest = svg.slice(svg.indexOf('</defs>') + 7, svg.lastIndexOf('</svg>'));
// split top-level elements
const els = [];
let i = 0, depth = 0, start = 0;
while (i < rest.length) {
  if (rest.startsWith('<g ', i) || rest.startsWith('<g>', i) || rest.startsWith('<rect', i) || rest.startsWith('<text', i)) {
    if (depth === 0) start = i;
    // self-closing?
    const close = rest.indexOf('>', i);
    if (rest[close - 1] === '/') { if (depth === 0) { els.push(rest.slice(start, close + 1)); } i = close + 1; continue; }
    depth++; i = close + 1; continue;
  }
  if (rest.startsWith('</g>', i)) { depth--; i += 4; if (depth === 0) els.push(rest.slice(start, i)); continue; }
  if (rest.startsWith('</text>', i)) { depth--; i += 7; if (depth === 0) els.push(rest.slice(start, i)); continue; }
  i++;
}
console.log('top-level elements:', els.length, els.map(e => e.slice(0, 30)));
let acc = '';
for (let k = 0; k < els.length; k++) {
  acc += els[k];
  const test = head + acc + '</svg>';
  try { new Resvg(test, { font: { fontDirs: ['/home/user/bigfile/tools/fonts'], loadSystemFonts: false }, background: 'white' }).render().asPng(); console.log('k', k, 'ok'); }
  catch (e) { console.log('k', k, 'FAIL'); fs.writeFileSync('out/fail-el.svg', head + els[k] + '</svg>'); process.exit(0); }
}
