import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { animate } from 'motion/react';
import { SNAP_SPRING } from '../motion/timeline.js';
import { useIsMobile } from '../components/primitives.jsx';
import {
  BOARD_W, BOARD_H, GRID, INKS, INK_NAMES, WORDS, SCREENS, MASKS, RAY_ORIGINS, LIMITS,
  make, emptyDoc, shuffle, validateDoc, dailySeed, snapTo, clamp, newId, needsScreen,
} from './doc.js';
import { drawPoster, ensureImages, ensureFonts, measureWord, hitLayer, renderPosterCanvas, renderShareCard, canvasToBlob, blobToDataUrl } from './render.js';
import { preparePhoto, screenPhoto } from './image-pipeline.js';
import { studioApi, posterUrl, copyText } from './api-client.js';
import { track } from '../lib/analytics.js';

// THE STUDIO — the composer.
// The document lives in React state for the inspector, mirrored into a ref for
// the canvas; a drag mutates the ref and redraws imperatively, and React only
// re-renders once per gesture, on commit. Same discipline as the rest of the
// site: nothing sets state per frame.

const ROT_SNAPS = [0, 22, 45, 68, 90, 112, 135, 158, 180, -22, -45, -68, -90, -112, -135, -158];
const HISTORY_MAX = 60;
const PAPER_CHOICES = ['paper', 'cream', 'ink'];

const TOOL_TILES = [
  { type: 'disc', label: 'DISC' },
  { type: 'wedge', label: 'WEDGE' },
  { type: 'bar', label: 'BAR' },
  { type: 'ring', label: 'RING' },
  { type: 'tri', label: 'TRI' },
  { type: 'rays', label: 'RAYS' },
  { type: 'pen', label: 'PEN · CUSTOM' },
  { type: 'word', label: 'WORD' },
  { type: 'image', label: 'IMAGE · UPLOAD' },
];

const TYPE_TITLES = { disc: 'DISC', wedge: 'WEDGE', bar: 'BAR', ring: 'RING', tri: 'TRI', rays: 'RAYS', pen: 'PEN SHAPE', word: 'WORD', image: 'IMAGE' };

const nearestRot = (deg) => ROT_SNAPS.reduce((a, b) => (Math.abs(b - deg) < Math.abs(a - deg) ? b : a));

function TileGlyph({ type }) {
  switch (type) {
    case 'disc': return <i className="st-g st-g-disc" />;
    case 'wedge': return <i className="st-g st-g-wedge" />;
    case 'bar': return <i className="st-g st-g-bar" />;
    case 'ring': return <i className="st-g st-g-ring" />;
    case 'tri': return <i className="st-g st-g-tri" />;
    case 'rays': return <i className="st-g st-g-rays" />;
    case 'pen': return (
      <svg width="28" height="24" viewBox="0 0 30 26" aria-hidden="true"><path d="M3 22 L10 4 L20 12 L27 2 L24 23 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="3" cy="22" r="2.4" fill="var(--red)" /><circle cx="27" cy="2" r="2.4" fill="var(--red)" /></svg>
    );
    case 'word': return <span className="display" style={{ fontSize: 20, lineHeight: 1 }}>Aa</span>;
    case 'image': return (
      <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><rect x="1.5" y="1.5" width="23" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="8" r="2.4" fill="var(--red)" /><path d="M3 19 L11 11 L16 15 L20 12 L24 16" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
    );
    default: return null;
  }
}

