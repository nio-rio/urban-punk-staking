const { spawn } = require('child_process');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;
const profile = '/tmp/chrome-mobile-check';

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check',
  '--window-size=390,844', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

async function main() {
  let version;
  for (let i = 0; i < 50; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch { await new Promise(r => setTimeout(r, 300)); }
  }
  if (!version) throw new Error('chrome did not start');

  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  };
  await new Promise(r => ws.onopen = r);

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) return 'EXC: ' + JSON.stringify(res.exceptionDetails);
    return res.result.value;
  };

  await send('Page.enable');
  await send('Page.navigate', { url: 'https://urbanpunkofficial.com' });
  await new Promise(r => setTimeout(r, 5000));

  for (const vp of [{ w: 390, h: 844 }, { w: 375, h: 812 }]) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
    await new Promise(r => setTimeout(r, 600));

    const summary = await evalJs(`(() => {
      const de = document.documentElement;
      const vw = innerWidth, vh = innerHeight;
      // find horizontally overflowing elements (excluding marquee + fixed decor)
      const offenders = [];
      document.querySelectorAll('body *').forEach(el => {
        if (el.closest('.marquee') || el.classList.contains('side-punk') || el.classList.contains('punk-character')) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > vw + 2 || r.left < -2)) {
          offenders.push(el.tagName + '.' + (el.className && el.className.toString ? el.className.toString().split(' ')[0] : '') + ' L' + Math.round(r.left) + ' R' + Math.round(r.right));
        }
      });
      const boxes = {};
      ['.side-punk','.punk-character','.music-wrap','.dpf','.marquee','.art-disclaimer'].forEach(s => {
        const el = document.querySelector(s);
        if (el) { const r = el.getBoundingClientRect(); boxes[s] = {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(r.bottom),r:Math.round(r.right)}; }
      });
      return JSON.stringify({
        vw, vh,
        scrollWidth: de.scrollWidth,
        horizOverflow: de.scrollWidth > vw,
        offenders: offenders.slice(0, 20),
        boxes
      });
    })()`);
    console.log(`\n===== viewport ${vp.w}x${vp.h} =====`);
    console.log(summary);
  }

  ws.close(); chrome.kill(); process.exit(0);
}
main().catch(e => { console.error(e.message); chrome.kill(); process.exit(1); });
