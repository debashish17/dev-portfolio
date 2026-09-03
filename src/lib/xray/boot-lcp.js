// Records every LCP candidate WITH its element descriptor at delivery time.
//
// The x-ray HUD mounts long after the intro loader has unmounted, and a buffered
// observer created that late gets entry.element === null for any node that has
// since been detached — so it could report the LCP time but not what it was.
// This collector is the one always-on exception to "zero cost when off": one
// observer, no per-frame work. It disconnects on first input, which is exactly
// when the browser stops issuing LCP entries anyway.

export const lcpCandidates = [];
export const lcpMeta = { firstInputAt: null, hiddenAt: null };

try {
  const types = (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes) || [];
  if (types.includes('largest-contentful-paint')) {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const el = e.element;
        lcpCandidates.push({
          t: e.renderTime || e.loadTime || e.startTime,
          size: e.size,
          url: e.url || '',
          tag: el ? el.tagName : null,
          className: el && typeof el.className === 'string' ? el.className : '',
          text: el ? (el.textContent || '').trim().slice(0, 24) : '',
        });
      }
    });
    po.observe({ type: 'largest-contentful-paint', buffered: true });
    const stop = () => {
      if (lcpMeta.firstInputAt == null) lcpMeta.firstInputAt = performance.now();
      po.disconnect();
    };
    addEventListener('pointerdown', stop, { once: true, capture: true });
    addEventListener('keydown', stop, { once: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && lcpMeta.hiddenAt == null) lcpMeta.hiddenAt = performance.now();
  });
} catch {
  // Measurement is optional; never let it break the app.
}
