// End-to-end check of the site over raw CDP — zero dependencies, trusted input.
//
//   node scripts/e2e.cjs [url] [--smoke]
//
// Checks the landing end to end: the folio band, the scrubbed staircase (frame
// painted, focused card advances, live type on the card faces), the
// contribution calendar, and that every route still mounts. Fails on any
// uncaught exception, console.error, or failed request (except Vercel's
// analytics script 404-ing on localhost).
// --smoke (production): skips the route walk.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const url = (process.argv.find((a) => /^https?:/.test(a)) || 'http://localhost:8899/').replace(/\/?$/, '/');
const smoke = process.argv.includes('--smoke');
const PORT = Number(process.env.E2E_PORT || 9335);
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-e2e-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else if (msg.method && listeners.has(msg.method)) for (const fn of listeners.get(msg.method)) fn(msg.params);
  };
  return {
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (method, fn) => { if (!listeners.has(method)) listeners.set(method, new Set()); listeners.get(method).add(fn); },
    close: () => ws.close(),
  };
}

const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { const details = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, details }); console.log(`  ok   ${name}  ${JSON.stringify(details ?? '')}`.slice(0, 220)); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: e.message }); console.log(`  FAIL ${name}  ${e.message}`); }
};
const assert = (c, msg) => { if (!c) throw new Error(msg); };

(async () => {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1460,980', '--window-position=40,40',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
    'about:blank',
  ], { stdio: 'ignore' });
  let cdp;
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = list.find((t) => t.type === 'page'); } catch { /* not up */ } }
    assert(target, 'no page target');
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Network.enable'); await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    const problems = { exceptions: [], consoleErrors: [], failedRequests: [] };
    cdp.on('Runtime.exceptionThrown', (p) => problems.exceptions.push(p.exceptionDetails.text + ' ' + (p.exceptionDetails.exception?.description || '').slice(0, 160)));
    cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') problems.consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 160)); });
    // /api/* only exists on Vercel; against a static `dist` server those 404s
    // are the harness, and both callers already degrade to a hidden section.
    const expected = (u) => /_vercel\/insights/.test(u) || (/^http:\/\/localhost/.test(url) && /\/api\//.test(u));
    cdp.on('Network.responseReceived', (p) => { if (p.response.status >= 400 && !expected(p.response.url)) problems.failedRequests.push(`${p.response.status} ${p.response.url}`); });
    cdp.on('Network.loadingFailed', (p) => { if (!p.canceled && !/_vercel\/insights/.test(p.errorText)) problems.failedRequests.push(`FAILED ${p.errorText}`); });

    const js = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '').slice(0, 200)); return r.result.value; };
    const key = async (k, code, vk) => { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
    const clickAt = async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
    const clickSel = async (sel) => { const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`); assert(r, `no element ${sel}`); await clickAt(r.x, r.y); };
    const waitLoader = async () => { for (let i = 0; i < 60; i++) { if (await js(`!document.querySelector('.loader-stage') && !!document.querySelector('.stage')`)) return; await sleep(250); } throw new Error('loader never finished'); };
    const navTo = async (label) => { await js(`[...document.querySelectorAll('.nav-item')].find(n => /${label}/.test(n.textContent)).click(); true`); await sleep(1700); };
    const scroller = `[...document.querySelectorAll('.stage div')].find(d => d.scrollHeight > d.clientHeight * 3 && getComputedStyle(d).overflowY === 'auto')`;

    console.log(`e2e against ${url} ${smoke ? '(smoke)' : '(full)'}`);

    await step('load: loader completes, chrome present', async () => {
      await cdp.send('Page.navigate', { url });
      await waitLoader();
      const r = await js(`({ nav: document.querySelectorAll('.nav-item').length, chat: !!document.querySelector('.ddb-launcher'), xray: !!document.querySelector('.xr-toggle') })`);
      assert(r.nav === 6, `nav items ${r.nav}`);
      assert(!r.xray, 'x-ray chip still in the nav');
      return r;
    });

    await step('landing: folio, staircase and both exits are present', async () => {
      const r = await js(`({
        folio: !!document.querySelector('.folio'),
        stair: !!document.querySelector('.stair'),
        tools: document.querySelectorAll('.stair .sr-only li').length,
        exits: [...document.querySelectorAll('.exit-name')].map(e => e.textContent),
      })`);
      assert(r.folio, 'folio band missing');
      assert(r.stair, 'staircase section missing');
      assert(r.tools === 12, `expected 12 tools in the text fallback, got ${r.tools}`);
      assert(r.exits.join(',') === 'Work,Studio', `exits ${r.exits}`);
      return r;
    });

    await step('stair: scrubbing advances the frame and the focused card', async () => {
      const first = await js(`document.querySelector('.stair-counter-n')?.textContent ?? null`);
      await js(`(() => { const sc = ${scroller}; const s = document.querySelector('.stair');
        sc.scrollTop = s.offsetTop + (s.offsetHeight - sc.clientHeight) * 0.55; return true; })()`);
      await sleep(1400);
      const r = await js(`(() => {
        const c = document.querySelector('.stair-canvas');
        let ink = 0;
        if (c) {
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < d.length; i += 4000) if (d[i] > 0) ink++;
        }
        return { card: document.querySelector('.stair-counter-n')?.textContent ?? null,
                 painted: ink,
                 labelled: [...document.querySelectorAll('.stair-card')].filter(e => +e.style.opacity > 0).length };
      })()`);
      assert(r.painted > 0, `canvas never painted (${r.painted} opaque samples)`);
      assert(r.card && r.card !== first, `focused card did not advance (${first} -> ${r.card})`);
      assert(r.labelled > 0, 'no card carried live type');
      return { from: first, ...r };
    });

    // Absent is a legitimate state: with no GITHUB_TOKEN the endpoint 503s and
    // the section removes itself rather than showing an empty year.
    await step('contributions: renders a full year, or hides itself cleanly', async () => {
      const r = await js(`(() => { const s = document.querySelector('.contrib');
        if (!s) return { present: false };
        return { present: true, cells: s.querySelectorAll('.contrib-cell').length,
                 total: s.querySelector('.contrib-title')?.textContent?.trim().slice(0, 24) ?? null }; })()`);
      if (r.present) assert(r.cells > 300, `only ${r.cells} day cells`);
      return r;
    });

    if (!smoke) {
      await step('routes: every page mounts and comes back without error', async () => {
        const seen = [];
        for (const label of ['ABOUT', 'WORK', 'HONOURS', 'TRANSMIT', 'STUDIO', 'INDEX']) {
          await navTo(label);
          seen.push(await js(`!!document.querySelector('.stage')?.firstElementChild`));
        }
        assert(seen.every(Boolean), `a route mounted nothing: ${seen}`);
        return seen.length + ' routes';
      });
    }


    await step('no exceptions, console errors, or failed requests', async () => {
      assert(problems.exceptions.length === 0, `exceptions: ${problems.exceptions.join(' | ')}`);
      assert(problems.consoleErrors.length === 0, `console.error: ${problems.consoleErrors.join(' | ')}`);
      assert(problems.failedRequests.length === 0, `requests: ${problems.failedRequests.join(' | ')}`);
      return 'clean';
    });
  } catch (e) {
    results.push({ name: 'harness', ok: false, error: e.message });
    console.log(`  FAIL harness  ${e.message}`);
  } finally {
    try { cdp && cdp.close(); } catch { /* closing */ }
    chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''}`);
  process.exit(failed.length ? 1 : 0);
})();
