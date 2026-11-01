import fs from 'fs';
const NM = 'node_modules';
const FONTS = [
  ['Roboto', 300, `${NM}/@fontsource/roboto/files/roboto-latin-300-normal.woff2`],
  ['Roboto', 400, `${NM}/@fontsource/roboto/files/roboto-latin-400-normal.woff2`],
  ['Roboto', 500, `${NM}/@fontsource/roboto/files/roboto-latin-500-normal.woff2`],
  ['Roboto', 600, `${NM}/@fontsource/roboto/files/roboto-latin-600-normal.woff2`],
  ['Roboto', 700, `${NM}/@fontsource/roboto/files/roboto-latin-700-normal.woff2`],
  ['Google Sans', 400, `${NM}/@fontsource/google-sans/files/google-sans-latin-400-normal.woff2`],
  ['Google Sans', 500, `${NM}/@fontsource/google-sans/files/google-sans-latin-500-normal.woff2`],
  ['Google Sans Flex', 400, `${NM}/@fontsource/google-sans-flex/files/google-sans-flex-latin-400-normal.woff2`],
  ['Google Sans Flex', 500, `${NM}/@fontsource/google-sans-flex/files/google-sans-flex-latin-500-normal.woff2`],
  ['Inter', 400, `${NM}/@fontsource/inter/files/inter-latin-400-normal.woff2`],
  ['Goblin One', 400, `${NM}/@fontsource/goblin-one/files/goblin-one-latin-400-normal.woff2`],
];
let css = '/* fonts bundled from the design (Roboto / Google Sans / Inter / Goblin One) */\n';
for (const [fam, weight, file] of FONTS) {
  if (!fs.existsSync(file)) { console.error('missing font file', file); continue; }
  const b64 = fs.readFileSync(file).toString('base64');
  css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}\n`;
}
fs.writeFileSync('/home/user/bigfile/www/fonts.css', css);
console.log('fonts.css', (css.length / 1024).toFixed(0) + 'KB', FONTS.length, 'faces');
