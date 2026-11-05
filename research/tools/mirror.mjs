// Mirrors every static asset of the target app listed in its Rspack runtime chunk map
// (static/js/async/*, static/css/async/*) plus entry files, into research/mirror/.
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://www.mytradershub.com';
const OUT = path.resolve(import.meta.dirname, '../mirror');

const names = { 0: 'ODD_Autobot-(1)-(1)-xml', 212: 'ADVANCED_DIFFERS-(2)-(2)-xml', 420: 'ADVANCED-O_U-J2-(1)-xml', 547: 'PATEL-(with-Entry)-xml', 574: 'OVER_UNDER-AUTOBOT-xml', 75: 'Raziel-Over-Under-xml', 793: 'MENTORSHIP_2-(1)-xml', 862: 'dbot-collection', 920: 'EVEN_Autobot-(1)-xml', 932: 'Reborn-HnR-(1)-xml' };
const js = { 0: 'ae17ac9d', 101: 'cc78c419', 122: 'd0108d90', 137: 'c4a658be', 144: 'b6166686', 188: '91fa6b4b', 207: 'a8af2224', 212: '3bdc3203', 228: '11c05894', 280: 'ea7de5e5', 289: '749f4a93', 304: 'c8506fc1', 311: '223a9fd0', 332: '5556d0c5', 385: '7348bf43', 420: '74ac4731', 459: '34976b8c', 464: 'aee643a7', 515: '655cde3e', 527: '73c158ee', 547: '215cab01', 563: 'ab87cea2', 567: 'b95aefa0', 574: 'bc800fff', 583: 'f86459ae', 610: 'f3a85663', 641: '538044a5', 683: '06256967', 686: 'eb85ac8e', 708: '96aa17b3', 738: '235e12d5', 742: '7eaae6d7', 75: 'e00c650b', 761: '8de971c9', 776: 'e00b8f4f', 793: '8a2152d9', 850: '29bda34d', 862: 'ba12f6ec', 883: '04be5df9', 89: 'e6c1cfd6', 920: '6a14412d', 932: '99125d7c' };
const css = { 207: '040a43a2', 332: '2cac5f0b', 459: '69850dd6', 515: '78132313', 563: '0caf0c61', 567: '17fc9ae4', 583: '33bbaa30', 641: '95737524', 683: '977cf214', 686: '8ea103d4', 695: '7eb03842', 861: '76d9635b' };

const files = [
  'app', 'static/js/lib-react.a6c09a4b.js', 'static/js/lib-router.8db75b09.js', 'static/js/762.a03e8a0f.js',
  'static/js/index.5bfe9e30.js', 'static/css/762.3560e13e.css', 'static/css/index.22543744.css',
  'manifest.json', 'robots.txt', 'deriv-logo.svg',
  ...Object.entries(js).map(([id, h]) => `static/js/async/${names[id] || id}.${h}.js`),
  ...Object.entries(css).map(([id, h]) => `static/css/async/${id}.${h}.css`),
  ...(process.argv.slice(2)),
];

let ok = 0; const fail = [];
await Promise.all(files.map(async (f) => {
  const url = `${ORIGIN}/${f.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const r = await fetch(url);
    if (!r.ok) { fail.push(`${r.status} ${f}`); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    const dest = path.join(OUT, f === 'app' ? 'app.html' : f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    ok++;
  } catch (e) { fail.push(`ERR ${f} ${e.message}`); }
}));
console.log(`mirrored ${ok}/${files.length}`); if (fail.length) console.log(fail.join('\n'));
