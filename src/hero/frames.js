// Frame-sequence loader for the staircase hero.
//
// Desktop pulls all 265 frames at 1440 wide, ~2.2 MB. Phones pull a lighter
// sequence: 1080 wide and every SECOND frame, ~1.0 MB.
//
// Those two levers are not equally priced. Resolution is the weak one — a
// quarter of the pixels still costs 40% of the bytes, because WebP on flat
// art spends itself on edges, not area, and below 1080 the thin cream
// keylines between steps start to break up, which is the detail the whole
// render is made of. Halving the COUNT costs nothing visible: the phone
// scrolls 340vh, so even at 133 frames the image changes every ~16 px of
// scroll. So the phone set drops a lot of frames and only a little detail.
//
// The files keep their ORIGINAL index (f_0000, f_0002, … f_0264), so the two
// sets share one index space and nothing downstream — the camera, the card
// projection — has to know which one is loaded.
//
// Either way they are fetched coarse-to-fine rather than 0..264, so the whole
// flight is roughly scrubbable after the first couple of dozen images instead
// of only the opening seconds. Until a given frame arrives we draw the
// nearest one that has.

import { FRAME_COUNT } from './camera.js';

// 760 matches the layout branch in Staircase.jsx, so the set and the geometry
// always agree about what counts as a phone.
const PHONE_MAX = 760;
const FULL = { dir: '/hero/frames', step: 1 };
const PHONE = { dir: '/hero/frames-m', step: 2 };

function pickSet() {
  if (typeof window === 'undefined') return FULL;
  return window.innerWidth < PHONE_MAX ? PHONE : FULL;
}

const pathIn = (set) => (i) => `${set.dir}/f_${String(i).padStart(4, '0')}.webp`;

export const POSTER_SRC = pathIn(pickSet())(0);

// 0, then every 32nd, 16th, 8th... so early scrubbing lands within a frame or
// two of the truth anywhere in the sequence. Snapped to the set's stride, so
// a phone never asks for a frame that was not generated.
function loadOrder(step) {
  const seen = new Uint8Array(FRAME_COUNT);
  const order = [];
  const snap = (i) => Math.min(FRAME_COUNT - 1, Math.round(i / step) * step);
  const push = (i) => { const j = snap(i); if (j < FRAME_COUNT && !seen[j]) { seen[j] = 1; order.push(j); } };
  push(0);
  push(FRAME_COUNT - 1);
  for (let stride = 32; stride >= step; stride = Math.floor(stride / 2)) {
    for (let i = 0; i < FRAME_COUNT; i += stride) push(i);
    if (stride === step) break;
  }
  return order;
}

export function createFrameLoader({ concurrency = 6, onProgress } = {}) {
  const set = pickSet();
  const PATH = pathIn(set);
  const images = new Array(FRAME_COUNT).fill(null);
  const ready = new Uint8Array(FRAME_COUNT);
  let loaded = 0;
  let cancelled = false;

  const order = loadOrder(set.step);
  const total = order.length;
  let cursor = 0;

  function pump() {
    while (!cancelled && cursor < order.length) {
      const i = order[cursor++];
      const img = new Image();
      img.decoding = 'async';
      img.src = PATH(i);
      images[i] = img;
      const done = () => {
        if (cancelled) return;
        ready[i] = 1;
        loaded++;
        if (onProgress) onProgress(loaded / total);
        pump();
      };
      // A failed frame still counts as settled: one missing image must not
      // stall the queue behind it.
      img.decode ? img.decode().then(done, done) : (img.onload = done, img.onerror = done);
      return;
    }
  }

  for (let n = 0; n < concurrency; n++) pump();

  return {
    // Index of the nearest loaded frame to i, searching outward; -1 before the
    // very first image has decoded. Callers need the INDEX, not just the image:
    // the card overlay has to be positioned from the frame actually painted,
    // or the type sits on a card the canvas is not currently showing.
    nearestIndex(i) {
      if (ready[i]) return i;
      for (let d = 1; d < FRAME_COUNT; d++) {
        if (i - d >= 0 && ready[i - d]) return i - d;
        if (i + d < FRAME_COUNT && ready[i + d]) return i + d;
      }
      return -1;
    },
    at: (i) => (i >= 0 && ready[i] ? images[i] : null),
    isReady: (i) => Boolean(ready[i]),
    get progress() { return loaded / total; },
    destroy() {
      cancelled = true;
      for (const img of images) if (img) img.src = '';
    },
  };
}
