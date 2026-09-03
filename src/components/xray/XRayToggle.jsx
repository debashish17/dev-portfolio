import React, { useEffect, useState } from 'react';
import { uiStore } from '../../lib/xray/store.js';
import { useXRayUi } from './hooks.js';

// The nav-rail chip. Also owns the one-time discoverability hint that drops
// from the chip after the loader: shown once per browser, dismissed by any
// keystroke or a click, never by scroll.

const HINT_KEY = 'xr.hint.v1';
const hintSeen = () => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return true; } };
const markHint = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ } };
const isTouch = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

export default function XRayToggle({ loading }) {
  const { on } = useXRayUi();
  const [hint, setHint] = useState(0); // 0 hidden · 1 showing · 2 leaving

  useEffect(() => {
    if (loading || hintSeen()) return;
    let leave, gone;
    const show = setTimeout(() => {
      if (uiStore.get().on) return;
      if (new URLSearchParams(location.search).get('xray') === '1') return;
      markHint();
      setHint(1);
      leave = setTimeout(() => setHint(2), 3200);
      gone = setTimeout(() => setHint(0), 3200 + 220);
    }, 1400);
    const dismiss = () => { setHint((h) => (h === 1 ? 2 : h)); setTimeout(() => setHint(0), 220); };
    window.addEventListener('keydown', dismiss, { once: true });
    return () => {
      clearTimeout(show); clearTimeout(leave); clearTimeout(gone);
      window.removeEventListener('keydown', dismiss);
    };
  }, [loading]);

  return (
    <button
      type="button"
      className={`xr-toggle mono clickable${on ? ' is-on' : ''}`}
      data-magnet
      aria-pressed={on}
      aria-keyshortcuts="x"
      aria-label="Toggle X-ray mode (shortcut X)"
      title="X-ray · press X"
      onClick={() => { setHint(0); uiStore.toggle(); }}
    >
      <svg className="xr-toggle-glyph" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M6 0v2.5M6 9.5V12M0 6h2.5M9.5 6H12" stroke="currentColor" strokeWidth="1" />
        <circle className="dot" cx="6" cy="6" r="1.4" fill="currentColor" />
      </svg>
      X-RAY
      {hint !== 0 && (
        <span className={`xr-hint mono${hint === 2 ? ' is-leaving' : ''}`} role="status">
          {isTouch() ? 'TAP · SEE THE ENGINE' : 'PRESS X · SEE THE ENGINE'}
        </span>
      )}
    </button>
  );
}
