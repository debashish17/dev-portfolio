import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CARDS } from './cards.js';
import { createFrameLoader } from './frames.js';
import {
  RENDER_W, RENDER_H,
  frameForScroll, focusStep, cameraAt, project, matrix3dFor,
} from './camera.js';

// STAIRCASE — the toolbox, as a scroll-scrubbed descent.
//
// A 265-frame WebP sequence driven by scroll, with live DOM type sitting on the
// rendered card faces via a reconstructed camera (see camera.js). The type is
// real text, not baked into the render: selectable, translatable, indexable and
// editable without re-rendering anything in Blender. A visually-hidden list
// carries the same twelve tools for crawlers and screen readers, so the section
// is legible with no JS and no scrolling.

const CARD_W = 300;
const CARD_H = 105;

// Only cards near the focus get type — further along the flight they are
// occluded by the steps between, and a DOM overlay has no depth buffer.
const WINDOW_BEHIND = 0.9;
const WINDOW_AHEAD = 2.4;

// Clearance over which an outgrowing label fades to nothing, as a fraction of
// the window's width so a phone is not stricter than a laptop.
const EDGE_PAD = 0.055;

// PHONE ONLY. The focused card face as a share of the frame's width, and how
// much of the screen its widest label may take. Landscape uses neither.
const CARD_SPAN = 0.62;
const TYPE_FIT = 0.81;
const WHOLE_FACE = Object.freeze({ u0: 0, u1: 1 });

// The render shows through a WINDOW the full height of the sticky. In
// landscape the frame inside it covers that window, so the render is cropped
// left and right rather than letterboxed top and bottom — a 16:9 plate would
// otherwise tie its height to its width and leave cream above and below.
//
// Its ground is flat #F2EAD3 and the sticky behind it is the same flat cream
// with no wash and no grid, so there is no edge between them to see.
//
// It settles in over the first stretch, scrubs the twelve cards, then lifts
// away on the tail so the section below rises into an emptying stage rather
// than replacing a frozen frame.
const SETTLE = 0.10;
const LEAVE = 0.94;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Screen x at parameter u along a projected edge. Perspective-correct, because
// a plain lerp under-reads a skewed card and lets the type touch the edge at
// full opacity. `depth` out of project() is the w.
const along = (a, b, u) => {
  const ia = (1 - u) / a.depth;
  const ib = u / b.depth;
  return (a.x * ia + b.x * ib) / (ia + ib);
};
const seg = (v, a, b) => clamp01((v - a) / (b - a));
const easeOut = (t) => 1 - (1 - t) * (1 - t);

function scrollParent(el) {
  let n = el?.parentElement;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return null;
}