export default function Composer({ initialDoc, remixOf, onPublished, onOpenWall }) {
  const isMobile = useIsMobile();
  const [doc, setDocState] = useState(() => initialDoc || shuffle(emptyDoc(), dailySeed()));
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select');
  const [snap, setSnap] = useState(true);
  const [penPts, setPenPts] = useState([]);
  const [publish, setPublish] = useState({ stage: 'idle' });
  const [notice, setNotice] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);

  const docRef = useRef(doc);
  const canvasRef = useRef(null);
  const boardRef = useRef(null);
  const frameRef = useRef(null);
  const selRef = useRef(null);
  const fileRef = useRef(null);
  const scaleRef = useRef(1);
  const dragRef = useRef(null);
  const rafRef = useRef(0);
  const prepRef = useRef(new Map()); // layerId → prepared photo (session only)
  const history = useRef({ past: [], future: [] });
  const shuffleCount = useRef(0);

  const selected = useMemo(() => doc.layers.find((l) => l.id === selectedId) || null, [doc, selectedId]);

  // ---------------------------------------------------------------- drawing
  const redraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const c = canvasRef.current;
      if (!c) return;
      const S = scaleRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(BOARD_W * S), H = Math.round(BOARD_H * S);
      if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`; }
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPoster(ctx, docRef.current, S);
      placeSelection();
    });
  }, []);

  const placeSelection = () => {
    const el = selRef.current;
    if (!el) return;
    const l = docRef.current.layers.find((x) => x.id === dragRef.current?.id || x.id === el.dataset.id);
    if (!l) { el.style.display = 'none'; return; }
    const S = scaleRef.current;
    el.style.display = 'block';
    el.style.width = `${l.w * S}px`;
    el.style.height = `${l.h * S}px`;
    el.style.transform = `translate(${l.x * S}px, ${l.y * S}px) rotate(${l.rot}deg)`;
  };

  // Measure the board's box, derive S, redraw. ResizeObserver covers rotation
  // and the mobile dock opening/closing.
  useEffect(() => {
    const host = frameRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      const S = Math.max(0.3, Math.min(r.width / BOARD_W, r.height / BOARD_H));
      scaleRef.current = S;
      if (boardRef.current) { boardRef.current.style.width = `${BOARD_W * S}px`; boardRef.current.style.height = `${BOARD_H * S}px`; boardRef.current.style.setProperty('--cell', `${GRID * S}px`); }
      redraw();
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => {
    docRef.current = doc;
    let alive = true;
    (async () => {
      await Promise.all([ensureImages(doc), ensureFonts()]);
      if (alive) redraw();
    })();
    redraw();
    return () => { alive = false; };
  }, [doc, redraw]);

  useEffect(() => { placeSelection(); }, [selectedId, doc]);

  // ---------------------------------------------------------------- state ops
  const commit = useCallback((next, { record = true } = {}) => {
    if (record) {
      const h = history.current;
      h.past.push(JSON.stringify(docRef.current));
      if (h.past.length > HISTORY_MAX) h.past.shift();
      h.future = [];
    }
    docRef.current = next;
    setDocState(next);
  }, []);

  const updateLayer = useCallback((id, patch, opts) => {
    const next = { ...docRef.current, layers: docRef.current.layers.map((l) => (l.id === id ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)) };
    commit(next, opts);
  }, [commit]);

  const undo = useCallback(() => {
    const h = history.current;
    if (!h.past.length) return;
    h.future.push(JSON.stringify(docRef.current));
    const prev = JSON.parse(h.past.pop());
    docRef.current = prev; setDocState(prev);
  }, []);
  const redo = useCallback(() => {
    const h = history.current;
    if (!h.future.length) return;
    h.past.push(JSON.stringify(docRef.current));
    const next = JSON.parse(h.future.pop());
    docRef.current = next; setDocState(next);
  }, []);

  const addLayer = useCallback((type) => {
    if (type === 'pen') { setTool((t) => (t === 'pen' ? 'select' : 'pen')); setPenPts([]); setSelectedId(null); return; }
    if (type === 'image') { fileRef.current?.click(); return; }
    if (docRef.current.layers.length >= LIMITS.layers) { setNotice(`That is the limit — ${LIMITS.layers} layers.`); return; }
    const n = docRef.current.layers.length;
    const l = make[type]({ x: snapTo(80 + (n % 4) * 40), y: snapTo(160 + (n % 5) * 40) });
    if (type === 'word') l.w = measureWord(l.text, l.h);
    commit({ ...docRef.current, layers: [...docRef.current.layers, l] });
    setSelectedId(l.id);
    setTool('select');
  }, [commit]);

  const removeLayer = useCallback((id) => {
    commit({ ...docRef.current, layers: docRef.current.layers.filter((l) => l.id !== id) });
    prepRef.current.delete(id);
    setSelectedId(null);
  }, [commit]);

  const duplicateLayer = useCallback((id) => {
    const src = docRef.current.layers.find((l) => l.id === id);
    if (!src) return;
    if (src.type === 'image' && docRef.current.layers.filter((l) => l.type === 'image').length >= LIMITS.images) { setNotice(`Two photos per poster.`); return; }
    const copy = { ...src, id: newId(), x: src.x + GRID / 2, y: src.y + GRID / 2 };
    if (src.type === 'image' && prepRef.current.has(id)) prepRef.current.set(copy.id, prepRef.current.get(id));
    commit({ ...docRef.current, layers: [...docRef.current.layers, copy] });
    setSelectedId(copy.id);
  }, [commit]);

  const reorder = useCallback((id, dir) => {
    const ls = [...docRef.current.layers];
    const i = ls.findIndex((l) => l.id === id);
    const j = clamp(i + dir, 0, ls.length - 1);
    if (i < 0 || i === j) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    commit({ ...docRef.current, layers: ls });
  }, [commit]);

  const doShuffle = useCallback(() => {
    shuffleCount.current += 1;
    const seed = `${dailySeed()}-${shuffleCount.current}`;
    const next = shuffle(docRef.current, seed);
    for (const l of next.layers) if (l.type === 'word') l.w = measureWord(l.text, l.h);
    commit(next);
    setSelectedId(null);
    track('studio_shuffle');
  }, [commit]);

  const clearBoard = useCallback(() => {
    commit({ ...emptyDoc(docRef.current.seed), paper: docRef.current.paper, grain: docRef.current.grain });
    setSelectedId(null);
  }, [commit]);

  // ---------------------------------------------------------------- photo
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (docRef.current.layers.filter((l) => l.type === 'image').length >= LIMITS.images) { setNotice(`Two photos per poster.`); return; }
    setImgBusy(true);
    try {
      const prep = await preparePhoto(file);
      const shot = screenPhoto(prep, 'duotone', 0.55);
      if (shot.src.length > LIMITS.imageBytes * 1.37) {
        // very busy photos posterise into big PNGs — try the flatter cut
        Object.assign(shot, screenPhoto(prep, 'poster', 0.55));
      }
      const l = make.image({ ...shot, x: 120, y: 120, w: 240, h: 240 });
      prepRef.current.set(l.id, prep);
      commit({ ...docRef.current, layers: [...docRef.current.layers, l] });
      setSelectedId(l.id);
      setTool('select');
      track('studio_photo');
    } catch (err) {
      setNotice(err.message || 'That photo could not be read.');
    } finally { setImgBusy(false); }
  };

  const rescreen = useCallback((id, patch) => {
    const l = docRef.current.layers.find((x) => x.id === id);
    const prep = prepRef.current.get(id);
    if (!l) return;
    const next = { ...l, ...patch };
    if (prep) Object.assign(next, screenPhoto(prep, next.screen, next.threshold));
    updateLayer(id, next);
  }, [updateLayer]);

  // ---------------------------------------------------------------- pointer
  const toBoard = (e) => {
    const r = boardRef.current.getBoundingClientRect();
    const S = scaleRef.current;
    return { bx: (e.clientX - r.left) / S, by: (e.clientY - r.top) / S };
  };

  const finishPen = useCallback((pts) => {
    if (pts.length < 3) { setPenPts([]); setTool('select'); return; }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    const w = Math.max(8, x1 - x0), h = Math.max(8, y1 - y0);
    const l = make.pen({ x: x0, y: y0, w, h, ink: 'ink', points: pts.map(([px, py]) => [(px - x0) / w, (py - y0) / h]) });
    commit({ ...docRef.current, layers: [...docRef.current.layers, l] });
    setPenPts([]); setTool('select'); setSelectedId(l.id);
    track('studio_pen');
  }, [commit]);

  const onBoardDown = (e) => {
    if (e.button !== 0) return;
    const { bx, by } = toBoard(e);
    if (tool === 'pen') {
      const p = snap ? [snapTo(bx, GRID / 2), snapTo(by, GRID / 2)] : [bx, by];
      if (penPts.length >= 3 && Math.hypot(p[0] - penPts[0][0], p[1] - penPts[0][1]) < 14) { finishPen(penPts); return; }
      if (penPts.length >= LIMITS.penPoints) { finishPen(penPts); return; }
      setPenPts([...penPts, p]);
      return;
    }
    const hit = hitLayer(docRef.current, bx, by);
    if (!hit) { setSelectedId(null); return; }
    setSelectedId(hit.id);
    startDrag(e, { id: hit.id, mode: 'move', bx, by, orig: { ...hit } });
  };

  const startDrag = (e, d) => {
    dragRef.current = d;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    boardRef.current.classList.add('is-dragging');
  };

  const onHandleDown = (e, mode) => {
    e.stopPropagation();
    if (!selected) return;
    const { bx, by } = toBoard(e);
    startDrag(e, { id: selected.id, mode, bx, by, orig: { ...selected } });
  };

  const onBoardMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const { bx, by } = toBoard(e);
    const l = docRef.current.layers.find((x) => x.id === d.id);
    if (!l) return;
    if (d.mode === 'move') {
      l.x = d.orig.x + (bx - d.bx);
      l.y = d.orig.y + (by - d.by);
    } else if (d.mode === 'rotate') {
      const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
      let deg = (Math.atan2(by - cy, bx - cx) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      l.rot = snap && !e.shiftKey ? nearestRot(deg) : Math.round(deg);
    } else {
      // resize from a corner, in the layer's own (rotated) axes
      const a = (-l.rot * Math.PI) / 180;
      const dx = bx - d.bx, dy = by - d.by;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      const o = d.orig;
      const keep = l.type === 'disc' || l.type === 'ring' || (l.type === 'image' && l.mask === 'disc') || l.type === 'word' || e.shiftKey;
      let w = o.w, h = o.h, ox = 0, oy = 0;
      if (d.mode.includes('e')) w = o.w + lx; else { w = o.w - lx; ox = lx; }
      if (d.mode.includes('s')) h = o.h + ly; else { h = o.h - ly; oy = ly; }
      w = Math.max(8, w); h = Math.max(8, h);
      if (keep) { const k = Math.max(w / o.w, h / o.h); w = o.w * k; h = o.h * k; }
      if (l.type === 'word') { w = measureWord(l.text, h); }
      // The opposite corner is the anchor: it keeps its board position while the
      // box grows in the layer's own rotated frame.
      const b = (l.rot * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b);
      const ax = d.mode.includes('e') ? 0 : o.w, ay = d.mode.includes('s') ? 0 : o.h;
      const ocx = o.x + o.w / 2, ocy = o.y + o.h / 2;
      const rx = ax - o.w / 2, ry = ay - o.h / 2;
      const anchorX = ocx + rx * cb - ry * sb, anchorY = ocy + rx * sb + ry * cb;
      const nax = d.mode.includes('e') ? 0 : w, nay = d.mode.includes('s') ? 0 : h;
      const nrx = nax - w / 2, nry = nay - h / 2;
      const ncx = anchorX - (nrx * cb - nry * sb), ncy = anchorY - (nrx * sb + nry * cb);
      l.w = w; l.h = h; l.x = ncx - w / 2; l.y = ncy - h / 2;
      void ox; void oy;
    }
    redraw();
  };

  const onBoardUp = (e) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    boardRef.current.classList.remove('is-dragging');
    const l = docRef.current.layers.find((x) => x.id === d.id);
    if (!l) return;
    const settle = () => commit({ ...docRef.current, layers: docRef.current.layers.map((x) => (x.id === l.id ? { ...l } : x)) });
    if (d.mode === 'move' && snap && !e.shiftKey) {
      const from = { x: l.x, y: l.y };
      const to = { x: snapTo(l.x, GRID / 2), y: snapTo(l.y, GRID / 2) };
      if (Math.hypot(to.x - from.x, to.y - from.y) < 0.5) { settle(); return; }
      // overshoot and return — the same spring family as the pointer parallax
      animate(0, 1, {
        type: 'spring', ...SNAP_SPRING,
        onUpdate: (t) => { l.x = from.x + (to.x - from.x) * t; l.y = from.y + (to.y - from.y) * t; redraw(); },
        onComplete: () => { l.x = to.x; l.y = to.y; settle(); },
      });
      return;
    }
    if (d.mode !== 'move') { l.w = Math.round(l.w); l.h = Math.round(l.h); l.x = Math.round(l.x); l.y = Math.round(l.y); }
    settle();
  };

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd' && selectedId) { e.preventDefault(); duplicateLayer(selectedId); return; }
      if (e.key === 'Escape') { if (tool === 'pen') { setPenPts([]); setTool('select'); } else setSelectedId(null); return; }
      if (e.key === 'Enter' && tool === 'pen') { finishPen(penPts); return; }
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeLayer(selectedId); return; }
      if (e.key === '[') { reorder(selectedId, -1); return; }
      if (e.key === ']') { reorder(selectedId, 1); return; }
      const step = e.shiftKey ? GRID : GRID / 4;
      const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (nudge) { e.preventDefault(); updateLayer(selectedId, (l) => ({ x: l.x + nudge[0], y: l.y + nudge[1] })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, tool, penPts, undo, redo, duplicateLayer, removeLayer, reorder, updateLayer, finishPen]);

  // ---------------------------------------------------------------- export / publish
  const exportPng = async () => {
    try {
      const c = await renderPosterCanvas(docRef.current, 1200);
      const blob = await canvasToBlob(c);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `poster-${docRef.current.seed}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      track('studio_export');
    } catch (err) { setNotice(`Export failed: ${err.message}`); }
  };

  const doPublish = async () => {
    const v = validateDoc(docRef.current);
    if (v.error) { setNotice(`Not yet — ${v.error}.`); return; }
    setPublish({ stage: 'rendering' });
    try {
      // 1:1 board pixels — the wall shows it at ≤216px and the share card at 360px
      const c = await renderPosterCanvas(v.doc, 480);
      const png = await blobToDataUrl(await canvasToBlob(c));
      const originals = v.doc.layers.filter((l) => l.type === 'image').map((l) => prepRef.current.get(l.id)?.original).filter(Boolean);
      setPublish({ stage: 'screening', screened: needsScreen(v.doc) });
      const r = await studioApi.publish({ doc: v.doc, png, originals, remixOf: remixOf || null });
      // share card carries the number the server just assigned
      try {
        const card = await renderShareCard(v.doc, { id: r.id, number: r.number, photos: v.photos, likes: 0 });
        await studioApi.card(r.id, await blobToDataUrl(await canvasToBlob(card)));
      } catch { /* the poster PNG stands in for the card */ }
      setPublish({ stage: 'done', ...r });
      track('studio_publish', { status: r.status, photos: v.photos });
      onPublished?.(r);
    } catch (err) {
      setPublish({ stage: 'error', error: err.message, status: err.status });
    }
  };

  // ---------------------------------------------------------------- render
  const S = scaleRef.current;
  const penPath = penPts.length ? penPts.map(([x, y], i) => `${i ? 'L' : 'M'}${x * S},${y * S}`).join(' ') : '';
  const photoCount = doc.layers.filter((l) => l.type === 'image').length;

  return (
    <div className={`st-composer ${isMobile ? 'is-mobile' : ''}`}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

      {/* ---------------------------------------------------------- rail */}
      <aside className="st-rail" aria-label="Tools">
        <div className="st-mk"><span className="st-mk-n">VI.A</span><span className="label">LAYERS</span><span className="st-mk-r" /></div>
        <div className="st-tiles">
          {TOOL_TILES.map((t) => (
            <button key={t.type} type="button" className={`st-tile clickable ${tool === 'pen' && t.type === 'pen' ? 'is-on' : ''} ${t.type === 'image' ? 'is-ink' : ''}`} onClick={() => addLayer(t.type)} data-magnet disabled={imgBusy && t.type === 'image'} title={t.type === 'pen' ? 'Click points on the board · Enter or click the first point to close' : undefined}>
              <TileGlyph type={t.type} />
              <span>{imgBusy && t.type === 'image' ? 'PRESSING…' : t.label}</span>
            </button>
          ))}
        </div>

        <div className="st-mk"><span className="st-mk-n">VI.B</span><span className="label">PAPER</span><span className="st-mk-r" /></div>
        <div className="st-row">
          {PAPER_CHOICES.map((p) => (
            <button key={p} type="button" className={`st-swatch ${doc.paper === p ? 'is-on' : ''}`} style={{ background: INKS[p] }} onClick={() => commit({ ...docRef.current, paper: p })} aria-label={`paper ${p}`} />
          ))}
          <button type="button" className={`st-chip ${doc.grain ? 'is-on' : ''}`} onClick={() => commit({ ...docRef.current, grain: !docRef.current.grain })}>GRAIN</button>
        </div>

        <div className="st-mk"><span className="st-mk-n">VI.C</span><span className="label">PRESS</span><span className="st-mk-r" /></div>
        <div className="st-stack">
          <button type="button" className="st-btn st-btn-ink clickable" onClick={doShuffle} data-magnet>
            <span>SHUFFLE</span>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h3l6 8h3M2 12h3l2-2.7M11 4h3l-2 2.7" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <button type="button" className="st-btn clickable" onClick={() => setSnap((s) => !s)} aria-pressed={snap}>
            <span>SNAP · {GRID}</span><span className="st-dotlabel"><i className={snap ? 'is-on' : ''} />{snap ? 'ON' : 'OFF'}</span>
          </button>
          <div className="st-row st-row-tight">
            <button type="button" className="st-chip" onClick={undo} disabled={!history.current.past.length}>UNDO</button>
            <button type="button" className="st-chip" onClick={redo} disabled={!history.current.future.length}>REDO</button>
            <button type="button" className="st-chip" onClick={clearBoard}>CLEAR</button>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------- board */}
      <section className="st-frame" ref={frameRef}>
        <div
          ref={boardRef}
          className={`st-board ${snap ? 'show-grid' : ''} ${tool === 'pen' ? 'is-pen' : ''}`}
          onPointerDown={onBoardDown}
          onPointerMove={onBoardMove}
          onPointerUp={onBoardUp}
          onPointerCancel={onBoardUp}
          data-xray="STUDIO · BOARD"
        >
          <canvas ref={canvasRef} className="st-canvas" />
          {tool === 'pen' && (
            <svg className="st-penlayer" aria-hidden="true">
              {penPath && <path d={penPath} fill="rgba(214,40,40,0.15)" stroke="var(--red)" strokeWidth="1.5" strokeDasharray="4 3" />}
              {penPts.map(([x, y], i) => <circle key={i} cx={x * S} cy={y * S} r={i === 0 ? 6 : 3.5} fill={i === 0 ? 'var(--cream)' : 'var(--red)'} stroke="var(--ink)" strokeWidth="1.5" />)}
            </svg>
          )}
          <div ref={selRef} data-id={selectedId || ''} className="st-sel" style={{ display: selected ? 'block' : 'none' }} onPointerDown={(e) => { if (selected) { const { bx, by } = toBoard(e); e.stopPropagation(); startDrag(e, { id: selected.id, mode: 'move', bx, by, orig: { ...selected } }); } }}>
            {['nw', 'ne', 'sw', 'se'].map((h) => <i key={h} className={`st-handle st-h-${h}`} onPointerDown={(e) => onHandleDown(e, h)} />)}
            <i className="st-handle st-h-rot" onPointerDown={(e) => onHandleDown(e, 'rotate')} title="rotate" />
            {selected && <span className="st-sel-tag mono">{TYPE_TITLES[selected.type]} · x {Math.round(selected.x)} · y {Math.round(selected.y)}{selected.rot ? ` · ${selected.rot}°` : ''}</span>}
          </div>
          <div className="st-board-cap mono">{doc.layers.length} LAYERS · {photoCount} PHOTO{photoCount === 1 ? '' : 'S'} · SEED {doc.seed}</div>
        </div>
        {tool === 'pen' && <div className="st-hint mono">PEN · CLICK POINTS · CLICK THE FIRST POINT OR PRESS ENTER TO CLOSE · ESC CANCELS</div>}
        {notice && <div className="st-notice mono" role="status" onAnimationEnd={() => setNotice(null)}>{notice}</div>}
      </section>

      {/* ---------------------------------------------------------- inspector */}
      <aside className="st-inspector" aria-label="Selected layer">
        <div className="st-mk"><span className="st-mk-n">VI.D</span><span className="label">SELECTED</span><span className="st-mk-r" /></div>
        {selected ? (
          <Inspector l={selected} index={doc.layers.indexOf(selected)} total={doc.layers.length}
            update={(patch) => updateLayer(selected.id, patch)}
            rescreen={(patch) => rescreen(selected.id, patch)}
            remove={() => removeLayer(selected.id)}
            duplicate={() => duplicateLayer(selected.id)}
            reorder={(d) => reorder(selected.id, d)}
            canRescreen={prepRef.current.has(selected.id)} />
        ) : (
          <div className="st-card st-card-empty">
            <div className="display" style={{ fontSize: 18 }}>NOTHING SELECTED</div>
            <p>Click a shape on the board to edit it. Drag to move — it snaps to the grid with a spring. Corners resize, the top handle rotates.</p>
            <p className="mono st-keys">DEL · CTRL+Z · CTRL+D · [ ] · ARROWS</p>
          </div>
        )}

        <div className="st-mk"><span className="st-mk-n">VI.E</span><span className="label">KEEP</span><span className="st-mk-r" /></div>
        <div className="st-stack st-result" data-xray="STUDIO · PUBLISH">
          {publish.stage === 'idle' || publish.stage === 'error' ? (
            <>
              <div className="st-row st-keep">
                <button type="button" className="st-btn clickable" onClick={exportPng} data-magnet>EXPORT PNG</button>
                <button type="button" className="st-btn st-btn-ink clickable" onClick={doPublish} data-magnet>PUBLISH →</button>
              </div>
              {publish.stage === 'error' && <p className="st-err mono">{publish.error}</p>}
            </>
          ) : publish.stage === 'done' ? (
            <PublishResult r={publish} onOpenWall={onOpenWall} onAgain={() => setPublish({ stage: 'idle' })} />
          ) : (
            <div className="st-progress mono">
              <i className="st-blink" />
              {publish.stage === 'rendering' ? 'PRINTING…' : publish.screened ? 'SCREENING THE PHOTO…' : 'HANGING IT…'}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------ inspector
function Inspector({ l, index, total, update, rescreen, remove, duplicate, reorder, canRescreen }) {
  const set = (k) => (v) => update({ [k]: v });
  return (
    <div className="st-card">
      <div className="st-card-head">
        <div className="display" style={{ fontSize: 22 }}>{TYPE_TITLES[l.type]}</div>
        <div className="mono st-dim">LAYER {index + 1} / {total}</div>
      </div>

      {l.type !== 'image' && (
        <>
          <div className="st-k">INK</div>
          <div className="st-row">
            {INK_NAMES.filter((n) => n !== 'paper').map((n) => (
              <button key={n} type="button" className={`st-swatch ${l.ink === n ? 'is-on' : ''}`} style={{ background: INKS[n] }} onClick={() => update({ ink: n })} aria-label={n} />
            ))}
          </div>
        </>
      )}

      {l.type === 'image' && (
        <>
          <div className="st-k">SCREEN{!canRescreen && ' · REMIXED PHOTO, FIXED'}</div>
          <div className="st-row st-wrap">
            {SCREENS.map((s) => <button key={s} type="button" className={`st-chip ${l.screen === s ? 'is-on' : ''}`} disabled={!canRescreen} onClick={() => rescreen({ screen: s })}>{s.toUpperCase()}</button>)}
          </div>
          <div className="st-k">THRESHOLD <span className="st-dim">{l.threshold.toFixed(2)}</span></div>
          <input type="range" min="0.2" max="0.9" step="0.01" value={l.threshold} disabled={!canRescreen} className="st-range" onChange={(e) => rescreen({ threshold: Number(e.target.value) })} />
          <div className="st-k">MASK</div>
          <div className="st-row st-wrap">
            {MASKS.map((m) => <button key={m} type="button" className={`st-chip ${l.mask === m ? 'is-on' : ''}`} onClick={() => update({ mask: m })}>{m.toUpperCase()}</button>)}
          </div>
        </>
      )}

      {l.type === 'word' && (
        <>
          <div className="st-k">WORD</div>
          <div className="st-row st-wrap">
            {WORDS.map((w) => <button key={w} type="button" className={`st-chip ${l.text === w ? 'is-on' : ''}`} onClick={() => update({ text: w, w: measureWord(w, l.h) })}>{w}</button>)}
          </div>
          <div className="st-k">SIZE <span className="st-dim">{Math.round(l.h)}</span></div>
          <input type="range" min="40" max="200" step="4" value={l.h} className="st-range" onChange={(e) => { const h = Number(e.target.value); update({ h, w: measureWord(l.text, h) }); }} />
        </>
      )}

      {l.type === 'ring' && (
        <>
          <div className="st-k">THICKNESS <span className="st-dim">{Math.round(l.thick)}</span></div>
          <input type="range" min="4" max="80" step="2" value={l.thick} className="st-range" onChange={(e) => update({ thick: Number(e.target.value) })} />
        </>
      )}

      {l.type === 'rays' && (
        <>
          <div className="st-k">ORIGIN</div>
          <div className="st-row">
            {RAY_ORIGINS.map((o) => <button key={o} type="button" className={`st-chip ${l.origin === o ? 'is-on' : ''}`} onClick={() => update({ origin: o })}>{o.toUpperCase()}</button>)}
          </div>
          <div className="st-k">RAYS <span className="st-dim">{l.count}</span></div>
          <input type="range" min="4" max="32" step="1" value={l.count} className="st-range" onChange={(e) => update({ count: Number(e.target.value) })} />
          <div className="st-k">WEIGHT <span className="st-dim">{l.duty.toFixed(2)}</span></div>
          <input type="range" min="0.1" max="0.8" step="0.02" value={l.duty} className="st-range" onChange={(e) => update({ duty: Number(e.target.value) })} />
        </>
      )}

      <div className="st-k">PRESS</div>
      <div className="st-row st-wrap">
        <button type="button" className={`st-chip ${l.multiply ? 'is-on' : ''}`} onClick={() => update({ multiply: !l.multiply })} title="planes overprint like ink">MULTIPLY</button>
        {l.type !== 'word' && l.type !== 'rays' && <button type="button" className={`st-chip ${l.keyline ? 'is-on' : ''}`} onClick={() => update({ keyline: !l.keyline })}>KEY LINE</button>}
        {l.type !== 'image' && <button type="button" className={`st-chip ${l.shift ? 'is-on' : ''}`} onClick={() => update({ shift: l.shift ? 0 : 2 })} title="second plate 2 px off register">PLATE SHIFT</button>}
        {(l.type === 'bar' || l.type === 'tri') && <button type="button" className={`st-chip ${l.extrude ? 'is-on' : ''}`} onClick={() => update({ extrude: l.extrude ? undefined : { dx: 22, dy: -22 } })} title="Lissitzky's Proun — extrude into a block">PROUN</button>}
      </div>

      <div className="st-k">ROTATION <span className="st-dim">{Math.round(l.rot)}°</span></div>
      <div className="st-row st-wrap">
        {[0, -22, 22, 45, 90].map((r) => <button key={r} type="button" className={`st-chip ${Math.round(l.rot) === r ? 'is-on' : ''}`} onClick={() => update({ rot: r })}>{r}°</button>)}
      </div>

      <div className="st-grid3 mono">
        <div><span className="st-k">X</span>{Math.round(l.x)}</div>
        <div><span className="st-k">Y</span>{Math.round(l.y)}</div>
        <div><span className="st-k">SIZE</span>{Math.round(l.w)}×{Math.round(l.h)}</div>
      </div>

      <div className="st-row st-row-tight st-actions">
        <button type="button" className="st-chip" onClick={() => reorder(-1)} disabled={index === 0} title="send back">▼ BACK</button>
        <button type="button" className="st-chip" onClick={() => reorder(1)} disabled={index === total - 1} title="bring forward">▲ FRONT</button>
        <button type="button" className="st-chip" onClick={duplicate}>DUPLICATE</button>
        <button type="button" className="st-chip st-chip-red" onClick={remove}>DELETE</button>
      </div>
    </div>
  );
}

function PublishResult({ r, onOpenWall, onAgain }) {
  const [copied, setCopied] = useState(false);
  const url = posterUrl(r.id);
  const status = r.status === 'live' ? 'IT IS UP.' : r.status === 'held' ? 'HELD FOR TONIGHT.' : 'REFUSED.';
  const explain = r.status === 'live'
    ? `Poster № ${r.number} hangs among the contenders. Share the link — likes decide the ten.`
    : r.status === 'held'
      ? 'The screen ran out of daily budget, so this poster is held and checked again after the reset. The link already works for you.'
      : (r.reason || 'The screen refused this one. Nothing was published.');
  return (
    <>
      <div className="display" style={{ fontSize: 20, marginTop: 6 }}>{status}</div>
      <p>{explain}</p>
      {r.status !== 'rejected' && (
        <div className="st-stack">
          <button type="button" className="st-btn st-btn-ink clickable" onClick={async () => { setCopied(await copyText(url)); setTimeout(() => setCopied(false), 1800); }} data-magnet>{copied ? 'COPIED' : 'COPY LINK'}</button>
          <a className="st-btn clickable" href={`/p/${r.id}`} onClick={(e) => { e.preventDefault(); onOpenWall?.(r.id); }} data-magnet>OPEN THE POSTER →</a>
        </div>
      )}
      <button type="button" className="st-chip" style={{ marginTop: 10 }} onClick={onAgain}>MAKE ANOTHER</button>
    </>
  );
}
