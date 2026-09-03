import React, { useState } from 'react';
import { uiStore } from '../../lib/xray/store.js';
import { textRef } from './refs.js';

// The instrument panel. Every number cell is a text node the frame loop writes
// into by key (see refs.js); React only renders this on open, collapse, route
// change and the two local toggles. The REACT row that says "X-RAY" is this
// component counting itself — if it climbs while you scroll, the exhibit failed.

const ABOUT_KEY = 'xr.about.v1';
const readFlag = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return true; } };
const setFlag = (k) => { try { localStorage.setItem(k, '1'); } catch { /* private mode */ } };

const IS_DEV = typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';

export default function PerfHUD({ R, entry, hud, support, reduced, pageId }) {
  const r = (key) => textRef(R, key);
  const [about, setAbout] = useState(() => !readFlag(ABOUT_KEY));
  const [note, setNote] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const min = hud === 'collapsed';
  const values = entry ? Object.entries(entry.values) : [];
  const pageLabel = (pageId || '—').toUpperCase();

  return (
    <div className={`xr-hud${min ? ' is-min' : ''}`} role="region" aria-label="X-ray readings" aria-live="off">
      <div className="xr-hud-head">
        <span className="xr-hud-live" aria-hidden="true" />
        <span className="xr-hud-title display">X-RAY</span>
        <span className="xr-hud-sub mono">LIVE ENGINE</span>
        {min && <span className="xr-hud-sum mono" ref={r('sum')}>…</span>}
        <button
          className="xr-hud-btn mono clickable"
          data-magnet
          title={min ? 'Expand' : 'Collapse'}
          aria-label={min ? 'Expand readings' : 'Collapse readings'}
          onClick={() => uiStore.setHud(min ? 'expanded' : 'collapsed')}
        >{min ? '+' : '−'}</button>
        <button
          className="xr-hud-btn mono clickable"
          data-magnet
          title="How these are measured"
          aria-label="How these are measured"
          aria-pressed={note}
          onClick={() => setNote((v) => !v)}
        >?</button>
      </div>

      <div className="xr-hud-body">
        {about && (
          <div className="xr-about">
            <div className="xr-sec-h mono">ABOUT THIS MODE</div>
            The site reading itself. Outlines mark what moves; the numbers come from the
            running engine, right now — nothing is recorded.
            <div style={{ marginTop: 8 }}>
              <button className="xr-hud-btn mono clickable" data-magnet style={{ padding: 0, opacity: 1 }} onClick={() => { setFlag(ABOUT_KEY); setAbout(false); }}>OK →</button>
            </div>
          </div>
        )}

        <div className="xr-sec">
          <div className="xr-sec-h mono">ENGINE · MAIN-THREAD FRAMES</div>
          <div className="xr-row">
            <span className="xr-v xr-v--hero" ref={r('fps')}>…</span>
            <svg className="xr-spark" viewBox="0 0 96 20" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1={20 - (16.7 / 50) * 20} x2="96" y2={20 - (16.7 / 50) * 20} />
              <polyline ref={(el) => { R.spark = el; }} points="" />
            </svg>
            <span className="xr-v mono" ref={r('frame')}>…</span>
          </div>
          {/* Volatile cells get fixed widths (or go last in their row) so a digit
              change never moves a neighbour — otherwise the HUD would inflate the
              very CLS it reports. */}
          <div className="xr-row mono" style={{ marginTop: 4 }}>
            <span className="xr-k">FPS</span>
            <span className="xr-v" style={{ minWidth: 104 }} ref={r('avg')}>…</span>
            <span className="xr-v xr-line" ref={r('hz')}>…</span>
          </div>
          <div className="xr-row mono" style={{ marginTop: 4 }}>
            <span className="xr-k">DROPPED</span><span className="xr-v" style={{ minWidth: '4ch' }} ref={r('dropped')}>0</span>
            <span className="xr-k">LONG</span><span className="xr-v" style={{ minWidth: '3ch' }} ref={r('long')}>0</span>
            <span className="xr-v xr-line" style={{ opacity: 0.6 }} ref={r('worst')} />
          </div>
          <div className="xr-row mono" style={{ marginTop: 4 }}>
            <span className="xr-k">TASKS</span><span className="xr-v xr-line" ref={r('longtask')}>…</span>
          </div>
          <div className="xr-row mono" style={{ marginTop: 4, opacity: 0.7 }}>
            <span className="xr-v xr-line" ref={r('cost')} />
          </div>
        </div>

        <div className="xr-sec">
          <div className="xr-sec-h mono">VITALS · THIS PAGE LOAD</div>
          <div className="xr-cols mono">
            <div><div className="xr-k">LCP</div><div className="xr-v" ref={r('lcp')}>…</div></div>
            <div><div className="xr-k">FCP</div><div className="xr-v" ref={r('fcp')}>…</div></div>
            <div><div className="xr-k">CLS</div><div className="xr-v" ref={r('cls')}>…</div></div>
            <div><div className="xr-k">INP≈</div><div className="xr-v" ref={r('inp')}>…</div></div>
          </div>
          <div className="xr-row mono" style={{ marginTop: 6, opacity: 0.7 }}>
            <span className="xr-v xr-line" style={{ fontSize: 9 }} ref={r('lcpEl')} />
          </div>
          <div className="xr-row mono" style={{ marginTop: 2, opacity: 0.7 }}>
            <span className="xr-v xr-line" style={{ fontSize: 9 }} ref={r('clsSum')} />
          </div>
          <div className="xr-row mono" style={{ marginTop: 2, opacity: 0.7 }}>
            <span className="xr-v xr-line" style={{ fontSize: 9 }} ref={r('inpLast')} />
          </div>
        </div>

        <div className="xr-sec">
          <div className="xr-cols xr-cols--2 mono">
            <div>
              <div className="xr-sec-h">PAYLOAD · AS SERVED</div>
              <div className="xr-k">JS</div><div className="xr-v" ref={r('js')}>…</div>
              <div className="xr-k" style={{ marginTop: 4 }}>CSS</div><div className="xr-v" ref={r('css')}>…</div>
              <div className="xr-k" style={{ marginTop: 4 }}>FONTS</div><div className="xr-v" ref={r('fonts')}>…</div>
            </div>
            <div>
              <div className="xr-sec-h">REACT · RENDERS{IS_DEV ? ' (DEV ×2)' : ''}</div>
              <div className="xr-k">APP</div><div className="xr-v" ref={r('rApp')}>…</div>
              <div className="xr-k" style={{ marginTop: 4 }}>{pageLabel}</div><div className="xr-v" ref={r('rPage')}>…</div>
              <div className="xr-k" style={{ marginTop: 4 }}>CLOCK</div><div className="xr-v" ref={r('rClock')}>…</div>
              <div className="xr-k" style={{ marginTop: 4 }}>X-RAY</div><div className="xr-v" ref={r('rXray')}>…</div>
            </div>
          </div>
          <div className="xr-row mono" style={{ marginTop: 6, opacity: 0.7 }}>
            <span className="xr-v xr-line" style={{ fontSize: 9 }} ref={r('nav')} />
          </div>
          <div className="xr-row mono" style={{ marginTop: 2, opacity: 0.7 }}>
            <span className="xr-v xr-line" style={{ fontSize: 9 }} ref={r('rHot')} />
          </div>
        </div>

        <div className="xr-sec">
          <div className="xr-sec-h mono">MOTION · {entry && entry.timeline ? 'SCROLL SPRING' : 'POINTER'}</div>
          <div className="xr-row mono">
            <span className="xr-k">PROGRESS</span><span className="xr-v" style={{ minWidth: '6ch' }} ref={r('mProgress')}>—</span>
            <span className="xr-k">VELOCITY</span><span className="xr-v xr-line" ref={r('mVel')} />
          </div>
          <div className="xr-row mono" style={{ marginTop: 4 }}>
            <span className="xr-v" style={{ minWidth: 88 }} ref={r('mState')} />
            <span className="xr-v xr-line" style={{ opacity: 0.7 }} ref={r('mSettle')} />
          </div>
          <div className="xr-row mono" style={{ marginTop: 4, opacity: 0.7 }}>
            <span className="xr-v xr-line" style={{ fontSize: 9 }} ref={r('mSpring')} />
          </div>
          <div className="xr-row mono" style={{ marginTop: 4 }}>
            <span className="xr-v xr-line" ref={r('mSeg')} />
          </div>
          <div className="xr-row mono" style={{ marginTop: 6 }}>
            <button
              className="xr-hud-btn mono clickable"
              data-magnet
              style={{ padding: 0, opacity: 0.8 }}
              aria-expanded={showValues}
              onClick={() => setShowValues((v) => !v)}
            >{showValues ? '▾' : '▸'} VALUES</button>
            <span className="xr-v" style={{ minWidth: '13ch' }} ref={r('mCount')} />
            <span className="xr-v xr-line" style={{ opacity: 0.6 }} ref={r('mChanges')} />
          </div>
          {showValues && values.map(([name, d]) => (
            <div key={name} className="xr-mv mono">
              <span className="xr-mv-k">{name}{d.kind === 'seg' && d.window ? ` · ${d.window[0].toFixed(2)}–${d.window[1].toFixed(2)}` : ''}</span>
              <span className="xr-mv-v" ref={r(`row:${name}`)} />
              {d.kind !== 'transform' && (
                <span className="xr-mv-bar"><i ref={(el) => { if (el) R.rows.set(name, el); else R.rows.delete(name); }} /></span>
              )}
            </div>
          ))}
        </div>

        {note && (
          <div className="xr-hud-note">
            <p><b>FPS</b> counts Motion frame-loop ticks over a rolling second (N=120, EMA α=.1), timed with the frame timestamp — Motion's own <code>delta</code> is ignored because it is clamped to 1–40 ms. This is main-thread rAF cadence, not compositor presentation. <b>Hz</b> is the 20th-percentile frame interval snapped to a standard rate; there is no web API for refresh rate. <b>Dropped</b> means longer than 1.5× that interval.</p>
            <p><b>Tasks</b> come from <code>PerformanceObserver('longtask')</code>: main-thread work over 50 ms since navigation. Σ(duration − 50) is labelled TBT≈ because true TBT is bounded FCP→TTI.</p>
            <p><b>LCP, FCP, CLS, INP</b> are buffered PerformanceObserver entries graded with web.dev's thresholds. CLS uses the spec's session windows (1 s gap, 5 s max). INP is p98 of max event duration per interaction, this session only, 8 ms granularity — approximate by construction. Safari reports none of the last three: you'll see n/a, not a guess.</p>
            <p><b>Payload</b> is Resource Timing: decoded bytes → bytes on the wire, kB = 1000 B. Fonts say n/a when Google doesn't send Timing-Allow-Origin — not because they weigh nothing.</p>
            <p><b>Renders</b> are a ref incremented during each component's render. The X-RAY row is this panel counting itself; if it climbs while you scroll, I've done something wrong.</p>
            <p><b>Motion</b> reads the page's own MotionValues. The red playhead is the spring, the grey ghost is the raw scroll; "settled" is <code>MotionValue.isAnimating()</code> going false. Boxes follow <code>getBoundingClientRect</code>; nothing here updates text faster than ten times a second.</p>
            <p>Measured in your browser, on your machine. Your numbers will differ from mine.</p>
          </div>
        )}
      </div>

      <div className="xr-hud-status mono" ref={r('status')} />
      <div className="xr-hud-foot mono">
        <span ref={r('dom')} />
        {reduced ? ' · REDUCED MOTION · transitions instant' : ''}
        {!support.longtask || !support.cls || !support.event ? ' · some vitals n/a in this browser' : ''}
      </div>
    </div>
  );
}
