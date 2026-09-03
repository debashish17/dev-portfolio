// Scroll-smoothness bench for the home page — raw CDP, zero dependencies.
//
// Launches its own Chrome with occlusion/background throttling disabled (a
// minimized or covered Chrome throttles requestAnimationFrame to ~1 Hz, which
// makes any in-browser measurement meaningless), scrolls through all four acts
// with wheel-sized notches, and reports frame-time percentiles, long tasks, a
// main-thread breakdown from a CDP trace, and the scroll spring's step response
// (time to 90 % and time to settle) read from the page's own MotionValue via the
// x-ray registry (window.__xray, exposed on localhost only).
//
//   bun run bench:scroll                       # against http://localhost:8899/
//   node scripts/scroll-bench.cjs <url> [cpuThrottle=1] [label=run]
//
// Serve a build first: `bun run build && python -m http.server 8899 --directory dist`.
// Set CHROME_PATH if Chrome is not in the default location. Output JSON and the
// raw trace land in %TEMP%/portfolio-bench (or BENCH_OUT).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const url = process.argv[2] || 'http://localhost:8899/';
const cpu = Number(process.argv[3] || 1);
const label = process.argv[4] || 'run';
const OUT_DIR = process.env.BENCH_OUT || path.join(os.tmpdir(), 'portfolio-bench');
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `bench-${label}`);
const PORT = Number(process.env.BENCH_PORT || 9333);
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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

// Wheel-like scroll through the whole page, recording rAF deltas and long tasks.
const SCROLL_SCRIPT = `(async () => {
  const sc = [...document.querySelectorAll('.stage div')].find((d) => d.scrollHeight > d.clientHeight * 3 && getComputedStyle(d).overflowY === 'auto');
  const max = sc.scrollHeight - sc.clientHeight;
  const dts = []; let last = performance.now(); let go = true;
  const loop = (t) => { if (!go) return; dts.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  let longTasks = 0, longTotal = 0;
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { longTasks++; longTotal += e.duration; } });
  po.observe({ type: 'longtask' });
  performance.mark('scroll-start');
  const notch = 100, delay = 60; let y = 0;
  while (y < max) { y = Math.min(max, y + notch); sc.scrollTop = y; await new Promise((r) => setTimeout(r, delay)); }
  performance.mark('scroll-end');
  await new Promise((r) => setTimeout(r, 1600));
  performance.mark('settle-end');
  go = false; po.disconnect();
  const sorted = [...dts].sort((a, b) => a - b);
  const p = (q) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(2);
  const hz = 1000 / p(0.2);
  return JSON.stringify({
    frames: dts.length, p50: p(0.5), p90: p(0.9), p95: p(0.95), p99: p(0.99), max: p(1),
    over16: dts.filter((d) => d > 16.9).length, over33: dts.filter((d) => d > 33.5).length,
    dropped: dts.filter((d) => d > 1.5 * (1000 / hz)).length, estHz: Math.round(hz),
    longTasks, longTotal: Math.round(longTotal),
    scrollMs: Math.round(performance.getEntriesByName('scroll-end')[0].startTime - performance.getEntriesByName('scroll-start')[0].startTime),
  });
})()`;

