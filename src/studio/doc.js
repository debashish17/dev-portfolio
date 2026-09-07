// The poster document — shared by the browser (editor, renderer) and the API
// (validation before anything is stored). Pure data + pure functions, no DOM.
//
// Units: the board is 480×640 "board units" (6×8 cells of 80). Every surface
// renders the same document at its own scale, so a poster looks identical in
// the editor, the exported PNG, the share card and the wall thumbnail.

export const BOARD_W = 480;
export const BOARD_H = 640;
export const GRID = 80;

export const INKS = Object.freeze({
  ink: '#1A1714',
  red: '#D62828',
  ochre: '#E8A33D',
  cream: '#F2EAD3',
  paper: '#E8DEC2',
});
export const INK_NAMES = Object.freeze(Object.keys(INKS));

// One word from a fixed set, never free text — nothing to moderate.
export const WORDS = Object.freeze(['MAKE', 'BUILD', 'SHIP', 'PLAY', 'WORK', 'HELLO']);

export const LAYER_TYPES = Object.freeze(['disc', 'wedge', 'bar', 'ring', 'tri', 'rays', 'pen', 'word', 'image']);
export const SCREENS = Object.freeze(['duotone', 'halftone', 'cutout', 'poster']);
export const MASKS = Object.freeze(['none', 'disc', 'wedge', 'tri']);
export const RAY_ORIGINS = Object.freeze(['br', 'bl', 'tr', 'tl']);

export const LIMITS = Object.freeze({
  layers: 24,
  images: 2,
  imageBytes: 200_000,      // processed PNG bytes, per image layer (four inks compress well)
  penPoints: 48,
  docBytes: 560_000,        // whole serialised document
});

// ------------------------------------------------------------------ helpers
let counter = 0;
export const newId = () => `${Date.now().toString(36)}${(counter++ % 1296).toString(36).padStart(2, '0')}`;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const snapTo = (v, step = GRID) => Math.round(v / step) * step;

