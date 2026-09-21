// Reconstruction of the Blender camera that shot the spiral-staircase scrub,
// so live DOM text can sit on the rendered card faces.
//
// The render ships no type. Each card face is a real quad in world space; we
// rebuild the camera analytically, project the four corners, and drive a CSS
// matrix3d from them. Verified against the two invariants in the render
// handoff: at every stop the focused card sits 4.382 deg off its own normal
// (handoff: 4.4) and spans 0.6193 of frame width (handoff: 0.617).
//
// The camera rides the same helix as the cards, one lead-offset downhill in
// ANGLE only — it stays level with whatever card it is looking at. Letting it
// descend with the helix instead puts the card 30.8 deg off normal, which is
// the stair pitch, and is how you can tell the level reading is the right one.

export const RENDER_W = 1920;
export const RENDER_H = 1080;

const R = 17.316057808398213;   // helix radius, r_mid
const DEG_PER_STEP = 5.625;     // 64 steps per turn
const PHASE = 0.9;              // deg, puts step 5 at 29.025
const LEAD = 1.5580887903286815;// steps the camera trails the focused card
const Z0 = 0.475;               // face-centre height = Z0 - step

// 35 mm lens on a 36 mm sensor, sensor_fit VERTICAL: the 36 mm dimension maps
// to the 1080 px height, so focal length in pixels is 1080 * 35/36 = 1050.
const F_PX = RENDER_H * 35 / 36;

// Frame timing. The render is 529 frames, 48 per card, and the shipped scrub
// set is every 2nd frame -> 265. Easing between stops is smoothstep and is
// BAKED INTO THE FRAMES, so scroll maps to frame index linearly; we only
// re-apply smoothstep here to know where the camera actually is.
export const FRAME_COUNT = 265;
const FRAMES_PER_STEP = 48;
const FIRST_CARD_STEP = 5;
const SEGMENTS = 11;            // 12 cards, 11 gaps

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// scroll 0..1 -> index into the shipped frame set
export const frameForScroll = (t) => Math.round(clamp01(t) * (FRAME_COUNT - 1));

// Where the camera is looking, in step units along the helix, for a scrub
// frame index. Mirrors the baked easing so overlays track the render exactly.
export function focusStep(frameIndex) {
  const f0 = 2 * frameIndex;                       // back to 0-based render frame
  const k = Math.min(Math.floor(f0 / FRAMES_PER_STEP), SEGMENTS - 1);
  const u = (f0 - k * FRAMES_PER_STEP) / FRAMES_PER_STEP;
  const eased = u * u * (3 - 2 * u);               // smoothstep
  return FIRST_CARD_STEP + k + eased;
}

const angleOf = (step) => ((step * DEG_PER_STEP + PHASE) * Math.PI) / 180;
const heightOf = (step) => Z0 - step;

// Camera basis for a given focus position. Target is the focused card's face
// centre; up is world +Z.
export function cameraAt(step) {
  const ta = angleOf(step);
  const ca = angleOf(step + LEAD);
  const z = heightOf(step);
  const target = [R * Math.cos(ta), R * Math.sin(ta), z];
  const eye = [R * Math.cos(ca), R * Math.sin(ca), z];

  const fwd = unit(sub(target, eye));
  const right = unit(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  return { eye, fwd, right, up };
}

// World point -> render pixels. depth is distance along the view axis; <= 0
// means the point is behind the camera and must not be drawn.
export function project(p, cam) {
  const v = sub(p, cam.eye);
  const depth = dot(v, cam.fwd);
  if (depth <= 0.001) return { x: 0, y: 0, depth: -1 };
  return {
    x: RENDER_W / 2 + (F_PX * dot(v, cam.right)) / depth,
    y: RENDER_H / 2 - (F_PX * dot(v, cam.up)) / depth,
    depth,
  };
}

// ---- small vector helpers ----
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function unit(a) { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; }

// ---------------------------------------------------------------------------
// Homography: map a w x h element onto four arbitrary screen corners.
// The standard adjugate construction; returns a CSS matrix3d string.
// ---------------------------------------------------------------------------
function adj(m) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}
function mmul(a, b) {
  const c = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
    c[3 * i + j] = s;
  }
  return c;
}
function mvmul(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
function basisTo(x1, y1, x2, y2, x3, y3, x4, y4) {
  const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const v = mvmul(adj(m), [x4, y4, 1]);
  return mmul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

// src corners are (0,0) (w,0) (0,h) (w,h); dst is the same order in px.
export function matrix3dFor(w, h, dst) {
  const s = basisTo(0, 0, w, 0, 0, h, w, h);
  const d = basisTo(dst[0][0], dst[0][1], dst[1][0], dst[1][1], dst[2][0], dst[2][1], dst[3][0], dst[3][1]);
  const t = mmul(d, adj(s));
  for (let i = 0; i < 9; i++) t[i] = t[i] / t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,${t[8]})`;
}
