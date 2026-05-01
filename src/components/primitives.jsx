import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react';
// Shared geometric primitives & utilities
// Constructivist building blocks: circles, triangles, bars, halftones

// ---------- ROUTER ----------
export const RouteContext = createContext({ route: 'home', go: () => {} });
export const useRoute = () => useContext(RouteContext);

// ---------- SHAPES ----------
export function Circle({ size = 100, color = 'var(--red)', x = 0, y = 0, z = 0, opacity = 1, style = {} }) {
  return (
    <div
      className="shape shape-circle"
      style={{
        width: size,
        height: size,
        background: color,
        left: x,
        top: y,
        opacity,
        transform: `translateZ(${z}px)`,
        ...style,
      }}
    />
  );
}

export function Bar({ w = 200, h = 20, color = 'var(--ink)', x = 0, y = 0, z = 0, rotate = 0, opacity = 1, style = {} }) {
  return (
    <div
      className="shape"
      style={{
        width: w,
        height: h,
        background: color,
        left: x,
        top: y,
        opacity,
        transformOrigin: '0% 50%',
        transform: `translateZ(${z}px) rotate(${rotate}deg)`,
        ...style,
      }}
    />
  );
}

export function Triangle({ size = 100, color = 'var(--red)', x = 0, y = 0, z = 0, rotate = 0, opacity = 1, dir = 'up', style = {} }) {
  const clip = {
    up: 'polygon(50% 0, 100% 100%, 0 100%)',
    down: 'polygon(50% 100%, 100% 0, 0 0)',
    left: 'polygon(0 50%, 100% 0, 100% 100%)',
    right: 'polygon(100% 50%, 0 0, 0 100%)',
  }[dir];
  return (
    <div
      className="shape"
      style={{
        width: size,
        height: size,
        background: color,
        clipPath: clip,
        left: x,
        top: y,
        opacity,
        transform: `translateZ(${z}px) rotate(${rotate}deg)`,
        ...style,
      }}
    />
  );
}

export function Wedge({ size = 200, color = 'var(--red)', x = 0, y = 0, z = 0, rotate = 0, opacity = 1, style = {} }) {
  // half-circle wedge
  return (
    <div
      className="shape"
      style={{
        width: size,
        height: size / 2,
        background: color,
        borderRadius: `${size}px ${size}px 0 0`,
        left: x,
        top: y,
        opacity,
        transformOrigin: '50% 100%',
        transform: `translateZ(${z}px) rotate(${rotate}deg)`,
        ...style,
      }}
    />
  );
}

export function Ring({ size = 100, thickness = 8, color = 'var(--red)', x = 0, y = 0, z = 0, opacity = 1, style = {} }) {
  return (
    <div
      className="shape"
      style={{
        width: size,
        height: size,
        border: `${thickness}px solid ${color}`,
        borderRadius: '50%',
        left: x,
        top: y,
        opacity,
        transform: `translateZ(${z}px)`,
        background: 'transparent',
        ...style,
      }}
    />
  );
}

export function Halftone({ w = 200, h = 200, x = 0, y = 0, z = 0, rotate = 0, opacity = 1, dotColor = 'var(--ink)', size = 6, style = {} }) {
  return (
    <div
      className="shape"
      style={{
        width: w,
        height: h,
        backgroundImage: `radial-gradient(circle, ${dotColor} 1.2px, transparent 1.8px)`,
        backgroundSize: `${size}px ${size}px`,
        left: x,
        top: y,
        opacity,
        transform: `translateZ(${z}px) rotate(${rotate}deg)`,
        ...style,
      }}
    />
  );
}

// ---------- LOGO MARK ----------
export function LogoMark({ size = 80, animate = false }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block' }}>
      <g>
        {/* Big red circle */}
        <circle cx="50" cy="50" r="42" fill="var(--red)" />
        {/* Black wedge */}
        <path d="M 50 50 L 50 8 A 42 42 0 0 1 92 50 Z" fill="var(--ink)" />
        {/* Diagonal bar */}
        <rect x="10" y="46" width="80" height="8" fill="var(--ink)" transform="rotate(-22 50 50)" />
        {/* Inner dot */}
        <circle cx="50" cy="50" r="6" fill="var(--cream)" />
        {animate && (
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--ink)" strokeWidth="1" strokeDasharray="3 3">
            <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="40s" repeatCount="indefinite" />
          </circle>
        )}
      </g>
    </svg>
  );
}

// ---------- CURSOR ----------
export function CustomCursor() {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const move = (e) => {
      if (ref.current) {
        ref.current.style.left = e.clientX + 'px';
        ref.current.style.top = e.clientY + 'px';
      }
    };
    const over = (e) => {
      const t = e.target;
      if (t.closest && t.closest('[data-magnet], button, a, .nav-item, .clickable')) {
        setExpanded(true);
      } else {
        setExpanded(false);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseover', over);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', over);
    };
  }, []);

  return <div ref={ref} className={`cursor-dot ${expanded ? 'expanded' : ''}`} />;
}

// ---------- MOUSE PARALLAX HOOK ----------
export function useMouseParallax(strength = 1) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handle = (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setPos({
        x: ((e.clientX - cx) / cx) * strength,
        y: ((e.clientY - cy) / cy) * strength,
      });
    };
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, [strength]);
  return pos;
}

// ---------- SCROLL HOOK ----------
export function useScrollProgress(ref) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? el.scrollTop / max : 0);
    };
    el.addEventListener('scroll', handle, { passive: true });
    handle();
    return () => el.removeEventListener('scroll', handle);
  }, []);
  return progress;
}

// ---------- INTERPOLATION ----------
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const remap = (v, inMin, inMax, outMin, outMax) =>
  outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ---------- LIVE CLOCK ----------
export function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const utc = time.toISOString().substr(11, 8);
  return <span className="mono nav-clock">UTC {utc}</span>;
}

// ---------- SECTION CHROME ----------
export function SectionMarker({ num, label, color = 'var(--ink)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 38, height: 38, background: color, color: 'var(--cream)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14,
      }}>{num}</div>
      <div className="label" style={{ color }}>{label}</div>
      <div style={{ width: 60, height: 2, background: color }} />
    </div>
  );
}



