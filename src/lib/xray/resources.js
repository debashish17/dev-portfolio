// Payload and navigation facts from Resource Timing. Computed once when the HUD
// opens and again only when a new same-origin resource lands (rare).
//
// decodedBodySize should equal `ls -l dist`; encodedBodySize is what crossed
// the wire; transferSize 0 with a non-zero body means the cache served it.
// Cross-origin sizes are only visible when the server sends
// Timing-Allow-Origin — Google Fonts does, but we detect rather than assume.

const isFontUrl = (u) => /fonts\.gstatic\.com|fonts\.googleapis\.com|\.woff2?(\?|$)/.test(u);

export function summarizeResources() {
  const origin = location.origin;
  const mk = () => ({ n: 0, decoded: 0, encoded: 0, transfer: 0, cached: false });
  const js = mk(), css = mk(), other = mk();
  const fonts = { n: 0, decoded: 0, encoded: 0, tao: true, doneAt: 0 };

  for (const e of performance.getEntriesByType('resource')) {
    let sameOrigin = false;
    try { sameOrigin = new URL(e.name).origin === origin; } catch { /* opaque */ }

    if (isFontUrl(e.name)) {
      fonts.n++;
      fonts.decoded += e.decodedBodySize || 0;
      fonts.encoded += e.encodedBodySize || 0;
      if (!e.encodedBodySize && !e.transferSize && !e.decodedBodySize) fonts.tao = false;
      fonts.doneAt = Math.max(fonts.doneAt, e.responseEnd || 0);
      continue;
    }
    if (!sameOrigin) { other.n++; other.encoded += e.encodedBodySize || 0; continue; }

    const isJs = e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name);
    const isCss = e.initiatorType === 'css' || e.initiatorType === 'link' || /\.css(\?|$)/.test(e.name);
    const bucket = isJs ? js : isCss ? css : other;
    bucket.n++;
    bucket.decoded += e.decodedBodySize || 0;
    bucket.encoded += e.encodedBodySize || 0;
    bucket.transfer += e.transferSize || 0;
    if (e.transferSize === 0 && (e.decodedBodySize || 0) > 0) bucket.cached = true;
  }

  const nav = performance.getEntriesByType('navigation')[0];
  const navigation = nav
    ? {
        type: nav.type,                                   // navigate | reload | back_forward
        ttfb: nav.responseStart,                          // CWV definition: from navigation start
        server: nav.responseStart - nav.requestStart,     // request sent → first byte
        dcl: nav.domContentLoadedEventEnd || null,
        load: nav.loadEventEnd || null,                   // 0 until the load event fires
        html: nav.transferSize || 0,
      }
    : null;

  return { js, css, fonts, other, navigation };
}
