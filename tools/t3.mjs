import { Resvg } from '@resvg/resvg-js';
const cases = {
  plain: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red"/></svg>`,
  flip: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g transform="matrix(1 0 0 -1 0 100)"><rect width="50" height="50" fill="red"/></g></svg>`,
  flipclip: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs><g transform="matrix(1 0 0 -1 0 100)" clip-path="url(#c)"><rect width="50" height="50" fill="red"/></g></svg>`,
  zopacity: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g opacity="0"><rect width="50" height="50" fill="red"/></g></svg>`,
  emptypath: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0 L10 0 L10 10" fill="red"/></svg>`,
  text: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="0" y="20" font-family="Roboto" font-size="14">Hi</text></svg>`,
  textanchor: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50" y="20" text-anchor="middle" font-family="Roboto" font-size="14">Hi</text></svg>`,
};
for (const [k, v] of Object.entries(cases)) {
  try { new Resvg(v, { font: { fontDirs: ['/home/user/bigfile/tools/fonts'], loadSystemFonts: false } }).render().asPng(); console.log(k, 'ok'); }
  catch (e) { console.log(k, 'FAIL', e.message.slice(0, 60)); }
}
