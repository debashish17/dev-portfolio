// Frame-sequence loader for the staircase hero.
//
// 265 WebP frames, ~9 KB each, 2.4 MB total. They are fetched in a coarse-to-
// fine order rather than 0..264, so the whole flight is roughly scrubbable
// after the first couple of dozen images instead of only the opening seconds.
// Until a given frame has arrived we draw the nearest one that has.

import { FRAME_COUNT } from './camera.js';

const PATH = (i) => `/hero/frames/f_${String(i).padStart(4, '0')}.webp`;

export const POSTER_SRC = PATH(0);

// 0, then every 32nd, 16th, 8th... so early scrubbing lands within a frame or
// two of the truth anywhere in the sequence.
function loadOrder() {
  const seen = new Uint8Array(FRAME_COUNT);
  const order = [];
  const push = (i) => { if (i < FRAME_COUNT && !seen[i]) { seen[i] = 1; order.push(i); } };
  push(0);
  push(FRAME_COUNT - 1);
  for (let stride = 32; stride >= 1; stride = Math.floor(stride / 2)) {
    for (let i = 0; i < FRAME_COUNT; i += stride) push(i);
    if (stride === 1) break;
  }
  return order;
}

export function createFrameLoader({ concurrency = 6, onProgress } = {}) {
  const images = new Array(FRAME_COUNT).fill(null);
  const ready = new Uint8Array(FRAME_COUNT);
  let loaded = 0;
  let cancelled = false;

  const order = loadOrder();
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
        if (onProgress) onProgress(loaded / FRAME_COUNT);
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
    get progress() { return loaded / FRAME_COUNT; },
    destroy() {
      cancelled = true;
      for (const img of images) if (img) img.src = '';
    },
  };
}
