import React from 'react';

// The see-through layer: scrim, red major grid aligned to the page's own 80px
// grid, the vanishing-point reticle, the reveal scan line, and one outline box
// per [data-xray] element. Every box is positioned and classed by the frame loop
// in XRayRoot through the `R` refs bag — this component only owns the DOM shape.

const parsePct = (s, fallback) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n / 100 : fallback;
};

export default function XRayOverlay({ targets, R, timeline, sweepKey, showSweep }) {
  let vp = null;
  if (timeline && timeline.perspectiveOrigin) {
    const [ox, oy] = timeline.perspectiveOrigin.split(/\s+/);
    vp = { x: parsePct(ox, 0.5), y: parsePct(oy, 0.5), label: timeline.perspectiveOrigin };
  }

  return (
    <>
      <div className="xr-scrim" />
      <div className="xr-grid" />
      {vp && (
        <div
          className="xr-vp"
          style={{ left: `${vp.x * 100}vw`, top: `calc(56px + ${vp.y} * (100vh - 56px))` }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 16 16" width="16" height="16">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M8 0v3M8 13v3M0 8h3M13 8h3" stroke="currentColor" strokeWidth="1" />
          </svg>
          <span className="xr-vp-label mono">VP · {vp.label}</span>
        </div>
      )}
      {showSweep && <div key={sweepKey} className="xr-sweep" />}

      {/* Boxes live in viewport coordinates but are clipped below the nav rail,
          so a target whose top sits under the nav never draws over it. */}
      <div className="xr-boxes">
      {targets.map((t) => (
        <div
          key={t.key}
          className="xr-box"
          ref={(el) => { if (el) R.boxes.set(t.el, el); else R.boxes.delete(t.el); }}
          style={{
            transform: `translate3d(${t.rect.x}px, ${t.rect.y}px, 0)`,
            width: t.rect.w,
            height: t.rect.h,
            '--xr-delay': `${t.delay}ms`,
          }}
        >
          <span
            className="xr-tag mono"
            ref={(el) => { if (el) R.tags.set(t.el, el); else R.tags.delete(t.el); }}
          >
            {t.name}
            {t.values.length > 0 && (
              <span
                className="xr-tag-read"
                ref={(el) => { if (el) R.reads.set(t.el, el); else R.reads.delete(t.el); }}
              />
            )}
          </span>
        </div>
      ))}
      </div>
    </>
  );
}
