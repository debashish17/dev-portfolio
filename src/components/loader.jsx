import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LogoMark, easeOut, clamp, remap, Triangle, Wedge } from './primitives.jsx';
// Loader - constructivist intro sequence
// 1. Diagonal red bars sweep
// 2. Geometric shapes assemble into the logomark
// 3. Title flashes
// 4. Curtain pulls away

export default function Loader({ onDone }) {
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const total = 3200;
    let raf;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / total);
      setProgress(t);
      if (t < 0.25) setPhase(0);
      else if (t < 0.55) setPhase(1);
      else if (t < 0.85) setPhase(2);
      else setPhase(3);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setTimeout(onDone, 400);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Phase 0: bars sweeping in
  // Phase 1: shapes assembling
  // Phase 2: full mark + name
  // Phase 3: peeling away

  const peelT = phase === 3 ? remap(progress, 0.85, 1, 0, 1) : 0;
  const assembleT = clamp(remap(progress, 0.25, 0.55, 0, 1), 0, 1);
  const titleT = clamp(remap(progress, 0.55, 0.75, 0, 1), 0, 1);
  const sweepT = clamp(remap(progress, 0, 0.3, 0, 1), 0, 1);

  return (
    <div className="loader-stage" style={{
      transform: `translateY(${-peelT * 100}%)`,
      transition: peelT > 0 ? 'transform 0.6s cubic-bezier(.7,0,.3,1)' : 'none',
    }}>
      {/* Background red diagonal bars */}
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
      }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            position: 'absolute',
            width: '200%',
            height: 80,
            background: i % 2 ? 'var(--red)' : 'var(--ink)',
            left: '-50%',
            top: `${15 + i * 20}%`,
            transform: `rotate(-12deg) translateX(${(1 - sweepT) * (i % 2 ? -120 : 120)}%)`,
            transition: 'transform 0.1s linear',
          }} />
        ))}
      </div>

      {/* Center mark assembly */}
      <div style={{
        position: 'relative',
        width: 320, height: 320,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Big circle */}
        <div style={{
          position: 'absolute',
          width: 240, height: 240,
          borderRadius: '50%',
          background: 'var(--red)',
          transform: `scale(${easeOut(assembleT)}) rotate(${(1 - assembleT) * 90}deg)`,
          opacity: assembleT,
        }} />
        {/* Black wedge */}
        <div style={{
          position: 'absolute',
          width: 240, height: 120,
          background: 'var(--ink)',
          borderRadius: '240px 240px 0 0',
          top: 40,
          transform: `scaleY(${easeOut(assembleT)})`,
          transformOrigin: 'bottom',
          opacity: assembleT,
        }} />
        {/* Diagonal cream bar */}
        <div style={{
          position: 'absolute',
          width: 280, height: 24,
          background: 'var(--cream)',
          transform: `rotate(-22deg) scaleX(${easeOut(clamp(remap(progress, 0.4, 0.6, 0, 1), 0, 1))})`,
          transformOrigin: 'left',
          left: 'calc(50% - 140px)',
        }} />
        {/* Inner dot */}
        <div style={{
          position: 'absolute',
          width: 32, height: 32,
          background: 'var(--cream)',
          borderRadius: '50%',
          transform: `scale(${easeOut(clamp(remap(progress, 0.5, 0.65, 0, 1), 0, 1))})`,
        }} />

        {/* Rotating ring */}
        <div style={{
          position: 'absolute',
          width: 300, height: 300,
          border: '2px solid var(--ink)',
          borderRadius: '50%',
          borderStyle: 'dashed',
          opacity: titleT * 0.6,
          transform: `rotate(${progress * 180}deg)`,
        }} />
      </div>

      {/* Title */}
      <div style={{
        position: 'absolute',
        bottom: '15%',
        left: 0, right: 0,
        textAlign: 'center',
        opacity: titleT,
        transform: `translateY(${(1 - titleT) * 30}px)`,
      }}>
        <div className="display" style={{ fontSize: 'clamp(32px, 9vw, 72px)', color: 'var(--ink)', letterSpacing: '-0.04em' }}>
          DEBASHISH<span style={{ color: 'var(--red)' }}>.</span>
        </div>
        <div className="label" style={{ marginTop: 12, color: 'var(--ink)' }}>
          PORTFOLIO · ESTABLISHED 2026
        </div>
      </div>

      {/* Top-left registration marks */}
      <div style={{ position: 'absolute', top: 24, left: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink)' }}>
          LOAD · {String(Math.floor(progress * 100)).padStart(3, '0')}%
        </div>
        <div style={{ width: 200, height: 4, background: 'rgba(10,10,10,0.15)' }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--red)' }} />
        </div>
      </div>

      {/* Bottom-right marks */}
      <div style={{ position: 'absolute', bottom: 24, right: 24, textAlign: 'right' }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink)', opacity: 0.6 }}>
          NO. 001 / SERIES A
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink)', opacity: 0.6 }}>
          DEBASHISH BHOI · IN
        </div>
      </div>

      {/* Corner triangles */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 0, height: 0,
        borderTop: '120px solid var(--ochre)',
        borderLeft: '120px solid transparent',
        opacity: sweepT,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        width: 0, height: 0,
        borderBottom: '80px solid var(--ink)',
        borderRight: '80px solid transparent',
        opacity: sweepT,
      }} />
    </div>
  );
}

window.Loader = Loader;

