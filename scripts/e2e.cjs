// End-to-end check of the site over raw CDP — zero dependencies, trusted input.
//
//   node scripts/e2e.cjs [url] [--smoke]
//
// Full mode (default, localhost): drives every page with x-ray on and off using
// real key/mouse events, asserts the overlay's own invariants (render count flat
// while scrolling, registry size 0/1 across routes, hotkey ignored in inputs,
// ProjectDetail renders once), mobile + reduced-motion emulation, and fails on
// any uncaught exception, console.error, or failed request (except Vercel's
// analytics script 404-ing on localhost).
// --smoke (production): DOM-only subset — no window.__xray off localhost.
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
    cdp.on('Network.responseReceived', (p) => { if (p.response.status >= 400 && !/_vercel\/insights/.test(p.response.url)) problems.failedRequests.push(`${p.response.status} ${p.response.url}`); });
    cdp.on('Network.loadingFailed', (p) => { if (!p.canceled && !/_vercel\/insights/.test(p.errorText)) problems.failedRequests.push(`FAILED ${p.errorText}`); });

    const js = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '').slice(0, 200)); return r.result.value; };
    const key = async (k, code, vk) => { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
    const clickAt = async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
    const clickSel = async (sel) => { const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`); assert(r, `no element ${sel}`); await clickAt(r.x, r.y); };
    const waitLoader = async () => { for (let i = 0; i < 60; i++) { if (await js(`!document.querySelector('.loader-stage') && !!document.querySelector('.stage')`)) return; await sleep(250); } throw new Error('loader never finished'); };
    const on = () => js(`!!document.querySelector('[data-xray-root]')`);
    const kv = (label) => js(`(() => { const k = [...document.querySelectorAll('.xr-k')].find(k => k.textContent === ${JSON.stringify(label)}); return k?.nextElementSibling?.textContent ?? null; })()`);
    const status = () => js(`document.querySelector('.xr-hud-status')?.textContent ?? null`);
    const rowV = (re) => js(`[...document.querySelectorAll('.xr-row .xr-v')].map(e => e.textContent).find(t => ${re}.test(t)) ?? null`);
    const boxes = () => js(`[...document.querySelectorAll('.xr-box')].map(b => (b.querySelector('.xr-tag')?.firstChild?.textContent?.trim() || '?') + ' [' + (b.className.replace('xr-box','').trim() || 'visible') + ']')`);
    const navTo = async (label) => { await js(`[...document.querySelectorAll('.nav-item')].find(n => /${label}/.test(n.textContent)).click(); true`); await sleep(1700); };
    const scroller = `[...document.querySelectorAll('.stage div')].find(d => d.scrollHeight > d.clientHeight * 3 && getComputedStyle(d).overflowY === 'auto')`;

    console.log(`e2e against ${url} ${smoke ? '(smoke)' : '(full)'}`);

    await step('load: loader completes, chrome present', async () => {
      await cdp.send('Page.navigate', { url });
      await waitLoader();
      const r = await js(`({ toggle: !!document.querySelector('.xr-toggle'), nav: document.querySelectorAll('.nav-item').length, chat: !!document.querySelector('.ddb-launcher') })`);
      assert(r.toggle && r.nav === 6, `nav/toggle missing (nav ${r.nav}, toggle ${r.toggle})`);
      return r;
    });

    await step('hint: shows once after the loader', async () => {
      await sleep(2000);
      const t = await js(`document.querySelector('.xr-hint')?.textContent ?? null`);
      assert(t && /SEE THE ENGINE/.test(t), `hint not shown (${t})`);
      return t;
    });

    await step('toggle on with a real X keypress', async () => {
      await key('x', 'KeyX', 88); await sleep(800);
      assert(await on(), 'overlay did not mount');
      const s = await status(); assert(/HOME · 14 REGISTERED/.test(s), `status ${s}`);
      return { status: s, hint: await js(`!!document.querySelector('.xr-hint')`) };
    });

    await step('scroll: overlay render count flat, boxes go live, spring settles', async () => {
      const x0 = await kv('X-RAY'); const h0 = await kv('HOME');
      await js(`(async () => { const sc = ${scroller}; const max = sc.scrollHeight - sc.clientHeight; for (let i = 1; i <= 12; i++) { sc.scrollTop = max * 0.62 * i / 12; await new Promise(r => setTimeout(r, 90)); } })()`);
      const live = (await boxes()).filter((b) => /is-live/.test(b)).length;
      await sleep(1800);
      const x1 = await kv('X-RAY'); const h1 = await kv('HOME');
      const state = await rowV('/^(integrating|settled)$/'); const settle = await rowV('/^settle /');
      assert(x0 === x1, `X-RAY render count moved ${x0} → ${x1}`); assert(h0 === h1, `HOME re-rendered ${h0} → ${h1}`);
      assert(live > 0, 'no box went live during scroll'); assert(state === 'settled', `spring state ${state}`);
      const ms = Number((settle || '').match(/settle ([\d.]+) s/)?.[1]) * 1000;
      assert(ms > 0 && ms < 1000, `settle ${settle}`);
      return { xray: x1, liveDuringScroll: live, settle };
    });

    await step('seek: clicking the timeline strip scrolls the page', async () => {
      const r = await js(`(() => { const t = document.querySelector('.xr-tl-track'); const b = t.getBoundingClientRect(); return { x: b.left + b.width * 0.5, y: b.top + b.height / 2 }; })()`);
      await clickAt(r.x, r.y); await sleep(1500);
      const p = Number(await kv('PROGRESS')); const seg = await rowV('/^(HOLD|ZONE)/');
      assert(p > 0.45 && p < 0.55, `progress after seek ${p}`);
      return { progress: p, segment: seg };
    });

    if (!smoke) {
      await step('routes: x-ray survives navigation, registry never holds two pages', async () => {
        const out = {};
        for (const [label, expectStrip] of [['ABOUT', 'timeline'], ['WORK', 'pointer'], ['HONOURS', 'pointer'], ['TRANSMIT', 'pointer'], ['INDEX', 'timeline']]) {
          await navTo(label);
          const r = await js(`({ on: !!document.querySelector('[data-xray-root]'), size: window.__xray.pageRegistry.size(), status: document.querySelector('.xr-hud-status')?.textContent, pointer: !!document.querySelector('.xr-timeline--pointer'), head: !!document.querySelector('.xr-tl-head') })`);
          assert(r.on, `x-ray off after ${label}`); assert(r.size === 1, `registry size ${r.size} after ${label}`);
          assert(expectStrip === 'pointer' ? r.pointer : r.head, `strip variant wrong on ${label}`);
          out[label] = r.status;
        }
        return out;
      });

      await step('work: ProjectDetail renders once, detail boxes appear, no backdrop blur', async () => {
        await navTo('WORK');
        const before = await js(`window.__xray.renderCounts.get('ProjectDetail')`);
        await clickSel('.work-project-card'); await sleep(1300);
        const r = await js(`(() => { const ov = document.querySelector('.work-detail-overlay'); return { renders: window.__xray.renderCounts.get('ProjectDetail'), opacity: ov && getComputedStyle(ov).opacity, backdrop: ov && getComputedStyle(ov).backdropFilter, detailBoxes: document.querySelectorAll('[data-xray^="DETAIL"]').length }; })()`);
        assert(r.renders - before === 1, `ProjectDetail rendered ${r.renders - before} times`); assert(r.opacity === '1', `overlay opacity ${r.opacity}`);
        assert(r.backdrop === 'none', `backdrop ${r.backdrop}`); assert(r.detailBoxes >= 5, `detail boxes ${r.detailBoxes}`);
        await js(`[...document.querySelectorAll('.work-detail-overlay button')].find(b => /CLOSE/.test(b.textContent)).click(); true`); await sleep(500);
        assert(!(await js(`!!document.querySelector('.work-detail-overlay')`)), 'detail did not close');
        return r;
      });

      await step('contact: X typed into the form does not toggle x-ray', async () => {
        await navTo('TRANSMIT');
        await clickSel('textarea'); await key('x', 'KeyX', 88); await sleep(300);
        const r = await js(`({ on: !!document.querySelector('[data-xray-root]'), typed: document.querySelector('textarea').value, via: window.__xray.uiStore.lastChange?.via })`);
        assert(r.on && r.typed === 'x', `on=${r.on} typed=${JSON.stringify(r.typed)}`);
        return r;
      });

      await step('chat: X typed into the chat input does not toggle x-ray', async () => {
        await clickSel('.ddb-launcher'); await sleep(500);
        await clickSel('.ddb-input input'); await key('x', 'KeyX', 88); await sleep(300);
        const r = await js(`({ on: !!document.querySelector('[data-xray-root]'), typed: document.querySelector('.ddb-input input').value, panelOpen: !!document.querySelector('.ddb-panel.open') })`);
        assert(r.on && r.typed === 'x' && r.panelOpen, JSON.stringify(r));
        await clickSel('.ddb-launcher'); await sleep(300);
        return r;
      });
    }

    await step('escape: turns x-ray off and unmounts the overlay', async () => {
      await key('Escape', 'Escape', 27); await sleep(500);
      assert(!(await on()), 'overlay still mounted');
      const pressed = await js(`document.querySelector('.xr-toggle').getAttribute('aria-pressed')`);
      assert(pressed === 'false', `aria-pressed ${pressed}`);
      return smoke ? { pressed } : await js(`({ via: window.__xray.uiStore.lastChange?.via, subs: window.__xray.subs.size })`);
    });

    await step('chip: clicking the nav chip toggles on and off', async () => {
      await clickSel('.xr-toggle'); await sleep(700); assert(await on(), 'chip did not turn x-ray on');
      await clickSel('.xr-toggle'); await sleep(500); assert(!(await on()), 'chip did not turn x-ray off');
      return true;
    });

    if (!smoke) {
      await step('mobile 390×844: collapsed HUD, no strip on home, strip on about', async () => {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await cdp.send('Page.reload'); await sleep(600); await waitLoader(); await sleep(400);
        await clickSel('.xr-toggle'); await sleep(900);
        const home = await js(`({ on: !!document.querySelector('[data-xray-root]'), min: !!document.querySelector('.xr-hud.is-min'), strip: !!document.querySelector('.xr-timeline'), sum: document.querySelector('.xr-hud-sum')?.textContent })`);
        assert(home.on && home.min && !home.strip, JSON.stringify(home));
        await js(`[...document.querySelectorAll('.nav-item')].find(n => /ABOUT/.test(n.textContent)).click(); true`); await sleep(1900);
        const about = await js(`({ strip: !!document.querySelector('.xr-timeline'), head: !!document.querySelector('.xr-tl-head'), boxes: document.querySelectorAll('.xr-box').length, tagsShown: [...document.querySelectorAll('.xr-tag')].filter(t => getComputedStyle(t).display !== 'none').length })`);
        assert(about.strip && about.head && about.boxes > 5, JSON.stringify(about));
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
        return { home, about };
      });

      await step('reduced motion: no scan line, footer says so', async () => {
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await cdp.send('Page.navigate', { url }); await waitLoader(); await sleep(400);
        await key('x', 'KeyX', 88); await sleep(700);
        const r = await js(`({ root: document.querySelector('[data-xray-root]')?.className, sweep: !!document.querySelector('.xr-sweep'), foot: document.querySelector('.xr-hud-foot')?.textContent })`);
        assert(/is-reduced/.test(r.root) && !r.sweep && /REDUCED MOTION/.test(r.foot), JSON.stringify(r));
        await cdp.send('Emulation.setEmulatedMedia', { features: [] });
        return r;
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