export default function Staircase() {
  const sectionRef = useRef(null);
  const stickyRef = useRef(null);
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const cardRefs = useRef([]);

  const [reduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [active, setActive] = useState(0);

  const stateRef = useRef({ scale: 1, loader: null, painted: false });

  // The slice of the card face the fade guard watches. Landscape watches the
  // whole face (0..1, which makes the maths below identical to taking the
  // min/max of the four corners); portrait watches only the words, because
  // there the face is meant to bleed off both edges and only a cut word is a
  // defect. `widest` is what caps how far the phone can scale the render up.
  const typeRef = useRef({ u: CARDS.map(() => WHOLE_FACE) });

  // Measured from the DOM, so renaming a tool re-fits the section by itself.
  const measureType = useCallback(() => {
    // Per card, because one shared interval sized to the longest name would
    // judge REACT as if it were TYPESCRIPT and fade it while it still fits.
    // offsetLeft, not the padding: this reads wherever the type actually sits,
    // so it holds whether the face is set left or centred.
    const box = [];
    let widest = 0;
    for (const el of cardRefs.current) {
      if (!el) { box.push(null); continue; }
      let lo = Infinity, hi = 0;
      for (const child of el.children) {
        lo = Math.min(lo, child.offsetLeft);
        hi = Math.max(hi, child.offsetLeft + child.offsetWidth);
      }
      if (!Number.isFinite(lo) || hi <= lo) { box.push(null); continue; }
      box.push({ lo, hi });
      widest = Math.max(widest, hi - lo);
    }
    if (widest) stateRef.current.type = { box, widest };
  }, []);

  const layout = useCallback(() => {
    const stage = stageRef.current;
    const frame = frameRef.current;
    const sticky = stickyRef.current;
    if (!stage || !frame || !sticky) return;
    const vw = sticky.clientWidth;
    const vh = sticky.clientHeight;
    if (!vw || !vh) return;

    // Keyed off an explicit width, NOT the aspect ratio: a 1440x845 laptop
    // window is already narrower than 16:9, so an aspect test sends the desktop
    // down the phone branch.
    // The window runs the full height of the sticky on every viewport. Only its
    // width and what the render does inside it differ:
    //
    //   landscape — the render COVERS the window, cropped left and right.
    //   portrait  — it is CONTAINED, centred, scaled only as far as keeps the
    //               card faces whole. Covering a tall window from a 16:9 frame
    //               crops to about 28% of its width and the cards span 62%.
    const apH = vh;
    const cover = Math.max(vw / RENDER_W, vh / RENDER_H);
    let apW, scale;
    if (vw < 760) {
      // Sized by the TYPE, not by the card face. Fitting the whole face on a
      // phone caps the plate at ~39% of the sticky and leaves the section
      // mostly paper; the faces are flat colour, so letting them run off both
      // edges costs nothing as long as the words stay whole.
      const { box = [], widest = 0.7 * CARD_W } = stateRef.current.type || {};
      typeRef.current = {
        u: CARDS.map((_, i) => (box[i]
          ? { u0: box[i].lo / CARD_W, u1: box[i].hi / CARD_W }
          : { u0: 0, u1: 1 })),
      };
      scale = Math.min(cover, (TYPE_FIT * vw) / (CARD_SPAN * (widest / CARD_W) * RENDER_W));
      apW = Math.min(vw, RENDER_W * scale);
    } else {
      typeRef.current = { u: CARDS.map(() => WHOLE_FACE) };
      apW = Math.min(vw * 0.72, 1060);
      scale = Math.max(apW / RENDER_W, apH / RENDER_H);
    }
    stateRef.current.scale = scale;               // card projection lives in frame px
    stateRef.current.winW = apW;                  // the window is what clips
    stage.style.width = `${apW}px`;
    stage.style.height = `${apH}px`;
    frame.style.width = `${RENDER_W * scale}px`;
    frame.style.height = `${RENDER_H * scale}px`;
  }, []);

  useEffect(() => {
    const run = () => { measureType(); layout(); };
    run();
    // the labels are webfont-set, so re-fit once Archivo Black has landed
    document.fonts?.ready?.then(run).catch(() => {});
    window.addEventListener('resize', run);
    return () => window.removeEventListener('resize', run);
  }, [layout, measureType]);

  useEffect(() => {
    if (reduced) return undefined;
    const loader = createFrameLoader();
    stateRef.current.loader = loader;
    return () => { loader.destroy(); stateRef.current.loader = null; };
  }, [reduced]);

  useEffect(() => {
    if (reduced) return undefined;
    let raf = 0;
    let lastFrame = -1;
    let lastActive = -1;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const section = sectionRef.current;
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!section || !canvas || !stage || !frameRef.current) return;

      const scroller = scrollParent(section);
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const viewH = scroller ? scroller.clientHeight : window.innerHeight;
      const rect = section.getBoundingClientRect();
      const travel = rect.height - viewH;
      const t = travel > 0 ? clamp01((viewTop - rect.top) / travel) : 0;

      // ---- settle in, then lift away on the tail ----
      // No arrival TRANSLATE: the section is already sliding up the page as it
      // pins, and a second offset on top read as two competing motions.
      //
      // The lift is linear and measured in scrolled pixels, so across the tail
      // the window rises at exactly the speed of the page — it is standing
      // still relative to the section coming up behind it, and the handoff is
      // one motion rather than two. An ease here would make it outrun the
      // scroll at the end, which is precisely where the seam is read.
      const settle = easeOut(seg(t, 0, SETTLE));
      const leave = seg(t, LEAVE, 1);
      // the window itself lifts away; the render settles inside it
      stage.style.transform = `translate3d(0, ${-leave * (1 - LEAVE) * travel}px, 0)`;
      frameRef.current.style.transform =
        `translate(-50%, -50%) scale(${1.06 - 0.06 * settle})`;

      // ---- the scrub, across the middle ----
      const stairT = clamp01(t / LEAVE);
      const wanted = frameForScroll(stairT);
      const loader = stateRef.current.loader;
      if (!loader) return;

      // While the sequence streams, the nearest loaded frame may not be the one
      // asked for. Everything downstream keys off what is actually painted, so
      // the type never sits on a card the render is not currently showing.
      const shown = loader.nearestIndex(wanted);
      if (shown < 0) return;

      if (shown !== lastFrame) {
        const img = loader.at(shown);
        if (img) {
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          lastFrame = shown;
          stateRef.current.painted = true;
        }
      }

      const step = focusStep(shown);
      const cam = cameraAt(step);
      const scale = stateRef.current.scale;

      for (let i = 0; i < CARDS.length; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const card = CARDS[i];
        const delta = card.step - step;

        if (delta < -WINDOW_BEHIND || delta > WINDOW_AHEAD) {
          if (el.style.opacity !== '0') el.style.opacity = '0';
          continue;
        }

        const c = card.corners;
        // element TL,TR,BL,BR  ->  top-outer, top-inner, bottom-outer, bottom-inner
        const p = [project(c[2], cam), project(c[3], cam), project(c[1], cam), project(c[0], cam)];
        if (p.some((q) => q.depth <= 0)) { el.style.opacity = '0'; continue; }

        el.style.transform = matrix3dFor(CARD_W, CARD_H, p.map((q) => [q.x * scale, q.y * scale]));

        const fade = delta < 0
          ? Math.min(1, (delta + WINDOW_BEHIND) / 0.62)
          : Math.min(1, (WINDOW_AHEAD - delta) / 0.7);

        // A card close to the lens projects far wider than the window; its label
        // would be a giant word sliced off at the window edge. So the type goes
        // before the edge reaches it, not after: full strength while the card
        // still has EDGE_PAD of clearance, gone by the time it touches.
        // Measured against the window, not the frame — the frame overhangs the
        // window on both sides, so frame width is not where the clip happens.
        const winW = stateRef.current.winW ?? RENDER_W * scale;
        const crop = (RENDER_W * scale - winW) / 2;
        // p is top-outer, top-inner, bottom-outer, bottom-inner — OUTER and
        // INNER are helix radius, not screen side, so which of them is leftmost
        // flips as the camera comes round. Hence min/max over both ends of both
        // edges rather than assuming an order. At u0=0,u1=1 that is exactly the
        // min/max of the four corners, which is what landscape used before.
        const { u0, u1 } = typeRef.current.u[i] || WHOLE_FACE;
        const tA = along(p[0], p[1], u0), tB = along(p[0], p[1], u1);
        const bA = along(p[2], p[3], u0), bB = along(p[2], p[3], u1);
        const l = Math.min(tA, tB, bA, bB) * scale - crop;
        const r = Math.max(tA, tB, bA, bB) * scale - crop;
        const sizeFade = clamp01(Math.min(l, winW - r) / (winW * EDGE_PAD));

        el.style.opacity = String(clamp01(fade * sizeFade * (1 - leave)));
      }

      const near = Math.round(step) - CARDS[0].step;
      if (near !== lastActive && near >= 0 && near < CARDS.length) {
        lastActive = near;
        setActive(near);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      className={`stair${reduced ? ' is-flat' : ''}`}
      aria-labelledby="stair-heading"
    >
      {/* No scrub, so nothing would ever paint into the sticky and the section
          would read as a tall band of empty paper. The twelve faces the
          descent would have shown are laid out flat instead — same content,
          no camera. */}
      {reduced ? (
        <div className="stair-flat">
          <h2 id="stair-heading" className="stair-flat-title">The toolbox</h2>
          <ul className="stair-flat-list">
            {CARDS.map((c) => (
              <li key={c.index} className={`stair-flat-item fill-${c.fill}`}>
                <span className="stair-card-kicker">{c.index} · {c.kicker}</span>
                <span className="stair-card-label">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
      <>
      <div ref={stickyRef} className="stair-sticky">

        {!reduced && (
          <div ref={stageRef} className="stair-stage">
            <div ref={frameRef} className="stair-frame">
              <canvas ref={canvasRef} className="stair-canvas" width={1440} height={810} aria-hidden="true" />
              <div className="stair-cards" aria-hidden="true">
                {CARDS.map((c, i) => (
                  <div
                    key={c.index}
                    ref={(el) => { cardRefs.current[i] = el; }}
                    className={`stair-card fill-${c.fill}`}
                    style={{ width: CARD_W, height: CARD_H }}
                  >
                    <span className="stair-card-kicker">{c.index} · {c.kicker}</span>
                    <span className="stair-card-label">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!reduced && (
          <div className="stair-counter" aria-hidden="true">
            <span className="stair-counter-n">{CARDS[active]?.index ?? '01'}</span>
            <span className="stair-counter-rule" />
            <span className="stair-counter-total">12</span>
          </div>
        )}
      </div>

      <h2 id="stair-heading" className="sr-only">The toolbox</h2>
      <ul className="sr-only">
        {CARDS.map((c) => (
          <li key={c.index}>{c.kicker} — {c.label}</li>
        ))}
      </ul>
      </>
      )}
    </section>
  );
}
