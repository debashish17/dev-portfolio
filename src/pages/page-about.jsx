import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRoute, useMouseParallax, useScrollProgress, easeOut, clamp, remap, LogoMark, Circle, Bar, Triangle, Wedge, Ring, Halftone, SectionMarker } from '../components/primitives.jsx';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handle = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return mobile;
}

// ABOUT PAGE - bio, education, summary
// Layout: split poster — left half is portrait silhouette in halftone + geometric collage,
// right half is structured information in stamped/typed cards.

export default function AboutPage() {
  const scrollRef = useRef(null);
  const progress = useScrollProgress(scrollRef);
  const isMobile = useIsMobile();
  const mouse = useMouseParallax(isMobile ? 0 : 6);

  return (
    <div ref={scrollRef} style={{
      position: 'absolute', inset: 0,
      overflowY: 'auto', overflowX: 'hidden',
      perspective: 1600,
    }}>
      <div style={{ height: '450vh', position: 'relative' }}>
        <div style={{
          position: 'sticky', top: 0,
          height: '100vh', width: '100%', overflow: 'hidden',
        }} className="paper-bg">
          <div className="grid-overlay" style={{ zIndex: 0 }} />

          {/* Camera move */}
          <div style={{
            position: 'absolute', inset: 0,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${-progress * 600}px) translateY(${-progress * 200}vh)`,
          }}>
            <AboutScene1 progress={progress} mouse={mouse} />
            <AboutScene2 progress={progress} mouse={mouse} />
            <AboutScene3 progress={progress} mouse={mouse} />
          </div>

          {/* Section header */}
          <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 10 }}>
            <div className="label" style={{ color: 'var(--red)' }}>FOLIO № II · ABOUT</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Scene 1: Portrait silhouette + name + role
function AboutScene1({ progress, mouse }) {
  // On-mount intro so the ID column is visible immediately
  const [intro, setIntro] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const dt = Math.min(1, (now - start) / 1400);
      setIntro(easeOut(dt));
      if (dt < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const t = Math.max(intro, clamp(remap(progress, 0, 0.2, 0, 1), 0, 1));
  const fade = clamp(1 - remap(progress, 0.28, 0.38, 0, 1), 0, 1);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'grid',
      gridTemplateColumns: '0.9fr 1.1fr',
      transformStyle: 'preserve-3d',
      opacity: fade,
    }} className="about-scene1-grid">
      {/* Left: portrait collage */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transformStyle: 'preserve-3d',
      }}>
        {/* Big black square — peeks top-left */}
        <div style={{
          position: 'absolute',
          width: 320, height: 420,
          background: 'var(--ink)',
          transform: `rotate(-4deg) translate(-70px, -60px) translate(${mouse.x}px, ${mouse.y}px) translateZ(0px)`,
        }} />
        {/* Red circle — bleeds bottom-right */}
        <div style={{
          position: 'absolute',
          width: 460, height: 460,
          background: 'var(--red)',
          borderRadius: '50%',
          transform: `translate(140px, 130px) translate(${mouse.x * 2}px, ${mouse.y * 2}px) translateZ(40px)`,
        }} />
        {/* Halftone strip — bleeds left edge */}
        <div style={{
          position: 'absolute',
          width: 180, height: 460,
          backgroundImage: 'radial-gradient(circle, var(--ink) 1.4px, transparent 2px)',
          backgroundSize: '7px 7px',
          transform: `translate(-160px, 0px) translateZ(80px)`,
          opacity: 0.5,
        }} />
        {/* Portrait silhouette - abstract head shape */}
        <svg viewBox="0 0 200 260" style={{
          position: 'relative',
          width: 280, height: 360,
          transform: `translate(20px, 0) translateZ(120px)`,
        }}>
          {/* Stylized head */}
          <ellipse cx="100" cy="90" rx="60" ry="72" fill="var(--cream)" />
          <path d="M 40 130 Q 40 200 100 220 Q 160 200 160 130 L 160 260 L 40 260 Z" fill="var(--cream)" />
          {/* Geometric facial accent */}
          <rect x="60" y="90" width="80" height="6" fill="var(--ink)" />
          <circle cx="80" cy="80" r="4" fill="var(--ink)" />
          <circle cx="120" cy="80" r="4" fill="var(--ink)" />
          {/* Halftone shading */}
          <rect x="100" y="40" width="60" height="120" fill="url(#halftonePattern)" opacity="0.4" />
          <defs>
            <pattern id="halftonePattern" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1" fill="var(--ink)" />
            </pattern>
          </defs>
        </svg>

        {/* Real photo — stacked on top of shapes */}
        <div style={{
          position: 'absolute',
          width: 340, height: 460,
          top: '50%', left: '50%',
          transform: `translate(-44%, -52%) rotate(-1.5deg) translate(${mouse.x * 1.5}px, ${mouse.y * 1.5}px) translateZ(160px)`,
          border: '5px solid var(--ink)',
          boxShadow: '-12px 12px 0 var(--red)',
          overflow: 'hidden',
          zIndex: 5,
        }}>
          <img
            src="/uploads/photo.jpg"
            alt="Dibya Debashish Bhoi"
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 20%',
              display: 'block',
              filter: 'contrast(1.08) saturate(0.85)',
            }}
          />
        </div>

        {/* Number plate */}
        <div style={{
          position: 'absolute',
          bottom: '15%', left: '15%',
          background: 'var(--ochre)',
          padding: '6px 12px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          fontWeight: 700,
          transform: 'translateZ(200px) rotate(-4deg)',
          zIndex: 6,
        }}>
          SUBJECT · 001
        </div>
      </div>

      {/* Right: identification */}
      <div style={{
        padding: '80px 48px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        gap: 20,
        transform: `translateX(${(1 - t) * 120}px)`,
        zIndex: 5,
        overflowY: 'auto',
      }}>
        <div>
          <div className="label" style={{ color: 'var(--red)' }}>· IDENTIFICATION ·</div>
        </div>
        <div className="display" style={{
          fontSize: 'clamp(48px, 5.5vw, 80px)',
          color: 'var(--ink)',
          letterSpacing: '-0.04em',
        }}>
          DIBYA<br />
          <span style={{ color: 'var(--red)' }}>DEBASHISH</span><br />
          BHOI
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: '8px 16px',
          marginTop: 16,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13,
        }}>
          <div className="label">ROLE</div>
          <div>FULL-STACK · AI / ML</div>
          <div className="label">BASE</div>
          <div>SUNDERGARH, ODISHA · IN</div>
          <div className="label">UNIT</div>
          <div>VIT-AP UNIVERSITY</div>
          <div className="label">FIELD</div>
          <div>B.TECH COMPUTER SCIENCE</div>
          <div className="label">ACTIVE</div>
          <div>2022 — PRESENT</div>
        </div>

        <div style={{
          marginTop: 16,
          fontSize: 16,
          lineHeight: 1.5,
          maxWidth: 480,
          color: 'var(--ink)',
          textWrap: 'pretty',
        }}>
          Computer Science undergraduate building applied ML systems and
          production web platforms. Currently a Full-Stack Developer Intern
          at <strong>Mego Forex</strong>, shipping real-time financial workflows.
        </div>
      </div>
    </div>
  );
}

// Scene 2: Education timeline as constructivist diagram
function AboutScene2({ progress, mouse }) {
  const t = clamp(remap(progress, 0.30, 0.42, 0, 1), 0, 1);
  if (t <= 0) return null;
  const fade = clamp(1 - remap(progress, 0.62, 0.72, 0, 1), 0, 1);

  const edu = [
    { year: '2019', period: '2017 — 2019', school: 'ST. THERESA ENGLISH', level: 'ICSE · X', color: 'var(--ochre)' },
    { year: '2021', period: '2019 — 2021', school: 'ODM PUBLIC SCHOOL', level: 'CBSE · XII', color: 'var(--ink)' },
    { year: '2022—', period: '2022 — PRESENT', school: 'VIT-AP UNIVERSITY', level: 'B.TECH CSE', color: 'var(--red)' },
  ];

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      top: '100vh',
      padding: '80px 64px',
      transformStyle: 'preserve-3d',
      transform: `translateZ(${300}px)`,
      opacity: fade,
    }}>
      <div style={{ marginBottom: 40 }}>
        <SectionMarker num="II.A" label="EDUCATION RECORD" />
      </div>

      <div className="display" style={{
        fontSize: 'clamp(60px, 8vw, 120px)',
        marginBottom: 60,
        transform: `translateX(${(1 - t) * -100}px)`,
        opacity: t,
      }}>
        TRAJECTORY<span style={{ color: 'var(--red)' }}>.</span>
      </div>

      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 24,
        maxWidth: 1100,
      }} className="about-edu-grid">
        {/* Timeline bar */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          top: 80,
          height: 6,
          background: 'var(--ink)',
          transform: `scaleX(${easeOut(t)})`,
          transformOrigin: 'left',
        }} />

        {edu.map((e, i) => {
          const it = clamp(remap(t, 0.2 + i * 0.2, 0.5 + i * 0.2, 0, 1), 0, 1);
          return (
            <div key={i} style={{
              transform: `translateY(${(1 - it) * 60}px) translateZ(${i * 20}px)`,
              opacity: it,
              transformStyle: 'preserve-3d',
            }}>
              <div style={{
                width: 32, height: 32,
                background: e.color,
                margin: '64px auto 0',
                borderRadius: '50%',
                position: 'relative',
                zIndex: 2,
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 8,
                  background: 'var(--cream)',
                  borderRadius: '50%',
                }} />
              </div>
              <div style={{
                marginTop: 24,
                padding: 24,
                background: 'var(--cream)',
                border: '2px solid var(--ink)',
                boxShadow: `8px 8px 0 ${e.color}`,
              }}>
                <div className="mono" style={{ fontSize: 11, color: e.color, marginBottom: 8 }}>
                  {e.period}
                </div>
                <div className="display" style={{ fontSize: 18, marginBottom: 6 }}>
                  {e.school}
                </div>
                <div className="label" style={{ marginBottom: 0 }}>
                  {e.level}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Scene 3: Current Experience
function AboutScene3({ progress, mouse }) {
  const t = clamp(remap(progress, 0.68, 0.82, 0, 1), 0, 1);
  if (t <= 0) return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      top: '200vh',
      padding: '80px 64px',
      transformStyle: 'preserve-3d',
      transform: `translateZ(${600}px)`,
    }}>
      <div style={{ marginBottom: 40 }}>
        <SectionMarker num="II.B" label="CURRENT POST" />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: 48,
        alignItems: 'center',
        maxWidth: 1200,
      }} className="about-exp-grid">
        {/* Left: Big company callout */}
        <div style={{
          position: 'relative',
          padding: '48px 40px',
          background: 'var(--ink)',
          color: 'var(--cream)',
          transform: `translateX(${(1 - t) * -80}px)`,
          opacity: t,
        }}>
          {/* Red corner */}
          <div style={{
            position: 'absolute',
            top: 0, right: 0,
            width: 0, height: 0,
            borderTop: '60px solid var(--red)',
            borderLeft: '60px solid transparent',
          }} />
          <div className="label" style={{ color: 'var(--red)' }}>FEB 2026 — PRESENT</div>
          <div className="display" style={{ fontSize: 'clamp(40px, 5vw, 72px)', marginTop: 12, marginBottom: 8 }}>
            MEGO FOREX
          </div>
          <div className="label" style={{ color: 'var(--ochre)', marginBottom: 24 }}>
            FULL-STACK DEVELOPER INTERN · REMOTE
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85, maxWidth: 500 }}>
            Building production Forex services in <strong>React + NestJS + PostgreSQL</strong>.
            Integrating live currency exchange rate vendors, payment gateways, and
            third-party Forex data providers. Designing RESTful APIs and database
            schemas for real-time transaction workflows.
          </div>
        </div>

        {/* Right: stat blocks */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          transform: `translateX(${(1 - t) * 80}px)`,
          opacity: t,
        }} className="about-stat-grid">
          {[
            { n: '03', l: 'CORE STACK', v: 'React · NestJS · PG', c: 'var(--red)' },
            { n: 'API', l: 'INTEGRATIONS', v: 'Live FX · Gateway', c: 'var(--ink)' },
            { n: 'RT', l: 'WORKFLOWS', v: 'Real-time Txn', c: 'var(--ochre)' },
            { n: 'SEC', l: 'DOMAIN', v: 'Financial Data', c: 'var(--ink)' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: 20,
              background: 'var(--cream)',
              border: `2px solid var(--ink)`,
              boxShadow: `4px 4px 0 ${s.c}`,
              minHeight: 130,
            }}>
              <div style={{
                fontFamily: 'Bodoni Moda, serif',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 36,
                color: s.c,
                lineHeight: 1,
              }}>{s.n}</div>
              <div className="label" style={{ marginTop: 8 }}>{s.l}</div>
              <div className="mono" style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.AboutPage = AboutPage;

