import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useXRayRegister } from '../components/xray/hooks.js';
import { useIsMobile } from '../components/primitives.jsx';
import { SNAP_SPRING } from '../motion/timeline.js';
import Composer from '../studio/Composer.jsx';
import Wall from '../studio/Wall.jsx';
import PosterView from '../studio/PosterView.jsx';
import { studioApi } from '../studio/api-client.js';
import { validateDoc } from '../studio/doc.js';

// STUDIO — folio № VI. Three views under one route:
//   compose  /studio           the composer (default)
//   wall     /studio?wall      THE TEN leaderboard
//   poster   /p/:id            one poster (where a shared link lands)
// The URL is kept in sync with replaceState; the server answers /p/:id with the
// OG card for crawlers and forwards humans to /studio?p=:id.

function viewFromLocation() {
  const { pathname, search } = window.location;
  const q = new URLSearchParams(search);
  const m = pathname.match(/^\/p\/([a-z0-9]+)/i);
  if (m) return { kind: 'poster', id: m[1] };
  if (q.get('p')) return { kind: 'poster', id: q.get('p') };
  if (q.has('wall')) return { kind: 'wall' };
  if (q.get('remix')) return { kind: 'remix-loading', id: q.get('remix') };
  return { kind: 'compose' };
}

function urlFor(view) {
  if (view.kind === 'poster') return `/p/${view.id}`;
  if (view.kind === 'wall') return '/studio?wall';
  return '/studio';
}

export default function StudioPage() {
  const isMobile = useIsMobile();
  const [view, setView] = useState(viewFromLocation);
  const [remixDoc, setRemixDoc] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    try { window.history.replaceState(null, '', urlFor(view)); } catch { /* sandboxed */ }
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);

  const openPoster = useCallback((id) => setView({ kind: 'poster', id }), []);
  const openWall = useCallback(() => setView({ kind: 'wall' }), []);
  const openCompose = useCallback(() => setView({ kind: 'compose' }), []);

  const remix = useCallback(async (id) => {
    setView({ kind: 'remix-loading', id });
    try {
      const d = await studioApi.doc(id);
      const v = validateDoc(d.doc);
      if (v.error) throw new Error(v.error);
      setRemixDoc({ doc: v.doc, of: id });
      setView({ kind: 'compose', remixOf: id });
    } catch {
      setRemixDoc(null);
      setView({ kind: 'compose' });
    }
  }, []);

  useEffect(() => { if (view.kind === 'remix-loading' && view.id && !remixDoc) remix(view.id); }, [view, remixDoc, remix]);

  useXRayRegister('studio', {
    variant: isMobile ? 'mobile' : 'desktop', timeline: null, scroller: scrollRef, values: {},
    notes: [
      `view: ${view.kind}`,
      'board: canvas 2D · one draw per frame during a drag · React commits once per gesture',
      `snap: spring k${SNAP_SPRING.stiffness} d${SNAP_SPRING.damping} m${SNAP_SPRING.mass} (ζ≈0.73, overshoots on purpose)`,
      'publish: poster PNG 600×800 + share card 1200×630 rendered in the browser',
    ],
  });

  const tab = view.kind === 'wall' ? 'wall' : view.kind === 'poster' ? 'poster' : 'compose';

  return (
    <div ref={scrollRef} className="paper-bg st-page" style={{ position: 'absolute', inset: 0, overflowX: 'hidden', overflowY: 'auto' }}>
      <div className="grid-overlay" />
      <div className="st-page-inner">
        <header className={`st-head ${tab === 'compose' ? '' : 'is-slim'}`}>
          <div>
            <div className="label" style={{ color: 'var(--red)' }}>FOLIO № VI · STUDIO{tab === 'poster' ? ' · ONE POSTER' : ''}</div>
            {/* The wall and the poster view carry their own titles */}
            {tab === 'compose' && (
              <>
                <h1 className="display st-title">THE STUDIO<span style={{ color: 'var(--red)' }}>.</span></h1>
                <div className="mono st-dim st-sub">
                  {view.remixOf ? `REMIXING № ${view.remixOf.toUpperCase()} — ` : ''}A POSTER IN THIS SITE'S LANGUAGE — YOUR PHOTO THROUGH FOUR INKS, SHAPES THAT OVERPRINT, TYPE ON THE DIAGONAL. SNAPS TO 80.
                </div>
              </>
            )}
          </div>
          <nav className="st-tabs st-tabs-head" aria-label="Studio views">
            <button type="button" className={`st-chip st-chip-lg clickable ${tab === 'compose' ? 'is-on' : ''}`} onClick={openCompose} data-magnet>COMPOSE</button>
            <button type="button" className={`st-chip st-chip-lg clickable ${tab !== 'compose' ? 'is-on' : ''}`} onClick={openWall} data-magnet>THE TEN</button>
          </nav>
        </header>

        {tab === 'compose' && (
          <Composer
            key={remixDoc?.of || 'fresh'}
            initialDoc={remixDoc?.doc || null}
            remixOf={remixDoc?.of || null}
            onPublished={() => {}}
            onOpenWall={(id) => (id ? openPoster(id) : openWall())}
          />
        )}
        {view.kind === 'remix-loading' && <div className="mono st-dim st-wall-msg"><i className="st-blink" /> LOADING THE LAYERS…</div>}
        {tab === 'wall' && <Wall onOpenPoster={openPoster} onRemix={remix} onMakeYours={openCompose} />}
        {tab === 'poster' && <PosterView id={view.id} onRemix={remix} onBack={openWall} />}

        <footer className="mono st-dim st-foot">DRAG · SNAPS TO 80 · SPRINGS OVERSHOOT AND RETURN · PLANES MULTIPLY LIKE INK · PRESS X TO SEE THE ENGINE</footer>
      </div>
    </div>
  );
}
