// Canvas 2D renderer for poster documents. One function draws the editor, the
// exported PNG, the wall thumbnail and the share card, so they never disagree.
//
// Depth devices are all here: MULTIPLY overprint (globalCompositeOperation),
// PLATE SHIFT (a red copy drawn under the shape, off register), KEY LINE (cream
// stroke), PROUN extrusion (two skewed faces behind a bar or triangle), rays as
// a fan of triangles clipped to the layer box, grain as a cached noise pattern.
import { INKS, BOARD_W, BOARD_H } from './doc.js';

const DISPLAY_FONT = '"Archivo Black", "Arial Black", Impact, sans-serif';

// ------------------------------------------------------------------ images
const imageCache = new Map(); // src → HTMLImageElement (decoded)

export async function ensureImages(doc) {
  const jobs = [];
  for (const l of doc.layers) {
    if (l.type !== 'image' || !l.src || imageCache.has(l.src)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = l.src;
    imageCache.set(l.src, img);
    jobs.push(img.decode().catch(() => { imageCache.delete(l.src); }));
  }
  if (jobs.length) await Promise.all(jobs);
}

export async function ensureFonts() {
  if (!document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`900 100px "Archivo Black"`),
      document.fonts.load(`italic 900 100px "Bodoni Moda"`),
      document.fonts.load(`700 100px "JetBrains Mono"`),
    ]);
  } catch { /* fall back to system fonts */ }
}

// ------------------------------------------------------------------ paths
// All paths are built in layer-local space: origin at the layer's top-left,
// size w×h, before rotation. Callers translate/rotate the context first.
function shapePath(ctx, l, w, h) {
  ctx.beginPath();
  switch (l.type) {
    case 'disc':
    case 'image_disc':
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'wedge':
      ctx.moveTo(0, h);
      ctx.ellipse(w / 2, h, w / 2, h, 0, Math.PI, 0, false);
      ctx.closePath();
      break;
    case 'tri':
      ctx.moveTo(w / 2, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      break;
    case 'pen':
      l.points.forEach(([px, py], i) => (i ? ctx.lineTo(px * w, py * h) : ctx.moveTo(px * w, py * h)));
      ctx.closePath();
      break;
    case 'bar':
    default:
      ctx.rect(0, 0, w, h);
  }
}

function maskPath(ctx, l, w, h) {
  if (l.mask === 'disc') return shapePath(ctx, { type: 'disc' }, w, h);
  if (l.mask === 'wedge') return shapePath(ctx, { type: 'wedge' }, w, h);
  if (l.mask === 'tri') return shapePath(ctx, { type: 'tri' }, w, h);
  return shapePath(ctx, { type: 'bar' }, w, h);
}

function raysPath(ctx, l, w, h) {
  const ox = l.origin.endsWith('r') ? w : 0;
  const oy = l.origin.startsWith('b') ? h : 0;
  // Sweep the quadrant that points into the box.
  const start = l.origin === 'br' ? Math.PI : l.origin === 'bl' ? Math.PI * 1.5 : l.origin === 'tr' ? Math.PI * 0.5 : 0;
  const R = Math.hypot(w, h) * 1.2;
  const step = (Math.PI / 2) / l.count;
  ctx.beginPath();
  for (let i = 0; i < l.count; i++) {
    const a0 = start + i * step;
    const a1 = a0 + step * l.duty;
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(a0) * R, oy + Math.sin(a0) * R);
    ctx.lineTo(ox + Math.cos(a1) * R, oy + Math.sin(a1) * R);
    ctx.closePath();
  }
}

