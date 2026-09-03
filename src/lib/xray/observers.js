// Core Web Vitals and long tasks, straight from PerformanceObserver — no library.
//
// Everything is created inside startObservers() and torn down by the returned
// function. That matters under StrictMode: the second observe({buffered:true})
// re-delivers the entire buffer, so accumulators must be fresh per call, never
// module state. Browsers keep per-type buffers (LCP/CLS/event 150, longtask 200)
// until something observes them, which is why a HUD opened seconds after load
// can still report load-time facts.

export function detectSupport() {
  const types = new Set(
    (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes) || []
  );
  return {
    longtask: types.has('longtask'),
    lcp: types.has('largest-contentful-paint'),
    cls: types.has('layout-shift'),
    event: types.has('event')
      && typeof PerformanceEventTiming !== 'undefined'
      && 'interactionId' in PerformanceEventTiming.prototype,
    paint: types.has('paint'),
    resource: types.has('resource'),
  };
}

export function createVitals() {
  return {
    lcp: null, lcpSize: 0, lcpUrl: '',
    fcp: null,
    cls: 0, clsSum: 0, clsShifts: 0, clsWorstNode: '',
    inp: null, inpN: 0, lastInteraction: null, // { name, duration, startTime, hudOpen }
    longCount: 0, longLast: 0, longBlocking: 0, longSinceOpen: 0,
  };
}

export function startObservers(v, support, { openedAt = performance.now(), onResource } = {}) {
  const obs = [];
  const watch = (type, cb, extra = {}) => {
    try {
      const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) cb(e); });
      po.observe({ type, buffered: true, ...extra });
      obs.push(po);
    } catch { /* type advertised but refused — leave as n/a */ }
  };

  if (support.lcp) {
    watch('largest-contentful-paint', (e) => {
      v.lcp = e.renderTime || e.loadTime || e.startTime;
      v.lcpSize = e.size;
      v.lcpUrl = e.url || '';
    });
  }

  if (support.paint) {
    watch('paint', (e) => { if (e.name === 'first-contentful-paint') v.fcp = e.startTime; });
  }

  if (support.cls) {
    // Spec session windows: a shift joins the current session if it is within
    // 1s of the previous shift and the session is under 5s old; CLS is the
    // largest session. Σ of all shifts is kept separately and labelled as such.
    let sessionValue = 0, sessionStart = 0, prevT = 0;
    watch('layout-shift', (e) => {
      if (e.hadRecentInput) return;
      v.clsShifts++;
      v.clsSum += e.value;
      if (prevT && e.startTime - prevT < 1000 && e.startTime - sessionStart < 5000) {
        sessionValue += e.value;
      } else {
        sessionValue = e.value;
        sessionStart = e.startTime;
      }
      prevT = e.startTime;
      if (sessionValue > v.cls) {
        v.cls = sessionValue;
        const node = e.sources && e.sources[0] && e.sources[0].node;
        v.clsWorstNode = node && node.tagName ? node.tagName.toLowerCase() : '';
      }
    });
  }

  if (support.event) {
    // INP≈: max duration per interactionId, p98 over performance.interactionCount.
    // Event Timing rounds durations to 8ms, so integers only. This session's
    // number, not the field 75th percentile — labelled "≈" in the HUD.
    const byId = new Map();
    watch('event', (e) => {
      if (!e.interactionId) return;
      const prev = byId.get(e.interactionId) || 0;
      if (e.duration > prev) byId.set(e.interactionId, e.duration);
      v.lastInteraction = {
        name: e.name,
        duration: e.duration,
        startTime: e.startTime,
        // The keystroke that opened the HUD lands just before openedAt and
        // includes mounting the overlay — flagged so the first sample is honest.
        hudOpen: e.startTime <= openedAt && e.startTime > openedAt - 300,
      };
      const vals = [...byId.values()].sort((a, b) => b - a);
      const n = performance.interactionCount || vals.length;
      v.inp = vals[Math.min(Math.floor(n / 50), vals.length - 1)];
      v.inpN = vals.length;
    }, { durationThreshold: 16 });
  }

  if (support.longtask) {
    // Attribution is always "window" in a single-bundle SPA — not shown.
    watch('longtask', (e) => {
      v.longCount++;
      v.longLast = e.duration;
      v.longBlocking += Math.max(0, e.duration - 50);
      if (e.startTime >= openedAt) v.longSinceOpen++;
    });
  }

  if (support.resource && onResource) {
    watch('resource', (e) => onResource(e));
  }

  return () => { for (const po of obs) po.disconnect(); };
}
