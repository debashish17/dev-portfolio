import React, { useEffect, useRef, useState } from 'react';
import { frame, cancelFrame, useReducedMotion } from 'motion/react';
import { uiStore, pageRegistry, renderCounts } from '../../lib/xray/store.js';
import { useXRayUi, useXRayEntry } from './hooks.js';
import { useRenderCount } from '../../lib/xray/render-count.js';
import { useHotkey } from '../../lib/hotkeys.js';
import { useIsMobile } from '../primitives.jsx';
import { createFrameMeter } from '../../lib/xray/frame-meter.js';
import { detectSupport, createVitals, startObservers } from '../../lib/xray/observers.js';
import { summarizeResources } from '../../lib/xray/resources.js';
import { lcpCandidates, lcpMeta } from '../../lib/xray/boot-lcp.js';
import {
  tone, fpsTone, BANDS, fmtMs, fmtS, fmtKB, fmtNum, fmtSigned, fmtCount, fmtCamera, segmentAt, springLabel,
} from '../../lib/xray/format.js';
import XRayOverlay from './XRayOverlay.jsx';
import Timeline from './Timeline.jsx';
import PerfHUD from './PerfHUD.jsx';

// Mount point for x-ray mode. Always mounted (one hotkey listener), returns
// null when off. Everything that costs anything — the frame loop, observers,
// the MutationObserver, the overlay DOM — lives in XRayLive and exists only
// while the mode is on.

const OFF_MS = 250;
const NAV_H = 56;
const MAX_TARGETS = 24;

export default function XRayRoot({ route, transitioning, loading }) {
  useRenderCount('XRayRoot');
  const ui = useXRayUi();

  useHotkey('x', () => { if (!loading) uiStore.toggle(); });
  useHotkey('Escape', () => uiStore.setOn(false), { enabled: ui.on, allowInEditable: true });

  // ?xray=1 opens the mode once the loader is gone — a shareable link.
  useEffect(() => {
    if (loading) return;
    try { if (new URLSearchParams(location.search).get('xray') === '1') uiStore.setOn(true); } catch { /* ignore */ }
  }, [loading]);

  // Keep the DOM for 250ms after toggling off so the exit transition can play.
  const [mounted, setMounted] = useState(ui.on);
  useEffect(() => {
    if (ui.on) { setMounted(true); return; }
    const id = setTimeout(() => setMounted(false), OFF_MS);
    return () => clearTimeout(id);
  }, [ui.on]);

  if (!mounted) return null;
  return <XRayLive route={route} transitioning={transitioning} hud={ui.hud} leaving={!ui.on} />;
}

// ----------------------------------------------------------------------------

const collectTargets = (stage) => {
  if (!stage) return [];
  const H = window.innerHeight;
  const els = [...stage.querySelectorAll('[data-xray]')].slice(0, MAX_TARGETS);
  return els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (r.top - NAV_H) / Math.max(1, H - NAV_H)));
    return {
      el, i, key: `${i}:${el.getAttribute('data-xray') || ''}`,
      name: el.getAttribute('data-xray') || '',
      values: (el.getAttribute('data-xray-values') || '').split(',').map((s) => s.trim()).filter(Boolean),
      render: el.getAttribute('data-xray-render') || null,
      delay: Math.round(frac * 240),
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
};

const fmtVal = (d) => {
  const v = d.mv.get();
  if (typeof v === 'string') return v.length > 24 ? `${v.slice(0, 24)}…` : v;
  if (typeof v !== 'number') return String(v);
  if (d.kind === 'spring' || (d.kind === 'raw' && d.range && d.range[0] < 0)) return fmtSigned(v, 2) + (d.unit || '');
  return fmtNum(v, d.kind === 'progress' ? 4 : 2);
};