// ------------------------------------------------------------------ grain
const grainCache = new Map();
function grainPattern(ctx, S) {
  const key = Math.round(S * 4);
  if (grainCache.has(key)) return grainCache.get(key);
  const c = document.createElement('canvas');
  const n = 96;
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  let seed = 7;
  for (let i = 0; i < n * n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const v = (seed >>> 16) & 255;
    const a = v > 200 ? 42 : v > 170 ? 18 : 0;
    img.data[i * 4] = 26; img.data[i * 4 + 1] = 23; img.data[i * 4 + 2] = 20; img.data[i * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  const pat = ctx.createPattern(c, 'repeat');
  grainCache.set(key, pat);
  return pat;
}

// ------------------------------------------------------------------ word metrics
export function measureWord(text, h) {
  const c = measureWord._c || (measureWord._c = document.createElement('canvas'));
  const g = c.getContext('2d');
  g.font = `900 ${h}px ${DISPLAY_FONT}`;
  return Math.ceil(g.measureText(text).width * 0.98);
}

// ------------------------------------------------------------------ layers
function fillShape(ctx, l, w, h, color) {
  if (l.type === 'rays') raysPath(ctx, l, w, h);
  else shapePath(ctx, l, w, h);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawExtrusion(ctx, l, w, h, S) {
  const dx = l.extrude.dx * S, dy = l.extrude.dy * S;
  const top = l.ink === 'ochre' ? INKS.cream : INKS.ochre;
  const side = l.ink === 'ink' ? INKS.red : INKS.ink;
  ctx.fillStyle = top;
  ctx.beginPath();
  if (l.type === 'tri') {
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2 + dx, dy); ctx.lineTo(w + dx, h + dy); ctx.lineTo(w, h); ctx.closePath();
  } else {
    ctx.moveTo(0, 0); ctx.lineTo(dx, dy); ctx.lineTo(w + dx, dy); ctx.lineTo(w, 0); ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.moveTo(w, 0); ctx.lineTo(w + dx, dy); ctx.lineTo(w + dx, h + dy); ctx.lineTo(w, h); ctx.closePath();
  ctx.fill();
}

function drawWord(ctx, l, S, color, offX = 0, offY = 0) {
  ctx.font = `900 ${l.h * S}px ${DISPLAY_FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  // Cap height ≈ 0.72em for Archivo Black — baseline sits so caps fill the box.
  ctx.fillText(l.text, offX, l.h * S * 0.9 + offY);
}

function drawImageLayer(ctx, l, w, h, S) {
  const img = imageCache.get(l.src);
  ctx.save();
  maskPath(ctx, l, w, h);
  ctx.clip();
  if (img && img.naturalWidth) {
    // cover-fit, anchored to the top third (faces live there)
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) * 0.25, dw, dh);
  } else {
    ctx.fillStyle = INKS.paper;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  if (l.keyline) {
    maskPath(ctx, l, w, h);
    ctx.lineWidth = 3 * S;
    ctx.strokeStyle = INKS.cream;
    ctx.stroke();
  }
}

function drawLayer(ctx, l, S) {
  const w = l.w * S, h = l.h * S;
  ctx.save();
  ctx.globalAlpha = l.opacity ?? 1;
  if (l.multiply) ctx.globalCompositeOperation = 'multiply';
  ctx.translate((l.x + l.w / 2) * S, (l.y + l.h / 2) * S);
  ctx.rotate((l.rot * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);

  const color = INKS[l.ink] || INKS.ink;

  if (l.type === 'image') { drawImageLayer(ctx, l, w, h, S); ctx.restore(); return; }

  // plate shift — the second ink printed off register, under the first
  if (l.shift > 0) {
    const shiftColor = l.ink === 'red' ? INKS.ink : INKS.red;
    ctx.save();
    ctx.translate(l.shift * S, -l.shift * 0.66 * S);
    if (l.type === 'word') drawWord(ctx, l, S, shiftColor);
    else if (l.type === 'ring') { shapePath(ctx, { type: 'disc' }, w, h); ctx.lineWidth = l.thick * S; ctx.strokeStyle = shiftColor; ctx.stroke(); }
    else fillShape(ctx, l, w, h, shiftColor);
    ctx.restore();
  }

  if (l.extrude && (l.type === 'bar' || l.type === 'tri')) drawExtrusion(ctx, l, w, h, S);

  if (l.type === 'word') drawWord(ctx, l, S, color);
  else if (l.type === 'ring') {
    ctx.beginPath();
    const t = Math.min(l.thick * S, Math.min(w, h) / 2);
    ctx.ellipse(w / 2, h / 2, w / 2 - t / 2, h / 2 - t / 2, 0, 0, Math.PI * 2);
    ctx.lineWidth = t;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else fillShape(ctx, l, w, h, color);

  if (l.keyline && l.type !== 'word' && l.type !== 'rays') {
    if (l.type === 'ring') { ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); }
    else shapePath(ctx, l, w, h);
    ctx.lineWidth = 3 * S;
    ctx.strokeStyle = INKS.cream;
    ctx.globalCompositeOperation = 'source-over';
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ poster
// Draws `doc` into ctx with the board's top-left at (0,0), S px per board unit.
export function drawPoster(ctx, doc, S) {
  const W = BOARD_W * S, H = BOARD_H * S;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.fillStyle = INKS[doc.paper] || INKS.paper;
  ctx.fillRect(0, 0, W, H);
  for (const l of doc.layers) drawLayer(ctx, l, S);
  if (doc.grain) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = grainPattern(ctx, S);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// Renders the poster to a fresh canvas. `px` is the output width in pixels.
export async function renderPosterCanvas(doc, px = 1200) {
  await Promise.all([ensureImages(doc), ensureFonts()]);
  const S = px / BOARD_W;
  const c = document.createElement('canvas');
  c.width = Math.round(BOARD_W * S); c.height = Math.round(BOARD_H * S);
  drawPoster(c.getContext('2d'), doc, S);
  return c;
}

export const canvasToBlob = (c, type = 'image/png', quality) =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, quality));

export const blobToDataUrl = (blob) =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

// ------------------------------------------------------------------ share card
// 1200×630 Open Graph image: ink field, the poster at 360×480 with a cream
// border and red shadow, and the number set in Bodoni — same as the site.
export async function renderShareCard(doc, meta) {
  await Promise.all([ensureImages(doc), ensureFonts()]);
  const W = 1200, H = 630;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = INKS.cream; ctx.fillRect(0, 0, W, H);
  // grid
  ctx.strokeStyle = 'rgba(10,10,10,0.08)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 80) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  ctx.fillStyle = INKS.ink; ctx.fillRect(0, 0, 520, H);
  ctx.fillStyle = INKS.red; ctx.beginPath(); ctx.arc(1200, 10, 140, 0, Math.PI * 2); ctx.fill();

  // poster
  const px = 80, py = 75, pw = 360, ph = 480;
  ctx.fillStyle = INKS.red; ctx.fillRect(px + 12, py + 12, pw, ph);
  ctx.fillStyle = INKS.cream; ctx.fillRect(px - 3, py - 3, pw + 6, ph + 6);
  ctx.save(); ctx.translate(px, py); drawPoster(ctx, doc, pw / BOARD_W); ctx.restore();

  // copy
  const left = 600;
  ctx.fillStyle = INKS.red;
  ctx.font = `700 13px Archivo, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(spaced('MADE IN THE STUDIO · DIBYADEBASHISH.COM'), left, 108);
  ctx.fillStyle = INKS.ink;
  ctx.font = `900 76px ${DISPLAY_FONT}`;
  ctx.fillText('POSTER', left - 2, 178);
  ctx.font = `italic 900 84px "Bodoni Moda", Didot, "Times New Roman", serif`;
  const num = `№ ${meta.number ?? meta.id ?? ''}`;
  ctx.fillText(num, left, 262);
  const nw = ctx.measureText(num).width;
  ctx.fillStyle = INKS.red; ctx.fillRect(left + nw + 10, 246, 16, 16);
  ctx.fillStyle = 'rgba(26,23,20,0.65)';
  ctx.font = `500 12px "JetBrains Mono", "Courier New", monospace`;
  const stats = [`SEED ${doc.seed}`, `${doc.layers.length} LAYERS`, meta.photos ? `${meta.photos} PHOTO${meta.photos > 1 ? 'S' : ''}` : null, meta.likes != null ? `● ${meta.likes} LIKES` : null].filter(Boolean).join(' · ');
  ctx.fillText(spaced(stats, 1), left, 300);
  ctx.fillStyle = INKS.ink;
  ctx.font = `400 17px Archivo, "Helvetica Neue", Arial, sans-serif`;
  wrapText(ctx, 'A visitor composed this in the site\'s own language — four inks, an 80 px grid, springs on every drag. Like it, or remix it into your own.', left, 340, 470, 26);
  // buttons
  ctx.fillStyle = INKS.ink; ctx.fillRect(left + 5, 425, 150, 48);
  ctx.fillStyle = INKS.red; ctx.fillRect(left, 420, 150, 48);
  ctx.fillStyle = INKS.cream; ctx.font = `700 13px "JetBrains Mono", monospace`; ctx.fillText('● LIKE IT', left + 30, 450);
  ctx.fillStyle = INKS.red; ctx.fillRect(left + 175, 425, 160, 48);
  ctx.fillStyle = INKS.ink; ctx.fillRect(left + 170, 420, 160, 48);
  ctx.fillStyle = INKS.cream; ctx.fillText('REMIX IT →', left + 196, 450);
  ctx.fillStyle = 'rgba(26,23,20,0.6)'; ctx.font = `500 12px "JetBrains Mono", monospace`;
  ctx.fillText(`/p/${meta.id || ''}`, left + 350, 450);
  // logo
  drawLogo(ctx, 1000, 545, 36);
  ctx.fillStyle = INKS.ink; ctx.font = `900 16px ${DISPLAY_FONT}`; ctx.fillText('D.D.B', 1048, 552);
  ctx.fillStyle = 'rgba(26,23,20,0.6)'; ctx.font = `500 9px "JetBrains Mono", monospace`; ctx.fillText(spaced('FOLIO 2026 · STUDIO'), 1048, 566);
  return c;
}

function spaced(s, n = 2) { return s.split('').join(' '.repeat(n)); }
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}
function drawLogo(ctx, x, y, size) {
  const r = size / 2;
  ctx.save(); ctx.translate(x + r, y + r);
  ctx.fillStyle = INKS.red; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INKS.ink; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 0.9, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
  ctx.rotate((-22 * Math.PI) / 180); ctx.fillRect(-r * 0.8, -r * 0.08, r * 1.6, r * 0.16); ctx.rotate((22 * Math.PI) / 180);
  ctx.fillStyle = INKS.cream; ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ hit test
// Inverse-transforms a board point into layer space and checks the box.
export function hitLayer(doc, bx, by) {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
    const a = (-l.rot * Math.PI) / 180;
    const dx = bx - cx, dy = by - cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a) + l.w / 2;
    const ly = dx * Math.sin(a) + dy * Math.cos(a) + l.h / 2;
    const pad = 4;
    if (lx >= -pad && ly >= -pad && lx <= l.w + pad && ly <= l.h + pad) {
      // full-bleed fields would swallow every click — only grab them on their own edge band
      if (l.type === 'bar' && l.w >= BOARD_W / 2 && l.h >= BOARD_H / 2 && lx > 24 && ly > 24 && lx < l.w - 24 && ly < l.h - 24) continue;
      return l;
    }
  }
  return null;
}
