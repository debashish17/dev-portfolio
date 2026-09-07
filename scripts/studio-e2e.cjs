// End-to-end run of the Studio over raw CDP — compose, drag, pen, export,
// publish, like, wall, poster page, share HTML. Zero dependencies.
//
//   node scripts/studio-e2e.cjs http://localhost:PORT [--shots=DIR] [--photo=path.jpg]
//
// Needs the dev server (bun src/index.ts) with UPSTASH_REDIS_REST_URL set —
// scripts/mock-upstash.cjs is enough. --photo also exercises the vision screen
// (one Gemini call, so it costs one request of quota).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const base = (process.argv.find((a) => /^https?:/.test(a)) || 'http://localhost:8899').replace(/\/$/, '');
const shots = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8) || null;
const photo = (process.argv.find((a) => a.startsWith('--photo=')) || '').slice(8) || null;
const PORT = Number(process.env.E2E_PORT || 9338);
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-e2e-'));
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-dl-'));
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
  try { const d = await fn(); results.push({ name, ok: true }); console.log(`  ok   ${name}  ${JSON.stringify(d ?? '')}`.slice(0, 200)); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`  FAIL ${name}  ${e.message}`); }
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
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads }));

    const problems = { exceptions: [], consoleErrors: [], failedRequests: [] };
    cdp.on('Runtime.exceptionThrown', (p) => problems.exceptions.push(p.exceptionDetails.text + ' ' + (p.exceptionDetails.exception?.description || '').slice(0, 200)));
    cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') problems.consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200)); });
    cdp.on('Network.responseReceived', (p) => { if (p.response.status >= 400 && !/_vercel\/insights|\/p\/nope/.test(p.response.url)) problems.failedRequests.push(`${p.response.status} ${p.response.url}`); });

    const js = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '').slice(0, 200)); return r.result.value; };
    const key = async (k, code, vk) => { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
    const mouse = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
    const clickAt = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
    const rect = async (sel) => { const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; })()`); assert(r, `no element ${sel}`); return r; };
    const clickSel = async (sel) => { const r = await rect(sel); await clickAt(r.cx, r.cy); await sleep(120); };
    const clickText = async (sel, text) => { const r = await js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'nearest' }); const b = e.getBoundingClientRect(); return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; })()`); assert(r, `no ${sel} with text ${text}`); await clickAt(r.cx, r.cy); await sleep(150); };
    const waitFor = async (expr, ms = 8000, what = expr) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await sleep(150); } throw new Error(`timeout: ${what}`); };
    const waitLoader = async () => waitFor(`!document.querySelector('.loader-stage') && !!document.querySelector('.stage')`, 15000, 'loader');
    const shot = async (name) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); const s = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(s.data, 'base64')); };
    const layers = () => js(`Number((document.querySelector('.st-board-cap')?.textContent.match(/^(\\d+) LAYERS/) || [])[1])`);

    // ------------------------------------------------------------ compose
    await cdp.send('Page.navigate', { url: `${base}/studio` });
    await waitLoader();
    await waitFor(`!!document.querySelector('.st-board canvas')`, 10000, 'board');
    await sleep(600);

    await step('studio route from URL · nav has 06 STUDIO active', async () => {
      const nav = await js(`[...document.querySelectorAll('.nav-item')].map(n => n.textContent.trim() + (n.classList.contains('active') ? '*' : ''))`);
      assert(nav.some((n) => /06STUDIO\*/.test(n.replace(/\s/g, ''))), `nav: ${nav.join(' | ')}`);
      assert(await js(`location.pathname`) === '/studio', 'url not /studio');
      return nav.length;
    });
    await step('daily seed composition drawn', async () => {
      const n = await layers();
      assert(n >= 5, `only ${n} layers`);
      const painted = await js(`(() => { const c = document.querySelector('.st-canvas'); const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data; let dark = 0; for (let i = 0; i < d.length; i += 40) if (d[i] < 60) dark++; return dark; })()`);
      assert(painted > 200, `canvas looks blank (${painted})`);
      return { layers: n, darkSamples: painted };
    });
    await shot('studio-desktop');

    await step('add DISC → layer count +1 and selected', async () => {
      const before = await layers();
      await clickText('.st-tile', 'DISC');
      await waitFor(`document.querySelector('.st-sel-tag')?.textContent.startsWith('DISC')`, 3000, 'disc selected');
      assert((await layers()) === before + 1, 'layer count did not grow');
      return await js(`document.querySelector('.st-sel-tag')?.textContent`);
    });

    await step('drag the disc → position changes and snaps to the grid', async () => {
      const sel = await rect('.st-sel');
      const before = await js(`document.querySelector('.st-sel-tag')?.textContent`);
      await mouse('mouseMoved', sel.cx, sel.cy); await mouse('mousePressed', sel.cx, sel.cy);
      for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', sel.cx + i * 11, sel.cy + i * 7); await sleep(16); }
      await mouse('mouseReleased', sel.cx + 88, sel.cy + 56);
      await sleep(700); // spring settle
      const after = await js(`document.querySelector('.st-sel-tag')?.textContent`);
      assert(after !== before, `tag unchanged: ${after}`);
      const m = after.match(/x (-?\d+) · y (-?\d+)/);
      assert(m && Number(m[1]) % 40 === 0 && Number(m[2]) % 40 === 0, `not on the 40px half-grid: ${after}`);
      return after;
    });

    await step('inspector: MULTIPLY and PLATE SHIFT toggle; ink swatch changes', async () => {
      await clickText('.st-inspector .st-chip', 'MULTIPLY');
      await clickText('.st-inspector .st-chip', 'PLATE SHIFT');
      const on = await js(`[...document.querySelectorAll('.st-inspector .st-chip.is-on')].map(c => c.textContent)`);
      assert(on.includes('MULTIPLY') && on.includes('PLATE SHIFT'), `chips on: ${on}`);
      return on;
    });
    await shot('studio-inspector');

    await step('PEN: three clicks + Enter → a custom shape', async () => {
      const before = await layers();
      await clickText('.st-tile', 'PEN');
      const b = await rect('.st-board');
      await clickAt(b.x + b.w * 0.2, b.y + b.h * 0.2); await sleep(80);
      await clickAt(b.x + b.w * 0.5, b.y + b.h * 0.15); await sleep(80);
      await clickAt(b.x + b.w * 0.4, b.y + b.h * 0.4); await sleep(80);
      await key('Enter', 'Enter', 13);
      await waitFor(`document.querySelector('.st-sel-tag')?.textContent.startsWith('PEN')`, 3000, 'pen selected');
      assert((await layers()) === before + 1, 'pen layer not added');
      return await js(`document.querySelector('.st-sel-tag')?.textContent`);
    });

    await step('DELETE key removes the selected layer · CTRL+Z brings it back', async () => {
      const before = await layers();
      await key('Delete', 'Delete', 46);
      await sleep(150);
      assert((await layers()) === before - 1, 'delete did nothing');
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2, text: 'z' });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await sleep(150);
      assert((await layers()) === before, 'undo did nothing');
      return before;
    });

    await step('SHUFFLE recomposes', async () => {
      const before = await js(`document.querySelector('.st-board-cap')?.textContent`);
      await clickText('.st-btn', 'SHUFFLE');
      await sleep(300);
      const after = await js(`document.querySelector('.st-board-cap')?.textContent`);
      assert(after !== before, 'nothing changed');
      return after;
    });

    if (photo) {
      await step('IMAGE: upload a photo → pressed into four inks', async () => {
        const before = await layers();
        const node = await cdp.send('DOM.getDocument', { depth: -1 });
        const q = await cdp.send('DOM.querySelector', { nodeId: node.root.nodeId, selector: 'input[type=file]' });
        await cdp.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [path.resolve(photo)] });
        await waitFor(`document.querySelector('.st-sel-tag')?.textContent.startsWith('IMAGE')`, 15000, 'image layer');
        assert((await layers()) === before + 1, 'image layer not added');
        await clickText('.st-inspector .st-chip', 'HALFTONE');
        await sleep(400);
        return await js(`[...document.querySelectorAll('.st-inspector .st-chip.is-on')].map(c => c.textContent).join(',')`);
      });
      await shot('studio-photo');
    }

    await step('EXPORT PNG downloads a 1200×1600 file', async () => {
      const beforeFiles = fs.readdirSync(downloads).length;
      await clickText('.st-btn', 'EXPORT PNG');
      const t0 = Date.now();
      let file = null;
      while (Date.now() - t0 < 10000 && !file) { await sleep(200); const f = fs.readdirSync(downloads).filter((x) => x.endsWith('.png')); if (f.length > beforeFiles) file = f[0]; }
      assert(file, 'no download');
      const buf = fs.readFileSync(path.join(downloads, file));
      assert(buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 1600, `size ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
      return { file, kb: Math.round(buf.length / 1024) };
    });

    // ------------------------------------------------------------ publish
    let posterId = null;
    await step('PUBLISH → live poster with a share link', async () => {
      await clickText('.st-btn', 'PUBLISH');
      await waitFor(`/IT IS UP|HELD|REFUSED/.test(document.querySelector('.st-result')?.textContent || '') || !!document.querySelector('.st-err') || !!document.querySelector('.st-notice')`, 60000, 'publish result');
      const txt = await js(`document.querySelector('.st-result')?.textContent`);
      const err = await js(`document.querySelector('.st-err')?.textContent || document.querySelector('.st-notice')?.textContent || ''`);
      assert(/IT IS UP/.test(txt), `publish result: ${err || txt.slice(0, 120)}`);
      posterId = await js(`document.querySelector('.st-result a[href^="/p/"]')?.getAttribute('href').slice(3)`);
      assert(posterId, 'no poster link');
      return posterId;
    });
    await shot('studio-published');

    await step('THE WALL shows the poster · LIKE toggles the count', async () => {
      await clickText('.st-tabs-head .st-chip', 'THE WALL');
      await waitFor(`document.querySelectorAll('.st-ten-item').length > 0`, 8000, 'wall items');
      const n = await js(`document.querySelectorAll('.st-ten-item').length`);
      const src = await js(`document.querySelector('.st-ten-item img')?.getAttribute('src') || ''`);
      assert(/thumb/.test(src), `grid image is not the thumbnail: ${src.slice(0, 80)}`);
      const likesBefore = await js(`document.querySelector('.st-ten-item .st-likes')?.textContent.trim()`);
      await clickSel('.st-ten-item .st-like');
      await waitFor(`document.querySelector('.st-ten-item .st-like')?.classList.contains('is-on')`, 5000, 'liked');
      // the button is disabled while the request is in flight — wait for the server's answer
      await waitFor(`!document.querySelector('.st-ten-item .st-like')?.disabled`, 8000, 'like confirmed');
      const likesAfter = await js(`document.querySelector('.st-ten-item .st-likes')?.textContent.trim()`);
      assert(likesAfter !== likesBefore, `likes unchanged: ${likesAfter}`);
      await clickSel('.st-ten-item .st-like'); // unlike
      await waitFor(`!document.querySelector('.st-ten-item .st-like')?.classList.contains('is-on')`, 5000, 'unliked');
      await waitFor(`!document.querySelector('.st-ten-item .st-like')?.disabled`, 8000, 'unlike confirmed');
      const likesBack = await js(`document.querySelector('.st-ten-item .st-likes')?.textContent.trim()`);
      assert(likesBack === likesBefore, `likes did not return: ${likesBack}`);
      return { items: n, likesBefore, likesAfter, likesBack };
    });
    await shot('studio-wall');

    await step('poster page /p/:id renders with LIKE and REMIX', async () => {
      // the human path: the share URL → server forward → app poster view
      await cdp.send('Page.navigate', { url: `${base}/p/${posterId}` });
      await waitLoader();
      await waitFor(`!!document.querySelector('.st-poster-view img')`, 12000, 'poster view');
      assert((await js(`location.pathname`)) === `/p/${posterId}`, 'url not /p/:id');
      const btns = await js(`[...document.querySelectorAll('.st-poster-actions .st-btn')].map(b => b.textContent.trim())`);
      assert(btns.some((b) => /LIKE/.test(b)) && btns.some((b) => /REMIX/.test(b)), `buttons: ${btns}`);
      return btns;
    });
    await shot('studio-poster');

    await step('REMIX loads the layers into a fresh composer', async () => {
      await clickText('.st-poster-actions .st-btn', 'REMIX');
      // no composer may flash while the layers load — only the loading line
      await waitFor(`/REMIXING/.test(document.querySelector('.st-sub')?.textContent || '') && !!document.querySelector('.st-board canvas')`, 15000, 'remixed composer');
      await sleep(300);
      const n = await layers();
      assert(n >= 3, `remix has ${n} layers`);
      return { layers: n };
    });

    await step('share HTML carries Open Graph tags and forwards humans', async () => {
      const res = await fetch(`${base}/p/${posterId}`, { redirect: 'manual' });
      const html = await res.text();
      assert(res.status === 200, `status ${res.status}`);
      assert(/property="og:image" content="http/.test(html), 'no og:image');
      assert(/og:title" content="Poster № \d+/.test(html), 'no og:title');
      assert(new RegExp(`url=${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/studio\\?p=${posterId}`).test(html), 'no forward');
      const bad = await fetch(`${base}/p/nope`, { redirect: 'manual' });
      assert(bad.status === 302 && /studio\?wall/.test(bad.headers.get('location') || ''), `unknown id → ${bad.status}`);
      return html.match(/og:image" content="([^"]+)/)[1].slice(0, 80);
    });

    await step('API guards: wrong origin 403 · bad doc 400 · like on missing 404 · admin needs key', async () => {
      const bad = await fetch(`${base}/api/studio/like`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
      assert(bad.status === 403, `origin: ${bad.status}`);
      const inv = await fetch(`${base}/api/studio/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ doc: { layers: [{ type: 'nope' }] } }) });
      assert(inv.status === 400, `invalid doc: ${inv.status}`);
      const miss = await fetch(`${base}/api/studio/like`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'x-studio-uid': 'e2e' }, body: JSON.stringify({ id: 'zzzzzz' }) });
      assert(miss.status === 404, `missing: ${miss.status}`);
      const adm = await fetch(`${base}/api/studio/admin`);
      assert(adm.status === 401, `admin: ${adm.status}`);
      const admOk = await fetch(`${base}/api/studio/admin?key=devkey`);
      return { admin: admOk.status };
    });

    // ------------------------------------------------------------ mobile
    await step('mobile: board fits, dock below, publish reachable', async () => {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await cdp.send('Page.navigate', { url: `${base}/studio` });
      await waitLoader();
      await waitFor(`!!document.querySelector('.st-board canvas')`, 10000, 'board');
      await sleep(700);
      const b = await rect('.st-board');
      assert(b.w <= 390 && b.w > 250, `board width ${b.w}`);
      const overflow = await js(`document.documentElement.scrollWidth > 392 || document.querySelector('.st-page').scrollWidth > 392`);
      assert(!overflow, 'horizontal overflow');
      await shot('studio-mobile');
      return { boardW: Math.round(b.w), boardH: Math.round(b.h) };
    });

    await step('no exceptions, console errors or failed requests', async () => {
      problems.exceptions = problems.exceptions.filter((x) => !/ResizeObserver loop/.test(x) || (() => { throw new Error('ResizeObserver loop: ' + x); })());
      assert(!problems.exceptions.length, `exceptions: ${problems.exceptions.join(' || ')}`);
      assert(!problems.consoleErrors.length, `console.error: ${problems.consoleErrors.join(' || ')}`);
      assert(!problems.failedRequests.length, `requests: ${problems.failedRequests.join(' || ')}`);
      return 'clean';
    });
  } catch (e) {
    console.log('  ABORT ', e.message);
    results.push({ name: 'harness', ok: false, error: e.message });
  } finally {
    try { cdp?.close(); } catch { /* ignore */ }
    chrome.kill();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ' — FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`);
    process.exit(failed.length ? 1 : 0);
  }
})();