// Step response of the scroll spring: park mid-hold, jump one act, time 90 % and settle.
const STEP_SCRIPT = `(async () => {
  const sc = [...document.querySelectorAll('.stage div')].find((d) => d.scrollHeight > d.clientHeight * 3 && getComputedStyle(d).overflowY === 'auto');
  const max = sc.scrollHeight - sc.clientHeight;
  const e = window.__xray && window.__xray.pageRegistry.current();
  if (!e || !e.values.progress) return JSON.stringify({ error: 'no x-ray registry on this page (is the URL localhost?)' });
  const mv = e.values.progress.mv, raw = e.values.scrollY.mv, cfg = e.values.progress.spring;
  sc.scrollTop = max * 0.355; await new Promise((r) => setTimeout(r, 2500));
  const from = mv.get();
  sc.scrollTop = max * 0.455;
  const target = sc.scrollTop / max;
  const d = target - from;
  const t0 = performance.now(); let t90 = null, tSettle = null, frames = 0, started = false;
  await new Promise((res) => { const f = () => { frames++; const v = mv.get();
    if (!started && Math.abs(v - from) > 0.0005) started = true;
    if (t90 == null && Math.abs(v - from) >= 0.9 * Math.abs(d)) t90 = performance.now() - t0;
    if (started && Math.abs(target - v) <= 0.0005 && !mv.isAnimating()) { tSettle = performance.now() - t0; return res(); }
    if (performance.now() - t0 > 4000) return res(); requestAnimationFrame(f); }; requestAnimationFrame(f); });
  return JSON.stringify({ spring: cfg, from: +from.toFixed(4), target: +target.toFixed(4), t90ms: t90 && Math.round(t90), settleMs: tSettle && Math.round(tSettle), tailFrames: frames });
})()`;

(async () => {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT_DIR, 'profile')}`,
    '--window-size=1460,980', '--window-position=40,40',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
    url,
  ], { stdio: 'ignore' });
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = list.find((t) => t.type === 'page' && t.url.startsWith(url.replace(/\/$/, ''))); } catch { /* not up yet */ }
    }
    if (!target) throw new Error('page target not found — is the server running?');
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    const evalJs = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception));
      return r.result.value;
    };
    for (let i = 0; i < 40; i++) { if (await evalJs(`!document.querySelector('.loader-stage') && !!document.querySelector('.stage')`)) break; await sleep(250); }
    await sleep(600);
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    const rafPerS = await evalJs(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); })`);
    if (rafPerS < 30) console.warn(`warning: rAF is running at ${rafPerS}/s — the window is probably occluded; numbers will be meaningless`);

    const events = [];
    cdp.on('Tracing.dataCollected', (p) => { events.push(...p.value); });
    const done = new Promise((res) => cdp.on('Tracing.tracingComplete', res));
    await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'] } });
    const result = JSON.parse(await evalJs(SCROLL_SCRIPT));
    await cdp.send('Tracing.end');
    await done;
    const step = JSON.parse(await evalJs(STEP_SCRIPT));

    const mark = (n) => events.find((e) => e.name === n && e.cat && e.cat.includes('blink.user_timing'));
    const t0 = mark('scroll-start')?.ts, t1 = mark('settle-end')?.ts;
    const CATS = { FunctionCall: 'script', EvaluateScript: 'script', 'v8.callFunction': 'script', RunMicrotasks: 'script', FireAnimationFrame: 'raf', TimerFire: 'timer', EventDispatch: 'event',
      UpdateLayoutTree: 'style', RecalculateStyles: 'style', Layout: 'layout', PrePaint: 'prepaint', Paint: 'paint', UpdateLayer: 'paint', UpdateLayerTree: 'layer', CompositeLayers: 'composite', Commit: 'commit', HitTest: 'hittest', ScrollLayer: 'scroll' };
    const buckets = {}; let drawFrames = 0;
    if (t0 && t1) {
      for (const e of events) {
        if (e.ts < t0 || e.ts > t1) continue;
        if (e.name === 'DrawFrame') { drawFrames++; continue; }
        if (e.ph !== 'X' || !e.dur) continue;
        const b = CATS[e.name]; if (!b) continue;
        buckets[b] = (buckets[b] || 0) + e.dur / 1000;
      }
    }
    const mainThreadMs = Object.fromEntries(Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toFixed(0)]));
    const report = { label, url, cpuThrottle: cpu, rafPerS, ...result, windowMs: t0 && t1 ? Math.round((t1 - t0) / 1000) : 0, mainThreadMs, drawFrames, step };
    fs.writeFileSync(`${out}.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${out}.trace.json`, JSON.stringify({ traceEvents: events }));
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nsaved ${out}.json and ${out}.trace.json (open the trace in DevTools › Performance › Load profile)`);
    cdp.close();
  } finally {
    chrome.kill();
  }
})().catch((e) => { console.error('BENCH FAILED:', e.message); process.exit(1); });
