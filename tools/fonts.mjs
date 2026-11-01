import fs from 'fs'; import zlib from 'zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';
const buf = fs.readFileSync('/home/user/bigfile/design/canvas.fig');
let p=12; const sl=buf.readUInt32LE(p); p+=4;
const schema = decodeBinarySchema(zlib.inflateRawSync(buf.slice(p,p+sl)));
const c = compileSchema(schema);
const msg = c.decodeMessage(fs.readFileSync('out/block0.raw'));
const fam = {}; const withGlyphs={g:0,total:0};
let imgPaint=null, gradPaint=null, firstImageNode=null;
for (const n of msg.nodeChanges) {
  if (n.type==='TEXT') {
    const f = n.fontName ? `${n.fontName.family} / ${n.fontName.style}` : '?';
    fam[f]=(fam[f]||0)+1; withGlyphs.total++;
    if (n.derivedTextData && n.derivedTextData.glyphs && n.derivedTextData.glyphs.length) withGlyphs.g++;
  }
  const paints=[...(n.fillPaints||[]),...(n.strokePaints||[])];
  for (const pt of paints) {
    if (pt.type==='IMAGE' && !imgPaint) { imgPaint=pt; firstImageNode={name:n.name,type:n.type}; }
    if ((pt.type==='GRADIENT_LINEAR'||pt.type==='GRADIENT_RADIAL'||pt.type==='GRADIENT_ANGULAR') && !gradPaint) gradPaint=pt;
  }
}
console.log('fonts:', fam);
console.log('text nodes with glyph outlines:', withGlyphs);
console.log('\nIMAGE paint sample:', JSON.stringify(imgPaint,null,1).slice(0,1200));
console.log('node:', JSON.stringify(firstImageNode));
console.log('\nGRADIENT sample:', JSON.stringify(gradPaint,null,1).slice(0,1500));
// blob sizes
const sizes = msg.blobs.map(b=>b.bytes.length);
console.log('\nblobs count', sizes.length, 'total MB', (sizes.reduce((a,b)=>a+b,0)/1e6).toFixed(1));
console.log('blob size histogram', JSON.stringify(sizes.slice(0,12)));