// Deterministic PRNG so a "daily seed" gives every visitor the same start.
export function rng(seed) {
  let t = 0;
  for (const ch of String(seed)) t = (t * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export const dailySeed = (d = new Date()) => d.toISOString().slice(0, 10).replace(/-/g, '').slice(2); // YYMMDD

// ------------------------------------------------------------------ factories
const base = (type, props) => ({
  id: newId(), type,
  x: 0, y: 0, w: 160, h: 160, rot: 0,
  ink: 'red', multiply: false, keyline: false, shift: 0, opacity: 1,
  ...props,
});

export const make = {
  disc:  (p) => base('disc',  { ink: 'red', ...p }),
  wedge: (p) => base('wedge', { ink: 'ink', w: 240, h: 120, ...p }),
  bar:   (p) => base('bar',   { ink: 'ochre', w: 400, h: 28, rot: -22, ...p }),
  ring:  (p) => base('ring',  { ink: 'ink', w: 160, h: 160, thick: 22, ...p }),
  tri:   (p) => base('tri',   { ink: 'ink', w: 80, h: 80, ...p }),
  rays:  (p) => base('rays',  { ink: 'ink', w: 320, h: 260, origin: 'br', count: 14, duty: 0.28, opacity: 0.9, ...p }),
  pen:   (p) => base('pen',   { ink: 'ink', points: [[0, 0.1], [0.6, 0], [1, 0.4], [0.8, 1], [0.2, 0.85]], ...p }),
  word:  (p) => base('word',  { ink: 'cream', text: 'MAKE', h: 96, w: 300, shift: 2, ...p }),
  image: (p) => base('image', { ink: 'ink', w: 240, h: 240, screen: 'duotone', mask: 'disc', threshold: 0.55, keyline: true, src: '', iw: 0, ih: 0, ...p }),
};

export const emptyDoc = (seed = dailySeed()) => ({
  v: 1, w: BOARD_W, h: BOARD_H, paper: 'paper', grain: true, seed, layers: [],
});

// ------------------------------------------------------------------ shuffle
// A seeded composition in the site's grammar: a field, a bleeding disc, a bar
// on the diagonal, rays from a corner, a word, a couple of projectiles — and
// any photo the visitor already placed is kept and re-centred.
export function shuffle(doc, seed) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const chance = (p) => r() < p;
  const layers = [];

  const fieldSide = pick(['left', 'right', 'none', 'left']);
  if (fieldSide !== 'none') {
    layers.push(make.bar({ ink: 'ink', rot: 0, shift: 0, x: fieldSide === 'left' ? 0 : 240, y: 0, w: 240, h: 640 }));
  }
  const discInk = pick(['red', 'red', 'ochre']);
  const corner = pick(['tr', 'tl', 'br']);
  const size = 280 + Math.floor(r() * 3) * 40;
  layers.push(make.disc({
    ink: discInk, multiply: true, w: size, h: size,
    x: corner.endsWith('r') ? 480 - size + 80 : -80,
    y: corner.startsWith('t') ? -80 : 640 - size + 80,
  }));
  if (chance(0.6)) layers.push(make.wedge({ ink: pick(['ink', 'red']), x: snapTo(r() * 240), y: snapTo(160 + r() * 240), w: 240, h: 120, keyline: chance(0.4) }));
  layers.push(make.bar({ ink: pick(['ochre', 'red', 'cream']), multiply: chance(0.7), x: -60, y: snapTo(280 + r() * 200), w: 620, h: 20 + Math.floor(r() * 3) * 8 }));
  if (chance(0.7)) {
    const o = pick(RAY_ORIGINS);
    layers.push(make.rays({ ink: pick(['ink', 'red']), origin: o, x: o.endsWith('r') ? 160 : 0, y: o.startsWith('b') ? 380 : 0, w: 320, h: 260 }));
  }
  if (chance(0.5)) layers.push(make.ring({ ink: pick(['ink', 'cream', 'red']), x: snapTo(r() * 320), y: snapTo(r() * 400), w: 160, h: 160, thick: 18 + Math.floor(r() * 3) * 6, shift: chance(0.5) ? 3 : 0 }));
  const bar = chance(0.5) ? make.bar({ ink: 'red', rot: 0, x: snapTo(240 + r() * 160), y: snapTo(320 + r() * 160), w: 60, h: 84, extrude: { dx: 22, dy: -22 } }) : null;
  if (bar) layers.push(bar);
  for (let i = 0; i < 1 + Math.floor(r() * 2); i++) {
    layers.push(make.tri({ ink: pick(['cream', 'ink', 'red']), x: snapTo(r() * 440), y: snapTo(r() * 600), w: 40 + Math.floor(r() * 2) * 20, h: 40 + Math.floor(r() * 2) * 20, rot: Math.floor(r() * 8) * 45 }));
  }
  const photo = (doc?.layers || []).filter((l) => l.type === 'image');
  for (const p of photo) layers.push({ ...p, x: 120, y: 120, w: 240, h: 240, rot: 0 });
  const wordInk = fieldSide === 'none' ? pick(['ink', 'red']) : 'cream';
  layers.push(make.word({ text: pick(WORDS), ink: wordInk, x: 40, y: chance(0.6) ? 500 : 440, rot: chance(0.7) ? -22 : 0, h: 96, shift: 2 }));

  return { ...emptyDoc(seed), paper: doc?.paper || 'paper', grain: doc?.grain ?? true, seed, layers };
}

// ------------------------------------------------------------------ validation
// Runs on the server before storage and on the client before publish. Returns
// a cleaned copy — unknown keys dropped, numbers clamped — or an error string.
const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? clamp(v, lo, hi) : dflt);
const isDataPng = (s) => typeof s === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s);

