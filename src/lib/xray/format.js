// Formatters and grading for the HUD. Colour is only ever a grade: ochre for
// "needs improvement", red for "poor", per web.dev's Core Web Vitals bands (and
// Lighthouse's TBT bands). Facts — bytes, counts, spring values — never get a tone.

export const BANDS = {
  lcp: [2500, 4000],
  fcp: [1800, 3000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  ttfb: [800, 1800],
  tbt: [200, 600],
  frameP95: [20, 33],
};

export const tone = (v, [good, poor]) =>
  v == null || Number.isNaN(v) ? 'na' : v <= good ? 'ok' : v <= poor ? 'warn' : 'poor';

export const fpsTone = (avg, hz) =>
  !hz || !avg ? 'na' : avg >= 0.9 * hz ? 'ok' : avg >= 0.6 * hz ? 'warn' : 'poor';

export const longTone = (n) => (n === 0 ? 'ok' : n <= 5 ? 'warn' : 'poor');

export const fmtMs = (v, dp = 0) => (v == null ? 'n/a' : `${v.toFixed(dp)} ms`);
export const fmtS = (ms, dp = 2) => (ms == null ? 'n/a' : `${(ms / 1000).toFixed(dp)} s`);
// kB = 1000 bytes — stated in the methodology note. One decimal below 100 kB, whole
// numbers above so "464 kB → 464 kB" stays on one line in the panel.
export const fmtKB = (b) => (b == null ? 'n/a' : b >= 100_000 ? `${Math.round(b / 1000)} kB` : `${(b / 1000).toFixed(1)} kB`);
export const fmtNum = (v, dp = 2) => (v == null || Number.isNaN(v) ? 'n/a' : v.toFixed(dp));
export const fmtSigned = (v, dp = 2) => (v == null ? 'n/a' : `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(dp)}`);
export const fmtInt = (v) => (v == null ? 'n/a' : String(Math.round(v)));
export const fmtCount = (v) => (v == null ? 'n/a' : v.toLocaleString('en-US'));

// ζ = c / (2·√(k·m)); > 1 is overdamped (no oscillation), < 1 underdamped.
export const springZeta = ({ stiffness, damping, mass = 1 }) => damping / (2 * Math.sqrt(stiffness * mass));
export const springLabel = (s) => {
  if (!s) return '';
  const z = springZeta(s);
  const kind = z > 1.02 ? 'overdamped' : z < 0.98 ? 'underdamped' : 'critical';
  return `k${s.stiffness} d${s.damping} m${s.mass ?? 1} · ζ≈${z.toFixed(2)} ${kind}`;
};

// Camera readout for the strip's right cap.
export const fmtCamera = (c) => {
  if (!c) return '';
  if (c.z === undefined) return `y ${fmtSigned(-c.y, 0)}vh`;
  return `z ${fmtSigned(-c.z, 0)} · rx ${fmtSigned(c.tilt, 1)}°`;
};

// Which hold/zone a progress value sits in, for a registered timeline.
export function segmentAt(p, timeline) {
  if (!timeline) return null;
  for (let i = 0; i < timeline.zones.length; i++) {
    const [a, b] = timeline.zones[i];
    if (p >= a && p < b) return { kind: 'zone', index: i, label: `ZONE Z${i + 1}`, range: [a, b] };
  }
  for (let i = 0; i < timeline.holds.length; i++) {
    const [a, b] = timeline.holds[i];
    if (p >= a && (p < b || (i === timeline.holds.length - 1 && p <= b))) {
      return { kind: 'hold', index: i, label: `HOLD ${timeline.acts[i]}`, range: [a, b] };
    }
  }
  return null;
}
