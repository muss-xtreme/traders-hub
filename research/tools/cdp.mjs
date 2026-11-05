// Minimal CDP driver for the research Chrome (port 9222).
// usage: node cdp.mjs <cmd> [arg]   cmd: nav <url> | eval <js|@file> | shot <file.png> [full] | url
import fs from 'node:fs';

const [, , cmd, arg, arg2] = process.argv;
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('mytradershub')) || list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500);
  return r.result?.result?.value;
};

if (cmd === 'nav') {
  await send('Page.navigate', { url: arg });
  await new Promise(r => setTimeout(r, Number(arg2 || 6000)));
  console.log(await evaluate('location.href'));
} else if (cmd === 'eval') {
  const code = arg.startsWith('@') ? fs.readFileSync(arg.slice(1), 'utf8') : arg;
  const v = await evaluate(code);
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
} else if (cmd === 'shot') {
  const params = { format: 'png' };
  if (arg2 === 'full') {
    const m = await send('Page.getLayoutMetrics');
    const { width, height } = m.result.cssContentSize;
    params.clip = { x: 0, y: 0, width, height: Math.min(height, 12000), scale: 1 };
    params.captureBeyondViewport = true;
  }
  const r = await send('Page.captureScreenshot', params);
  fs.writeFileSync(arg, Buffer.from(r.result.data, 'base64'));
  console.log('saved', arg);
} else if (cmd === 'url') {
  console.log(page.url);
}
ws.close();
process.exit(0);