export function validateDoc(input) {
  if (!input || typeof input !== 'object') return { error: 'not a document' };
  const layers = Array.isArray(input.layers) ? input.layers : null;
  if (!layers) return { error: 'no layers' };
  if (layers.length === 0) return { error: 'empty poster' };
  if (layers.length > LIMITS.layers) return { error: `more than ${LIMITS.layers} layers` };

  const out = [];
  let images = 0;
  for (const l of layers) {
    if (!l || !LAYER_TYPES.includes(l.type)) return { error: 'unknown layer type' };
    const c = {
      id: typeof l.id === 'string' ? l.id.slice(0, 24) : newId(),
      type: l.type,
      x: num(l.x, -BOARD_W, BOARD_W * 2, 0), y: num(l.y, -BOARD_H, BOARD_H * 2, 0),
      w: num(l.w, 4, BOARD_W * 2, 160), h: num(l.h, 4, BOARD_H * 2, 160),
      rot: num(l.rot, -360, 360, 0),
      ink: INK_NAMES.includes(l.ink) ? l.ink : 'ink',
      multiply: Boolean(l.multiply), keyline: Boolean(l.keyline),
      shift: num(l.shift, 0, 6, 0), opacity: num(l.opacity, 0.05, 1, 1),
    };
    if (l.extrude && typeof l.extrude === 'object') c.extrude = { dx: num(l.extrude.dx, -80, 80, 22), dy: num(l.extrude.dy, -80, 80, -22) };
    switch (l.type) {
      case 'ring': c.thick = num(l.thick, 2, 200, 22); break;
      case 'rays':
        c.origin = RAY_ORIGINS.includes(l.origin) ? l.origin : 'br';
        c.count = Math.round(num(l.count, 3, 40, 14));
        c.duty = num(l.duty, 0.05, 0.9, 0.28);
        break;
      case 'pen': {
        if (!Array.isArray(l.points) || l.points.length < 3) return { error: 'pen shape needs 3 points' };
        if (l.points.length > LIMITS.penPoints) return { error: 'pen shape too detailed' };
        c.points = l.points.map((p) => [num(p?.[0], 0, 1, 0), num(p?.[1], 0, 1, 0)]);
        break;
      }
      case 'word':
        if (!WORDS.includes(l.text)) return { error: 'word not in the set' };
        c.text = l.text;
        break;
      case 'image':
        images += 1;
        if (images > LIMITS.images) return { error: `more than ${LIMITS.images} photos` };
        if (!isDataPng(l.src)) return { error: 'photo must be a processed PNG' };
        if (l.src.length > LIMITS.imageBytes * 1.37) return { error: 'photo too large' };
        c.src = l.src;
        c.iw = Math.round(num(l.iw, 1, 2000, 1)); c.ih = Math.round(num(l.ih, 1, 2000, 1));
        c.screen = SCREENS.includes(l.screen) ? l.screen : 'duotone';
        c.mask = MASKS.includes(l.mask) ? l.mask : 'none';
        c.threshold = num(l.threshold, 0, 1, 0.55);
        break;
      default: break;
    }
    out.push(c);
  }
  const doc = {
    v: 1, w: BOARD_W, h: BOARD_H,
    paper: INK_NAMES.includes(input.paper) ? input.paper : 'paper',
    grain: input.grain !== false,
    seed: String(input.seed || '').replace(/[^0-9a-z-]/gi, '').slice(0, 12) || dailySeed(),
    layers: out,
  };
  if (JSON.stringify(doc).length > LIMITS.docBytes) return { error: 'poster too large' };
  return { doc, photos: images };
}

export const hasPhoto = (doc) => doc.layers.some((l) => l.type === 'image');
export const hasPen = (doc) => doc.layers.some((l) => l.type === 'pen');
// Posters made only of fixed shapes and fixed words cannot carry anything
// explicit, so they skip the vision screen and cost no quota.
export const needsScreen = (doc) => hasPhoto(doc) || hasPen(doc);
