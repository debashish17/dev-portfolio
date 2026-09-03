import React, { useEffect, useRef, useCallback } from 'react';
import { textRef } from './refs.js';

// Bottom strip. On scroll-driven pages it draws the hold plateaus and transition
// zones with a red playhead bound to the spring and a ghost bound to the raw
// scroll — the gap between them is the spring lag made visible. It is a real
// slider: seeking writes scrollTop with behavior 'instant' (the spring is the
// smoothing; smooth-scrolling on top would hide the very thing being shown).
// On pointer-only pages it shows the two parallax meters instead.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default function Timeline({ entry, R }) {
  const trackRef = useRef(null);
  const r = (key) => textRef(R, key);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => { R.trackW = el.clientWidth; };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); R.trackW = 0; };
  }, [entry, R]);

  const scroller = entry && entry.scroller ? entry.scroller.current : null;
  const rawMv = entry && entry.values && entry.values.scrollY ? entry.values.scrollY.mv : null;

  const seekTo = useCallback((p) => {
    const c = entry && entry.scroller ? entry.scroller.current : null;
    if (!c) return;
    const max = c.scrollHeight - c.clientHeight;
    c.scrollTo({ top: clamp01(p) * max, behavior: 'instant' });
  }, [entry]);

  const pFromEvent = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    return (e.clientX - rect.left) / Math.max(1, rect.width);
  };

  const dragging = useRef(false);
  const onPointerDown = (e) => {
    if (!scroller) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    seekTo(pFromEvent(e));
  };
  const onPointerMove = (e) => { if (dragging.current) seekTo(pFromEvent(e)); };
  const onPointerUp = (e) => {
    dragging.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  const onWheel = (e) => { if (scroller) scroller.scrollBy({ top: e.deltaY }); };
  const onKeyDown = (e) => {
    if (!scroller || !rawMv || !entry.timeline) return;
    const p = rawMv.get();
    const step = e.shiftKey ? 0.05 : 0.01;
    const holds = entry.timeline.holds;
    let next = null;
    if (e.key === 'ArrowRight') next = p + step;
    else if (e.key === 'ArrowLeft') next = p - step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    else if (/^[1-9]$/.test(e.key)) { const h = holds[Number(e.key) - 1]; if (h) next = (h[0] + h[1]) / 2; }
    if (next == null) return;
    e.preventDefault();
    seekTo(next);
  };

  if (!entry) {
    return (
      <div className="xr-timeline mono">
        <div className="xr-tl-cap">—</div>
        <div className="xr-tl-track xr-tl-track--static" />
        <div className="xr-tl-cam">THIS PAGE REGISTERS NOTHING YET</div>
      </div>
    );
  }

  const tl = entry.timeline;

  if (!tl) {
    const hasPtr = entry.values.mouseX && entry.values.mouseY;
    const consumers = Object.entries(entry.values)
      .filter(([, d]) => d.kind === 'transform')
      .map(([n, d]) => (d.label || n).toUpperCase());
    return (
      <div className="xr-timeline xr-timeline--pointer mono">
        <div className="xr-tl-cap">POINTER</div>
        <div className="xr-tl-track xr-tl-track--static">
          {hasPtr ? (
            <div className="xr-tl-meters">
              <span className="xr-tl-axis">X</span>
              <div className="xr-meter"><i ref={(el) => { R.meterX = el; }} /></div>
              <span className="xr-tl-axis">Y</span>
              <div className="xr-meter"><i ref={(el) => { R.meterY = el; }} /></div>
              <span className="xr-tl-ptr" ref={r('tlPtr')} />
            </div>
          ) : (
            <span className="xr-tl-seek">NO POINTER VALUES</span>
          )}
        </div>
        <div className="xr-tl-cam">{consumers.length ? `→ ${consumers.join(' · ')}` : ''}</div>
      </div>
    );
  }

  return (
    <div className="xr-timeline mono">
      <div className="xr-tl-cap">
        <span ref={r('tlP')}>…</span>
        <small>raw <span ref={r('tlRaw')} /></small>
      </div>
      <div
        className="xr-tl-track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Scene timeline — seek the scroll"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={0}
        data-magnet
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <div className="xr-tl-acts">
          {tl.holds.map((h, i) => (
            <span key={`a${i}`} className="xr-tl-act" style={{ left: `${((h[0] + h[1]) / 2) * 100}%` }}>{tl.acts[i]}</span>
          ))}
          {tl.zones.map((z, i) => (
            <span key={`zl${i}`} className="xr-tl-zone-label" style={{ left: `${((z[0] + z[1]) / 2) * 100}%` }}>Z{i + 1}</span>
          ))}
        </div>
        {tl.holds.map((h, i) => (
          <div key={`h${i}`} className="xr-tl-seg xr-tl-seg--hold" style={{ left: `${h[0] * 100}%`, width: `${(h[1] - h[0]) * 100}%` }} />
        ))}
        {tl.zones.map((z, i) => (
          <div key={`z${i}`} className="xr-tl-seg xr-tl-seg--zone" style={{ left: `${z[0] * 100}%`, width: `${(z[1] - z[0]) * 100}%` }} />
        ))}
        <div className="xr-tl-ghost" ref={(el) => { R.ghost = el; }} />
        <div className="xr-tl-head" ref={(el) => { R.playhead = el; }} />
        <span className="xr-tl-seek">SEEK</span>
      </div>
      <div className="xr-tl-cam">
        <span ref={r('tlCam')} />
        <br />
        <span ref={r('tlSeg')} />
      </div>
    </div>
  );
}