const lcpElementLabel = () => {
  const c = lcpCandidates[lcpCandidates.length - 1];
  if (!c) return '';
  const who = c.tag ? `${c.tag}${c.className ? `.${c.className.split(' ')[0]}` : ''}${c.text ? ` "${c.text}"` : ''}` : (c.url ? c.url.split('/').pop() : 'element detached before capture');
  const fin = lcpMeta.firstInputAt != null ? ` · finalised @ ${fmtS(lcpMeta.firstInputAt, 1)}` : '';
  const hid = lcpMeta.hiddenAt != null && lcpMeta.hiddenAt < c.t ? ' · tab hidden before LCP' : '';
  return `${who}${fin}${hid}`;
};

function XRayLive({ route, transitioning, hud, leaving }) {
  useRenderCount('XRayOverlay'); // the self-test row: must stay flat while scrolling
  const entry = useXRayEntry();
  const isMobile = useIsMobile();
  const reduced = useReducedMotion();
  const [support] = useState(detectSupport);
  const [targets, setTargets] = useState([]);
  const [sweepKey, setSweepKey] = useState(0);
  const [showSweep, setShowSweep] = useState(true);

  // Refs bag shared with the children; the loop writes DOM through it.
  const Rref = useRef(null);
  if (!Rref.current) {
    Rref.current = {
      text: new Map(), boxes: new Map(), tags: new Map(), reads: new Map(), rows: new Map(),
      spark: null, playhead: null, ghost: null, meterX: null, meterY: null, trackW: 0,
    };
  }
  const R = Rref.current;

  // Props the loop needs but which change without re-running the effect.
  const propsRef = useRef({ route, transitioning });
  propsRef.current = { route, transitioning };

  // Replay the scan-line reveal once the curtain has finished.
  const wasTransitioning = useRef(transitioning);
  useEffect(() => {
    if (wasTransitioning.current && !transitioning) { setSweepKey((k) => k + 1); setShowSweep(true); }
    wasTransitioning.current = transitioning;
  }, [transitioning]);

  useEffect(() => {
    const meter = createFrameMeter();
    const vitals = createVitals();
    const openedAt = performance.now();
    let resDirty = true;
    const stopObs = startObservers(vitals, support, { openedAt, onResource: () => { resDirty = true; } });

    const stage = document.querySelector('.stage');
    let dirty = true;
    // Only an added/removed ELEMENT can change the target list. Motion updates a
    // MotionValue child (ProgressDial's digits) by swapping the text node every
    // frame — that is childList churn too, and must not re-render the overlay.
    const hasElement = (nodes) => { for (const n of nodes) if (n.nodeType === 1) return true; return false; };
    const mo = stage ? new MutationObserver((muts) => {
      for (const m of muts) if (hasElement(m.addedNodes) || hasElement(m.removedNodes)) { dirty = true; return; }
    }) : null;
    if (mo) mo.observe(stage, { childList: true, subtree: true });
    const sameTargets = (a, b) => a.length === b.length && a.every((t, i) => t.el === b[i].el);
    const onVis = () => meter.pause();
    document.addEventListener('visibilitychange', onVis);

    // ---- closure state ----
    const last = new Map();
    const put = (key, s) => {
      const el = R.text.get(key);
      if (!el || last.get(key) === s) return;
      last.set(key, s);
      el.textContent = s;
    };
    const putTone = (key, tn) => {
      const el = R.text.get(key);
      if (!el) return;
      const base = el.className.replace(/ ?is-(warn|bad)/g, '');
      const cls = base + (tn === 'warn' ? ' is-warn' : tn === 'poor' ? ' is-bad' : '');
      const k = `tone:${key}`;
      if (last.get(k) === cls) return;
      last.set(k, cls);
      el.className = cls;
    };
    let list = [];
    const rects = [];
    const flash = new Map();
    let bound = null, boundEntry = null;
    let scrollChangedAt = 0, progressChanges = 0, tailFrames = 0, settleMs = null, wasAnimating = false;
    let flushAt = 0, slowAt = 0;
    let prevCounts = renderCounts.snapshot(), hot = '';
    let errors = 0, lastErr = '';
    const spark = new Float32Array(120);

    const bind = (e) => {
      if (bound) { for (const un of bound) un(); bound = null; }
      boundEntry = e;
      if (!e) return;
      const subs = [];
      const pv = e.values && e.values.progress ? e.values.progress.mv : null;
      const sv = e.values && e.values.scrollY ? e.values.scrollY.mv : null;
      if (pv) subs.push(pv.on('change', () => { progressChanges++; }));
      if (sv) subs.push(sv.on('change', () => { scrollChangedAt = performance.now(); tailFrames = 0; settleMs = null; }));
      bound = subs;
    };

    // The body is wrapped because this runs inside Motion's postRender step: an
    // uncaught throw there would leave the batcher's isProcessing flag stuck and
    // silently kill every spring on the site. A HUD bug must only ever cost the HUD.
    const tick = (fd) => {
      try { run(fd); } catch (err) {
        errors++;
        lastErr = String((err && err.message) || err).slice(0, 80);
        const el = R.text.get('status');
        if (el) el.textContent = `HUD ERROR ×${errors} · ${lastErr}`;
      }
    };

    const run = (fd) => {
      const t0 = performance.now();
      const motionCost = t0 - fd.timestamp; // Motion's own per-frame JS this frame
      if (document.hidden) return;

      const e = pageRegistry.current();
      if (e !== boundEntry) bind(e);
      if (dirty) {
        dirty = false;
        const next = collectTargets(stage);
        if (!sameTargets(next, list)) { list = next; setTargets(next); } // React render only when the element set changes
      }

      // ---------------- READS ----------------
      const W = window.innerWidth, H = window.innerHeight;
      for (let i = 0; i < list.length; i++) rects[i] = list[i].el.getBoundingClientRect();
      const pv = e && e.values.progress ? e.values.progress.mv : null;
      const sv = e && e.values.scrollY ? e.values.scrollY.mv : null;
      const p = pv ? pv.get() : null;
      const raw = sv ? sv.get() : null;
      const animating = pv ? pv.isAnimating() : false;
      if (pv) {
        if (animating) tailFrames++;
        if (wasAnimating && !animating && scrollChangedAt) settleMs = t0 - scrollChangedAt;
        wasAnimating = animating;
      }
      const counts = renderCounts.snapshot();
      const { transitioning: swapping, route: rt } = propsRef.current;

      // ---------------- WRITES: boxes, every frame ----------------
      const placed = [];
      for (let i = 0; i < list.length; i++) {
        const tg = list[i];
        const box = R.boxes.get(tg.el);
        if (!box) continue;
        const r = rects[i];
        const area = r.width * r.height;
        let visible = r.width >= 2 && r.height >= 2 && r.bottom > NAV_H && r.top < H && r.right > 0 && r.left < W && area < 0.9 * W * H;
        if (visible && typeof tg.el.checkVisibility === 'function') {
          try { visible = tg.el.checkVisibility({ visibilityProperty: true, opacityProperty: true }); } catch { /* older signature */ }
        }
        let cls = 'xr-box';
        if (!visible) {
          cls += ' is-hidden';
        } else {
          let live = false;
          if (e) {
            for (const k of tg.values) {
              const d = e.values[k];
              if (d && (Math.abs(d.mv.getVelocity()) > 1e-6 || t0 - d.mv.updatedAt < 100)) { live = true; break; }
            }
          }
          if (live) cls += ' is-live';
          if (tg.render) {
            const c = counts[tg.render] || 0;
            let f = flash.get(tg.render);
            if (!f) { f = { count: c, until: 0 }; flash.set(tg.render, f); }
            if (c > f.count) { f.count = c; f.until = t0 + 300; }
            if (t0 < f.until) cls += ' is-render';
          }
          if (area >= 0.2 * W * H) cls += ' is-big';

          // Tag placement: outside-top-left, then inside, then right-aligned, then below.
          let tagCls = 'xr-tag mono';
          const tagW = tg.name.length * 6.2 + 12, tagH = tg.values.length ? 26 : 15;
          let tx = r.left, ty = r.top - tagH;
          if (r.top < NAV_H + 20) { tagCls += ' xr-tag--in'; ty = r.top; }
          if (r.left + tagW > W - 8) { tagCls += ' xr-tag--right'; tx = r.right - tagW; }
          for (const q of placed) {
            if (tx < q.x + q.w && tx + tagW > q.x && ty < q.y + q.h && ty + tagH > q.y) {
              tagCls = tagCls.replace(' xr-tag--in', '') + ' xr-tag--below'; ty = r.bottom; break;
            }
          }
          placed.push({ x: tx, y: ty, w: tagW, h: tagH });
          const tag = R.tags.get(tg.el);
          if (tag) { const k = `tagcls:${i}`; if (last.get(k) !== tagCls) { last.set(k, tagCls); tag.className = tagCls; } }

          const l = Math.round(r.left), tp = Math.round(r.top), w = Math.round(r.width), h = Math.round(r.height);
          const pos = `translate3d(${l}px,${tp}px,0)`;
          const kp = `pos:${i}`;
          if (last.get(kp) !== pos) { last.set(kp, pos); box.style.transform = pos; }
          const ks = `size:${i}`, sz = `${w}x${h}`;
          if (last.get(ks) !== sz) { last.set(ks, sz); box.style.width = `${w}px`; box.style.height = `${h}px`; }
        }
        const kc = `cls:${i}`;
        if (last.get(kc) !== cls) { last.set(kc, cls); box.className = cls; }
      }

      // Playheads and meters — compositor-only transforms, every frame.
      if (R.playhead && p != null) R.playhead.style.transform = `translateX(${p * R.trackW}px)`;
      if (R.ghost && raw != null) R.ghost.style.transform = `translateX(${raw * R.trackW}px)`;
      if (e && !e.timeline) {
        const mx = e.values.mouseX, my = e.values.mouseY;
        if (R.meterX && mx) R.meterX.style.transform = `translateX(${(mx.mv.get() / ((mx.range && mx.range[1]) || 1)) * 30}px)`;
        if (R.meterY && my) R.meterY.style.transform = `translateX(${(my.mv.get() / ((my.range && my.range[1]) || 1)) * 30}px)`;
      }
      if (e) {
        for (const [name, d] of Object.entries(e.values)) {
          const bar = R.rows.get(name);
          if (!bar || d.kind === 'transform') continue;
          const v = d.mv.get();
          const [a, b] = d.range || [0, 1];
          const n = Math.max(0, Math.min(1, (v - a) / (b - a || 1)));
          bar.style.transform = `scaleX(${n.toFixed(3)})`;
        }
      }

      // ---------------- WRITES: text, ≤10 Hz ----------------
      const t1 = performance.now();
      meter.tick(fd.timestamp, motionCost, t1 - t0);

      if (t1 - flushAt >= 100) {
        flushAt = t1;

        // ENGINE
        put('fps', meter.fps ? String(meter.fps) : '…');
        putTone('fps', fpsTone(meter.avg1s, meter.refreshHz));
        put('avg', meter.avg1s ? `${meter.avg1s.toFixed(1)} avg/1s` : '…');
        put('frame', meter.frameMs ? `${meter.frameMs.toFixed(1)} ms` : '…');
        put('worst', meter.worstMs ? `worst ${meter.worstMs.toFixed(0)} ms` : '');
        // A visible page whose rAF runs at ~1 Hz is the browser throttling an
        // occluded/background window — say so rather than grading the page for it.
        put('hz', meter.avg1s > 0 && meter.avg1s < 5
          ? 'rAF throttled by browser'
          : meter.refreshHz ? `@ ${meter.refreshSnapped ? '' : '~'}${meter.refreshHz} Hz` : '@ … Hz');
        put('dropped', String(meter.dropped));
        put('long', String(meter.long));
        put('cost', `motion ${meter.motionMs.toFixed(2)} ms · hud ${meter.hudMs.toFixed(2)} ms / frame`);
        put('longtask', support.longtask
          ? `${vitals.longCount} · last ${vitals.longLast.toFixed(0)} ms · TBT≈ ${vitals.longBlocking.toFixed(0)} ms`
          : 'n/a in this browser');
        putTone('longtask', support.longtask ? tone(vitals.longBlocking, BANDS.tbt) : 'na');
        if (R.spark) {
          const n = meter.spark(spark);
          let pts = '';
          for (let i = 0; i < n; i++) {
            const y = 20 - (Math.min(spark[i], 50) / 50) * 20;
            pts += `${((i * 96) / 120).toFixed(1)},${y.toFixed(1)} `;
          }
          R.spark.setAttribute('points', pts);
        }

        // VITALS
        put('lcp', vitals.lcp != null ? fmtS(vitals.lcp) : support.lcp ? '…' : 'n/a');
        putTone('lcp', support.lcp ? tone(vitals.lcp, BANDS.lcp) : 'na');
        put('lcpEl', vitals.lcp != null ? lcpElementLabel() : '');
        put('fcp', vitals.fcp != null ? fmtS(vitals.fcp) : support.paint ? '…' : 'n/a');
        putTone('fcp', support.paint ? tone(vitals.fcp, BANDS.fcp) : 'na');
        put('cls', support.cls ? vitals.cls.toFixed(3) : 'n/a');
        putTone('cls', support.cls ? tone(vitals.cls, BANDS.cls) : 'na');
        put('clsSum', support.cls ? `Σ ${vitals.clsSum.toFixed(3)} · shifts ${vitals.clsShifts}${vitals.clsWorstNode ? ` · worst <${vitals.clsWorstNode}>` : ''}` : '');
        put('inp', support.event ? (vitals.inp != null ? `≈ ${Math.round(vitals.inp)} ms` : '…') : 'n/a');
        putTone('inp', support.event ? tone(vitals.inp, BANDS.inp) : 'na');
        const li = vitals.lastInteraction;
        put('inpLast', li ? `INP n=${vitals.inpN} · last ${Math.round(li.duration)} ms ${li.name}${li.hudOpen ? ' (incl. HUD open)' : ''}` : '');

        // PAYLOAD (only when the resource list changed)
        if (resDirty) {
          resDirty = false;
          const s = summarizeResources();
          put('js', s.js.n ? `${fmtKB(s.js.decoded)} → ${s.js.cached ? 'cached' : `${fmtKB(s.js.encoded)} wire`}` : 'n/a');
          put('css', s.css.n ? `${fmtKB(s.css.decoded)} → ${s.css.cached ? 'cached' : `${fmtKB(s.css.encoded)} wire`}` : 'n/a');
          put('fonts', s.fonts.n ? `${s.fonts.n} files · ${s.fonts.tao ? fmtKB(s.fonts.encoded) : 'n/a (no Timing-Allow-Origin)'}` : 'none');
          const nv = s.navigation;
          put('nav', nv ? `TTFB ${fmtMs(nv.ttfb)} · DCL ${fmtS(nv.dcl)}${nv.load ? ` · load ${fmtS(nv.load)}` : ''} · ${nv.type} · server ${fmtMs(nv.server)}` : '');
          putTone('nav', nv ? tone(nv.ttfb, BANDS.ttfb) : 'na');
        }

        // REACT
        const pageId = pageRegistry.currentId();
        put('rApp', String(counts.App ?? 0));
        put('rPage', pageId ? String(counts[pageId] ?? 0) : '—');
        put('rClock', String(counts.LiveClock ?? 0));
        put('rXray', String(counts.XRayOverlay ?? 0));
        put('rHot', hot);

        // MOTION
        if (pv && e) {
          put('mProgress', fmtNum(p, 4));
          put('mVel', `${fmtSigned(pv.getVelocity(), 3)}/s`);
          put('mState', animating ? 'integrating' : 'settled');
          put('mSettle', settleMs != null ? `settle ${(settleMs / 1000).toFixed(2)} s · ${tailFrames} tail frames` : animating ? `${tailFrames} tail frames…` : '');
          const sp = e.values.progress.spring;
          put('mSpring', sp ? `${springLabel(sp)}${sp.restDelta ? ` · restDelta ${sp.restDelta}` : ''}` : '');
          const sg = segmentAt(p, e.timeline);
          put('mSeg', sg ? `${sg.label} · ${sg.range[0].toFixed(2)}–${sg.range[1].toFixed(2)}` : '');
          put('mChanges', `${progressChanges} change/frame`);
          put('tlP', `p ${fmtNum(p, 3)}`);
          put('tlRaw', raw != null ? fmtNum(raw, 3) : '');
          put('tlCam', e.timeline ? fmtCamera(e.timeline.camera(p, e.variant === 'mobile')) : '');
          put('tlSeg', sg ? sg.label : '');
        } else {
          put('mProgress', '—');
          put('mVel', '');
          put('mState', e ? 'no scroll spring on this page' : '');
          put('mSettle', '');
          put('mSpring', '');
          put('mSeg', '');
          put('mChanges', '');
          if (e && e.values.mouseX && e.values.mouseY) {
            put('tlPtr', `x ${fmtSigned(e.values.mouseX.mv.get(), 2)} · y ${fmtSigned(e.values.mouseY.mv.get(), 2)}`);
          }
        }
        put('mCount', e ? `${Object.keys(e.values).length} registered` : '0 registered');
        if (e) for (const [name, d] of Object.entries(e.values)) put(`row:${name}`, fmtVal(d));

        // Tag readouts (≤2 values each)
        if (e) {
          for (let i = 0; i < list.length; i++) {
            const tg = list[i];
            const rd = R.reads.get(tg.el);
            if (!rd) continue;
            let s = '';
            for (const k of tg.values.slice(0, 2)) { const d = e.values[k]; if (d) s += `${s ? ' · ' : ''}${k} ${fmtVal(d)}`; }
            put(`read:${i}`, s);
            if (rd.textContent !== s) rd.textContent = s;
          }
        }

        // STATUS
        const n = e ? Object.keys(e.values).length : 0;
        put('status', errors ? `HUD ERROR ×${errors} · ${lastErr}`
          : swapping ? `ROUTE → ${String(rt).toUpperCase()}`
          : e ? `${String(pageId || '').toUpperCase()} · ${n} REGISTERED · ${list.length} BOXES`
          : 'THIS PAGE REGISTERS NOTHING YET');
        put('sum', `${meter.fps || '…'} FPS · LCP ${vitals.lcp != null ? fmtS(vitals.lcp, 1) : 'n/a'}${p != null ? ` · p ${fmtNum(p, 2)}` : ''}`);
      }

      // ---------------- slow (1 Hz) ----------------
      if (t1 - slowAt >= 1000) {
        slowAt = t1;
        put('dom', `DOM NODES ${fmtCount(document.getElementsByTagName('*').length)}`);
        let best = '', bestD = 0;
        for (const k of Object.keys(counts)) {
          if (k === 'XRayOverlay' || k === 'XRayRoot') continue;
          const d = (counts[k] || 0) - (prevCounts[k] || 0);
          if (d > bestD) { bestD = d; best = k; }
        }
        hot = bestD > 0 ? `hot: ${best} +${bestD}/s` : 'hot: — (nothing re-rendered this second)';
        prevCounts = counts;
      }

      progressChanges = 0;
    };

    frame.postRender(tick, true);
    return () => {
      cancelFrame(tick);
      stopObs();
      if (mo) mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (bound) for (const un of bound) un();
    };
    // Intentionally mount-once: everything the loop needs it reads live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cls = `xr${leaving ? ' is-off' : ''}${transitioning ? ' is-swap' : ''}${reduced ? ' is-reduced' : ''}${isMobile ? ' is-mobile' : ''}`;
  const pageId = pageRegistry.currentId();
  const hudMode = hud ?? (isMobile ? 'collapsed' : 'expanded'); // null = auto until the user toggles

  return (
    <div className={cls} data-xray-root="">
      <XRayOverlay
        targets={targets}
        R={R}
        timeline={entry ? entry.timeline : null}
        sweepKey={sweepKey}
        showSweep={showSweep && !reduced}
      />
      {(!isMobile || (entry && entry.timeline)) && <Timeline entry={entry} R={R} />}
      <PerfHUD R={R} entry={entry} hud={hudMode} support={support} reduced={reduced} pageId={pageId} />
    </div>
  );
}
