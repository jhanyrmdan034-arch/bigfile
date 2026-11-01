import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import { loadFig, buildIndex } from './lib/fig.mjs';
import { renderNodeToSvg } from './lib/render.mjs';
const { msg } = loadFig('/home/user/bigfile/design/canvas.fig');
const idx = buildIndex(msg);
const page = idx.nodes.find(n => n.type==='CANVAS' && n.name==='General');
const find=(n)=>{ if(n.name==='Chat list') return n; for(const k of (idx.kids.get(n.__key)||[])){const r=find(k); if(r) return r;} return null; };
const target = find(page);
// try render with increasing child count on the top frame
for (let k = 0; k <= (idx.kids.get(target.__key)||[]).length; k++) {
  const cloneKids = (idx.kids.get(target.__key)||[]).slice(0,k);
  const sub = { ...target, __key: target.__key };
  const tmpIdx = { byKey: idx.byKey, kids: new Map([...idx.kids, [target.__key, cloneKids]]) };
  const svg = renderNodeToSvg(sub, tmpIdx, msg.blobs, {});
  try {
    new Resvg(svg, { font:{fontDirs:['/home/user/bigfile/tools/fonts'],loadSystemFonts:false}, background:'white' }).render().asPng();
    console.log('k=',k,'ok');
  } catch(e) { console.log('k=',k,'FAIL', e.message.slice(0,80)); fs.writeFileSync(`out/fail${k}.svg`, svg); }
}
