// The press. Turns a visitor's photo into the four inks entirely in the browser:
// grey → contrast stretch → one of four screens. The original never leaves the
// tab except as a 512 px copy sent once to the content screen at publish time.
//
// Same maths as the concept's process-photo.cjs: duotone thresholds around
// .34/.62/.78 of the stretched luminance, halftone cell 6 at −22°, cut-out at .55.
import { INKS } from './doc.js';

const MAX_SIDE = 600;       // processed image, board-facing
const MODERATION_SIDE = 512; // what the screen sees
const JPEG_Q = 0.82;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL = { ink: hex(INKS.ink), red: hex(INKS.red), ochre: hex(INKS.ochre), cream: hex(INKS.cream) };

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

function fit(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function draw(bitmap, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { c, ctx };
}

// Stretched luminance 0..1 for every pixel.
function luminance(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  let lo = 255, hi = 0;
  for (let i = 0; i < w * h; i++) {
    const l = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    lum[i] = l; if (l < lo) lo = l; if (l > hi) hi = l;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < w * h; i++) lum[i] = (lum[i] - lo) / span;
  return lum;
}

// `t` (0..1) slides every threshold together — the inspector's THRESHOLD knob.
function thresholds(t) {
  const k = (t - 0.55) * 0.5; // ±0.22 range
  return { shadow: 0.34 + k, mid: 0.62 + k, light: 0.78 + k };
}

export function applyScreen(ctx, w, h, lum, screen, t) {
  const th = thresholds(t);
  const out = ctx.createImageData(w, h);
  const o = out.data;
  const put = (i, col, a = 255) => { o[i * 4] = col[0]; o[i * 4 + 1] = col[1]; o[i * 4 + 2] = col[2]; o[i * 4 + 3] = a; };
  if (screen === 'duotone') {
    for (let i = 0; i < w * h; i++) {
      const v = Math.pow(lum[i], 0.9);
      put(i, v < th.shadow ? PAL.ink : v < th.mid ? PAL.red : v < th.light ? PAL.ochre : PAL.cream);
    }
    ctx.putImageData(out, 0, 0);
  } else if (screen === 'poster') {
    // two inks only — ink on cream — the flattest, most Rodchenko cut
    for (let i = 0; i < w * h; i++) put(i, lum[i] < th.mid ? PAL.ink : PAL.cream);
    ctx.putImageData(out, 0, 0);
  } else if (screen === 'cutout') {
    // silhouette: dark pixels in ink, everything else transparent — for layering
    for (let i = 0; i < w * h; i++) put(i, PAL.ink, lum[i] < th.mid ? 255 : 0);
    ctx.putImageData(out, 0, 0);
  } else if (screen === 'halftone') {
    ctx.fillStyle = INKS.cream; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = INKS.ink;
    const cell = Math.max(4, Math.round(w / 90));
    const ang = (-22 * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const gain = 0.62 + (0.55 - t) * 0.5;
    for (let gy = -h; gy < h * 2; gy += cell) {
      for (let gx = -w; gx < w * 2; gx += cell) {
        const x = gx * ca - gy * sa, y = gx * sa + gy * ca;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const l = lum[Math.floor(y) * w + Math.floor(x)];
        const r = (1 - l) * cell * gain;
        if (r > 0.35) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // Anti-aliased dot edges are hundreds of greys — snap every pixel back to
    // the two inks. Truer to print, and the PNG shrinks 3–5×.
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < w * h; i++) {
      const dark = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) < 128;
      const col = dark ? PAL.ink : PAL.cream;
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
}

// Prepares a photo once: returns the moderation copy + a luminance buffer the
// screens re-use, so moving the threshold knob never re-decodes the file.
export async function preparePhoto(file) {
  if (!/^image\//.test(file.type)) throw new Error('That is not an image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That photo is over 25 MB.');
  const bmp = await loadBitmap(file);
  const bw = bmp.width || bmp.naturalWidth, bh = bmp.height || bmp.naturalHeight;
  const big = fit(bw, bh, MAX_SIDE);
  const { c, ctx } = draw(bmp, big.w, big.h);
  const lum = luminance(ctx, big.w, big.h);
  const mod = fit(bw, bh, MODERATION_SIDE);
  const m = draw(bmp, mod.w, mod.h);
  const original = m.c.toDataURL('image/jpeg', JPEG_Q);
  if (bmp.close) bmp.close();
  return { w: big.w, h: big.h, lum, work: c, original };
}

// Runs one screen over a prepared photo → processed PNG data URL for the layer.
export function screenPhoto(prep, screen = 'duotone', threshold = 0.55) {
  const ctx = prep.work.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, prep.w, prep.h);
  applyScreen(ctx, prep.w, prep.h, prep.lum, screen, threshold);
  return { src: prep.work.toDataURL('image/png'), iw: prep.w, ih: prep.h };
}
