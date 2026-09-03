// Frame timing, measured from Motion's own frame loop but timed with the frame
// timestamp deltas — never Motion's `delta` argument, which motion-dom clamps to
// 1–40ms so springs don't explode after a stall (a 200ms jank would read as 40).
// Pure JS: the HUD calls tick() once per frame and diff-writes the fields.

const RATES = [30, 50, 60, 75, 90, 120, 144, 165, 240];
const N = 120; // 2s at 60Hz, 1s at 120Hz — holds a whole spring settle tail

export function createFrameMeter() {
  const ring = new Float32Array(N);
  const stamps = new Float64Array(N);
  const scratch = new Float32Array(N);
  let head = 0, count = 0;
  let lastT = 0, skip = 2;
  let ema = 1000 / 60;
  let refreshMs = 0, sinceRefresh = 0;
  let dropped = 0, long = 0;
  let motionEma = 0, hudEma = 0;

  const estimateRefresh = () => {
    // Non-dropped frames cluster at the vsync interval; the 20th percentile is
    // robust to jank and to a rate change when the window moves monitors.
    for (let i = 0; i < count; i++) scratch[i] = ring[i];
    const sorted = scratch.subarray(0, count).sort();
    const p20 = sorted[Math.floor(count * 0.2)];
    if (!p20) return 0;
    const hz = 1000 / p20;
    let best = 0, bestErr = Infinity;
    for (const r of RATES) { const err = Math.abs(hz - r) / r; if (err < bestErr) { bestErr = err; best = r; } }
    return bestErr <= 0.06 ? 1000 / best : p20;
  };

  const m = {
    fps: 0, avg1s: 0, frameMs: 0, worstMs: 0, refreshHz: 0, refreshSnapped: false,
    dropped: 0, long: 0, droppedLast1s: 0, longLast1s: 0,
    motionMs: 0, hudMs: 0, samples: 0,

    reset() {
      head = 0; count = 0; lastT = 0; skip = 2; ema = 1000 / 60;
      refreshMs = 0; sinceRefresh = 0; dropped = 0; long = 0;
      m.fps = 0; m.avg1s = 0; m.frameMs = 0; m.worstMs = 0; m.refreshHz = 0;
      m.dropped = 0; m.long = 0; m.droppedLast1s = 0; m.longLast1s = 0; m.samples = 0;
    },
    // Tab hidden: rAF stops; on resume the first delta would be seconds long.
    pause() { lastT = 0; skip = 2; },

    tick(t, motionCost = 0, hudCost = 0) {
      if (lastT === 0) { lastT = t; return; }
      const dt = t - lastT;
      lastT = t;
      if (skip > 0) { skip--; return; }
      if (dt <= 0) return;

      ring[head] = dt; stamps[head] = t;
      head = (head + 1) % N;
      if (count < N) count++;

      ema += 0.1 * (dt - ema);
      if (++sinceRefresh >= 30 && count >= 30) { sinceRefresh = 0; refreshMs = estimateRefresh(); }
      if (refreshMs && dt > 1.5 * refreshMs) dropped += Math.max(1, Math.round(dt / refreshMs) - 1);
      if (dt > 50) long++;

      let n = 0, sum = 0, d1 = 0, l1 = 0, worst = 0;
      for (let i = 0; i < count; i++) {
        const f = ring[i];
        if (f > worst) worst = f;
        if (t - stamps[i] <= 1000) {
          n++; sum += f;
          if (refreshMs && f > 1.5 * refreshMs) d1++;
          if (f > 50) l1++;
        }
      }

      motionEma += 0.1 * (motionCost - motionEma);
      hudEma += 0.1 * (hudCost - hudEma);

      m.fps = Math.round(1000 / ema);
      m.avg1s = n ? 1000 / (sum / n) : 0;
      m.frameMs = dt;
      m.worstMs = worst;
      m.refreshHz = refreshMs ? Math.round(1000 / refreshMs) : 0;
      m.refreshSnapped = refreshMs ? RATES.includes(Math.round(1000 / refreshMs)) : false;
      m.dropped = dropped; m.long = long;
      m.droppedLast1s = d1; m.longLast1s = l1;
      m.motionMs = motionEma; m.hudMs = hudEma;
      m.samples = count;
    },

    // Copies the ring oldest→newest into `out`; returns how many were written.
    spark(out) {
      const n = Math.min(count, out.length);
      const start = (head - n + N) % N;
      for (let i = 0; i < n; i++) out[i] = ring[(start + i) % N];
      return n;
    },
  };
  return m;
}
