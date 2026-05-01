import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRoute, useMouseParallax, useScrollProgress, easeOut, clamp, remap, LogoMark, Circle, Bar, Triangle, Wedge, Ring, Halftone } from '../components/primitives.jsx';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handle = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return mobile;
}
// HOME / HERO PAGE
// Multi-act scroll experience:
//   Act 1 (0.0–0.25): Title assembles from flying shapes
//   Act 2 (0.25–0.55): Manifesto / role tag — shapes orbit
//   Act 3 (0.55–0.85): Skill grid emerges, halftone portrait silhouette
//   Act 4 (0.85–1.00): "Enter the work" exit ramp

function DesktopHomePage() {
  const scrollRef = useRef(null);
  const stageRef = useRef(null);
  const progress = useScrollProgress(scrollRef);
  const isMobile = useIsMobile();
  const mouse = useMouseParallax(isMobile ? 0 : 8);
  const { go } = useRoute();

  // On-mount intro animation
  const [intro, setIntro] = useState(1);
  useEffect(() => {
    setIntro(0);
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const dt = Math.min(1, (now - start) / 1200);
      setIntro(easeOut(dt));
      if (dt < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Act timing — a1 is visible immediately (intro), fades out as scroll begins
  const a1 = Math.max(intro, 0.001) * clamp(1 - remap(progress, 0.15, 0.30, 0, 1), 0, 1);
  const a2 = clamp(remap(progress, 0.20, 0.55, 0, 1), 0, 1);
  const a3 = clamp(remap(progress, 0.50, 0.85, 0, 1), 0, 1);
  const a4 = clamp(remap(progress, 0.80, 1.00, 0, 1), 0, 1);

  // Camera moves through Z based on scroll
  const cameraZ = progress * 1200;
  const cameraRotX = progress * -8;

  return (
    <div ref={scrollRef} style={{
      position: 'absolute', inset: 0,
      overflowY: 'auto', overflowX: 'hidden',
      perspective: 1800,
      perspectiveOrigin: '50% 40%',
    }}>
      {/* Tall scroll spacer */}
      <div style={{ height: '500vh', position: 'relative' }}>
        {/* Sticky stage */}
        <div ref={stageRef} style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          width: '100%',
          overflow: 'hidden',
        }} className="paper-bg">

          {/* Background grid */}
          <div className="grid-overlay" />

          {/* Persistent corner blocks */}
          <CornerChrome progress={progress} mouse={mouse} />

          {/* The 3D canvas */}
          <div style={{
            position: 'absolute', inset: 0,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${-cameraZ}px) rotateX(${cameraRotX}deg)`,
            transition: 'none',
          }}>
            <Act1Title t={a1} mouse={mouse} />
            <Act2Manifesto t={a2} mouse={mouse} progress={progress} />
            <Act3Skills t={a3} mouse={mouse} />
            {/* Arrow bar decoration stays in 3D */}
            <Act4Decor t={a4} />
          </div>

          {/* Act4 CTA rendered OUTSIDE 3D canvas — flat overlay, reliable click events */}
          <Act4Exit t={a4} go={go} />

          {/* Mobile quick-nav: bypasses the 500vh scroll experience on small screens */}
          <MobileQuickNav go={go} isMobile={isMobile} />

          {/* Progress dial */}
          <ProgressDial progress={progress} />
        </div>
      </div>
    </div>
  );
}

// =================== CORNER CHROME ===================
function CornerChrome({ progress, mouse }) {
  return (
    <>
      {/* Top-left index */}
      <div style={{
        position: 'absolute', top: 24, left: 24, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div className="label" style={{ color: 'var(--red)' }}>FOLIO № I</div>
        <div className="mono" style={{ fontSize: 10, opacity: 0.6 }}>
          SECTION · {progress < 0.25 ? 'I' : progress < 0.55 ? 'II' : progress < 0.85 ? 'III' : 'IV'}
        </div>
      </div>

      {/* Bottom-left vertical text */}
      <div style={{
        position: 'absolute', bottom: 24, left: 24, zIndex: 10,
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
      }}>
        <div className="mono" style={{ fontSize: 10, opacity: 0.5, letterSpacing: '0.3em' }}>
          DIBYA·DEBASHISH·BHOI · 26
        </div>
      </div>


    </>
  );
}

// =================== ACT 1 : TITLE ===================
function Act1Title({ t, mouse }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transformStyle: 'preserve-3d',
      opacity: t,
    }}>
      {/* Big red circle behind */}
      <div style={{
        position: 'absolute',
        width: '70vh', height: '70vh',
        borderRadius: '50%',
        background: 'var(--red)',
        left: 'calc(50% - 35vh)',
        top: 'calc(50% - 35vh)',
        transform: `translateZ(-200px) translate(${mouse.x * 2}px, ${mouse.y * 2}px) scale(${easeOut(t)})`,
      }} />

      {/* Black wedge */}
      <div style={{
        position: 'absolute',
        width: '50vh', height: '25vh',
        background: 'var(--ink)',
        borderRadius: '50vh 50vh 0 0',
        left: 'calc(50% - 25vh)',
        top: 'calc(50% - 30vh)',
        transform: `translateZ(-100px) scaleY(${easeOut(t)})`,
        transformOrigin: 'bottom',
      }} />

      {/* Diagonal yellow bar */}
      <div style={{
        position: 'absolute',
        width: '120vw', height: 28,
        background: 'var(--ochre)',
        top: '52%',
        left: '-10vw',
        transform: `rotate(-22deg) translateX(${(1 - t) * -100}%) translateZ(50px)`,
      }} />

      {/* The name - render twice: black layer + cream layer clipped to red disc */}
      <NameStack t={t} mouse={mouse} />

      {/* Subtitle */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: 0, right: 0,
        textAlign: 'center',
        zIndex: 20,
        pointerEvents: 'none',
      }}>
        <div className="label" style={{ color: 'var(--cream)', background: 'var(--ink)', padding: '6px 16px', display: 'inline-block' }}>
          BUILDER · CSE · INDIA
        </div>
      </div>
    </div>
  );
}

function NameStack({ t, mouse }) {
  // Disc in screen coordinates: 70vh wide, centered. We use a circular clip-path
  // that uses px from the viewport's center. Translate the disc center based on mouse
  // (matches the disc's transform).
  const dx = (mouse?.x || 0) * 2;
  const dy = (mouse?.y || 0) * 2;
  // 35vh radius. clip-path circle uses pixels relative to the element's box.
  // Letters wrapper is centered at 50/50 of the viewport because parent is flex-center.
  // We can express clip-path with a CSS calc using vh.
  const clipDisc = `circle(35vh at calc(50% + ${dx}px - 50% + 50%) calc(50% + ${dy}px))`;
  // Simpler: place the cream layer absolutely over the page area and clip to the disc.
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transformStyle: 'preserve-3d',
      pointerEvents: 'none',
    }}>
      {/* Layer 1: ink letters everywhere */}
      <div style={{ position: 'relative', textAlign: 'center', transformStyle: 'preserve-3d' }}>
        <NameLetters t={t} colorMode="ink" />
      </div>
      {/* Layer 2: cream letters, clipped to the red disc only — gives the invert effect */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        clipPath: `circle(35vh at calc(50% + ${dx}px) calc(50% + ${dy}px))`,
        WebkitClipPath: `circle(35vh at calc(50% + ${dx}px) calc(50% + ${dy}px))`,
      }}>
        <div style={{ position: 'relative', textAlign: 'center', transformStyle: 'preserve-3d' }}>
          <NameLetters t={t} colorMode="cream" />
        </div>
      </div>
    </div>
  );
}

function NameLetters({ t, colorMode = 'ink' }) {
  const lines = ['DIBYA', 'DEBASHISH', 'BHOI'];
  return (
    <div style={{
      lineHeight: 0.82,
      fontFamily: 'Archivo Black, sans-serif',
      fontWeight: 900,
      textTransform: 'uppercase',
      letterSpacing: '-0.04em',
      transformStyle: 'preserve-3d',
    }}>
      {lines.map((line, li) => {
        const lt = clamp(remap(t, li * 0.15, 0.4 + li * 0.15, 0, 1), 0, 1);
        const size = li === 1 ? 'clamp(70px, 12vw, 200px)' : 'clamp(80px, 14vw, 220px)';
        // colorMode "ink" = whole name dark; "cream" = whole name light (used inside disc clip)
        const color = colorMode === 'cream' ? 'var(--cream)' : 'var(--ink)';
        const offset = li === 1 ? -60 : 0;
        return (
          <div key={li} style={{
            fontSize: size,
            color,
            transform: `translateX(${(1 - lt) * (li % 2 ? 200 : -200)}px) translateZ(${li * 30}px) rotateY(${(1 - lt) * 30}deg)`,
            opacity: lt,
            marginLeft: offset,
          }}>
            {line}
          </div>
        );
      })}
    </div>
  );
}

// =================== ACT 2 : MANIFESTO ===================
function Act2Manifesto({ t, mouse, progress }) {
  if (t <= 0) return null;
  const fade = clamp(1 - remap(t, 0.75, 1, 0, 1), 0, 1) * clamp(remap(t, 0, 0.2, 0, 1), 0, 1);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transformStyle: 'preserve-3d',
      transform: `translateZ(${600 + t * 200}px)`,
      opacity: fade,
    }}>
      {/* Big halftone slab */}
      <div style={{
        position: 'absolute',
        width: 480, height: 480,
        backgroundImage: 'radial-gradient(circle, var(--ink) 1.5px, transparent 2px)',
        backgroundSize: '8px 8px',
        left: 'calc(50% - 600px)',
        top: 'calc(50% - 240px)',
        transform: `translateZ(-50px) rotate(-8deg) translate(${mouse.x * 4}px, ${mouse.y * 4}px)`,
        opacity: 0.4,
      }} />

      {/* Big red disc */}
      <div style={{
        position: 'absolute',
        width: 380, height: 380,
        background: 'var(--red)',
        borderRadius: '50%',
        right: 'calc(50% - 580px)',
        top: 'calc(50% - 190px)',
        transform: `translateZ(-100px) translate(${mouse.x * 6}px, ${mouse.y * 6}px)`,
      }} />

      {/* White ring */}
      <div style={{
        position: 'absolute',
        width: 380, height: 380,
        border: '8px solid var(--ink)',
        borderRadius: '50%',
        right: 'calc(50% - 600px)',
        top: 'calc(50% - 200px)',
        transform: `translateZ(-90px) translate(${mouse.x * 6}px, ${mouse.y * 6}px)`,
      }} />

      {/* Manifesto text block */}
      <div style={{
        position: 'relative',
        maxWidth: 720,
        padding: '40px 48px',
        background: 'var(--cream)',
        border: '3px solid var(--ink)',
        boxShadow: '12px 12px 0 var(--red)',
        transformStyle: 'preserve-3d',
        transform: `rotate(-1deg)`,
      }}>
        <div className="label" style={{ color: 'var(--red)', marginBottom: 24 }}>· MANIFESTO ·</div>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif',
          fontSize: 'clamp(28px, 3.5vw, 48px)',
          lineHeight: 1.05,
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          textWrap: 'balance',
        }}>
          I build <span style={{ color: 'var(--red)' }}>intelligent</span> systems —
          <br />from <span style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '0 6px' }}>L·L·M</span> vulnerability detectors
          <br />to <span style={{ textDecoration: 'underline', textDecorationColor: 'var(--red)', textDecorationThickness: 6 }}>real-time</span> collaboration platforms.
        </div>
        <div style={{
          marginTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        }}>
          <div className="mono" style={{ fontSize: 12, opacity: 0.6 }}>
            VIT-AP · CSE · 2022—<br />Mego Forex · Full-Stack
          </div>
          <div style={{
            width: 60, height: 60,
            background: 'var(--ochre)',
            clipPath: 'polygon(50% 0, 100% 100%, 0 100%)',
          }} />
        </div>
      </div>
    </div>
  );
}

// =================== ACT 3 : SKILLS ===================
function Act3Skills({ t, mouse }) {
  if (t <= 0) return null;
  const fade = clamp(1 - remap(t, 0.8, 1, 0, 1), 0, 1) * clamp(remap(t, 0, 0.15, 0, 1), 0, 1);

  const skills = [
    { name: 'REACT', cat: 'WEB' },
    { name: 'TYPESCRIPT', cat: 'WEB' },
    { name: 'NODEJS', cat: 'RUNTIME' },
    { name: 'FASTAPI', cat: 'API' },
    { name: 'NESTJS', cat: 'API' },
    { name: 'POSTGRES', cat: 'DATA' },
    { name: 'DOCKER', cat: 'OPS' },
    { name: 'PYTHON', cat: 'CORE' },
    { name: 'WEBRTC', cat: 'REALTIME' },
    { name: 'LANGCHAIN', cat: 'AI' },
    { name: 'NEXTJS', cat: 'WEB' },
    { name: 'MONGODB', cat: 'DATA' },
  ];

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transformStyle: 'preserve-3d',
      transform: `translateZ(${1100 + t * 100}px)`,
      opacity: fade,
    }}>
      {/* Background poster shapes */}
      <div style={{
        position: 'absolute', inset: 0,
        transformStyle: 'preserve-3d',
      }}>
        <div style={{
          position: 'absolute',
          left: '8%', top: '15%',
          width: 200, height: 200,
          background: 'var(--ink)',
          transform: `rotate(15deg) translate(${mouse.x * 3}px, ${mouse.y * 3}px)`,
        }} />
        <div style={{
          position: 'absolute',
          right: '10%', bottom: '15%',
          width: 280, height: 280,
          background: 'var(--red)',
          borderRadius: '50%',
          transform: `translate(${mouse.x * 5}px, ${mouse.y * 5}px)`,
        }} />
        <div style={{
          position: 'absolute',
          right: '8%', top: '12%',
          width: 0, height: 0,
          borderTop: '120px solid var(--ochre)',
          borderLeft: '120px solid transparent',
          transform: `translate(${mouse.x * 4}px, ${mouse.y * 4}px)`,
        }} />
      </div>

      {/* Title */}
      <div style={{
        position: 'absolute',
        top: '12%',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
      }}>
        <div className="label" style={{ color: 'var(--red)', marginBottom: 12 }}>SECTION III · INSTRUMENTS</div>
        <div className="display" style={{ fontSize: 'clamp(48px, 6vw, 84px)', color: 'var(--ink)' }}>
          THE TOOLBOX
        </div>
      </div>

      {/* Skill grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 0,
        width: 'min(900px, 80vw)',
        marginTop: 100,
        border: '3px solid var(--ink)',
        background: 'var(--ink)',
      }}>
        {skills.map((s, i) => {
          const it = clamp(remap(t, i * 0.03, 0.3 + i * 0.03, 0, 1), 0, 1);
          const isRed = i % 7 === 3;
          return (
            <div key={s.name} data-magnet style={{
              padding: '24px 16px',
              background: isRed ? 'var(--red)' : 'var(--cream)',
              color: isRed ? 'var(--cream)' : 'var(--ink)',
              border: '1px solid var(--ink)',
              transform: `translateY(${(1 - it) * 60}px) rotateX(${(1 - it) * 60}deg)`,
              opacity: it,
              transformOrigin: 'top',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
              onMouseEnter={(e) => {
                if (!isRed) { e.currentTarget.style.background = 'var(--ochre)'; }
              }}
              onMouseLeave={(e) => {
                if (!isRed) { e.currentTarget.style.background = 'var(--cream)'; }
              }}
            >
              <div className="mono" style={{ fontSize: 9, opacity: 0.5, marginBottom: 6 }}>
                {String(i + 1).padStart(2, '0')} · {s.cat}
              </div>
              <div className="display" style={{ fontSize: 18, letterSpacing: '-0.02em' }}>
                {s.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =================== ACT 4 : DECORATIVE arrow (stays in 3D canvas) ===================
function Act4Decor({ t }) {
  if (t <= 0) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      transformStyle: 'preserve-3d',
      transform: 'translateZ(1700px)',
      opacity: t,
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute',
        width: '80vw', height: 8,
        background: 'var(--red)',
        top: '50%', left: '10vw',
        transform: `scaleX(${easeOut(t)})`,
        transformOrigin: 'left',
      }} />
    </div>
  );
}

// =================== ACT 4 : EXIT CTA (flat 2D overlay — reliable hit-testing) ===================
function Act4Exit({ t, go }) {
  if (t <= 0) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 20,
      pointerEvents: t > 0.3 ? 'auto' : 'none',
      opacity: t,
    }}>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div className="label" style={{ color: 'var(--red)', marginBottom: 16 }}>NEXT TRANSMISSION</div>
        <div className="display" style={{ fontSize: 'clamp(44px, 9vw, 140px)', color: 'var(--ink)', marginBottom: 32, lineHeight: 0.85 }}>
          TO THE<br />WORK<span style={{ color: 'var(--red)' }}>.</span>
        </div>
        <button className="btn-block clickable" style={{ margin: '0 auto' }} onClick={() => go('work')}>
          ENTER ARCHIVE <span style={{ fontSize: 18 }}>→</span>
        </button>
      </div>
    </div>
  );
}

// =================== MOBILE QUICK NAV ===================
function MobileQuickNav({ go, isMobile }) {
  if (!isMobile) return null;
  const sections = [
    { id: 'about', label: 'ABOUT' },
    { id: 'work', label: 'WORK' },
    { id: 'achievements', label: 'HONOURS' },
    { id: 'contact', label: 'TRANSMIT' },
  ];
  return (
    <div style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      zIndex: 30,
      background: 'var(--ink)',
      borderTop: '2px solid var(--red)',
      padding: '16px 20px 20px',
    }}>
      <div className="label" style={{ color: 'var(--red)', marginBottom: 12 }}>NAVIGATE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => go(s.id)} style={{
            background: s.id === 'work' ? 'var(--red)' : 'transparent',
            color: 'var(--cream)',
            border: '1px solid rgba(242,234,211,0.3)',
            padding: '12px 16px',
            fontFamily: 'Archivo, sans-serif',
            fontWeight: 700,
            letterSpacing: '0.15em',
            fontSize: 11,
            textTransform: 'uppercase',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            {s.label} <span style={{ opacity: 0.6 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// =================== DIAL ===================

function ProgressDial({ progress }) {
  const angle = progress * 360;
  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      right: 24,
      transform: 'translateY(-50%)',
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.2" />
        <circle
          cx="24" cy="24" r="20"
          fill="none"
          stroke="var(--red)"
          strokeWidth="3"
          strokeDasharray={`${progress * 125.6} 125.6`}
          transform="rotate(-90 24 24)"
        />
        <circle cx="24" cy="24" r="3" fill="var(--ink)" />
      </svg>
      <div className="mono" style={{ fontSize: 10, opacity: 0.6 }}>
        {String(Math.floor(progress * 100)).padStart(2, '0')}
      </div>
    </div>
  );
}

// =================== MOBILE REVEAL HOOK ===================
function useMobileReveal(threshold = 0.2) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// =================== MOBILE HOME PAGE ===================
function MobileHomePage() {
  const { go } = useRoute();
  return (
    <div data-mobile-scroll style={{
      position: 'absolute', inset: 0,
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      <MobileHeroSection />
      <MobileManifestoSection />
      <MobileSkillsSection />
      <MobileQuickNav go={go} isMobile={true} />
    </div>
  );
}

function MobileHeroSection() {
  const [introT, setIntroT] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const dt = Math.min(1, (now - start) / 1200);
      setIntroT(easeOut(dt));
      if (dt < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const container = document.querySelector('[data-mobile-scroll]');
    if (!container) return;
    const handle = () => setScrolled(container.scrollTop > 50);
    container.addEventListener('scroll', handle, { passive: true });
    return () => container.removeEventListener('scroll', handle);
  }, []);

  const lines = ['DIBYA', 'DEBASHISH', 'BHOI'];

  return (
    <div className="paper-bg" style={{
      position: 'relative',
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: '80px 24px 140px',
    }}>
      <div className="grid-overlay" />

      {/* Top-left label */}
      <div style={{ position: 'absolute', top: 16, left: 20, zIndex: 10 }}>
        <div className="label" style={{ color: 'var(--red)', fontSize: 9 }}>FOLIO № I</div>
      </div>

      {/* Big red circle behind name */}
      <div style={{
        position: 'absolute',
        width: '80vw', height: '80vw',
        maxWidth: 360, maxHeight: 360,
        borderRadius: '50%',
        background: 'var(--red)',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -54%)',
        zIndex: 1,
      }} />


      {/* Name */}
      <div style={{
        position: 'relative',
        zIndex: 5,
        textAlign: 'center',
        fontFamily: 'Archivo Black, sans-serif',
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '-0.04em',
        lineHeight: 0.85,
      }}>
        {lines.map((line, li) => {
          const lt = clamp(remap(introT, li * 0.15, 0.4 + li * 0.15, 0, 1), 0, 1);
          const size = li === 1 ? 'clamp(52px, 13vw, 80px)' : 'clamp(60px, 15vw, 90px)';
          return (
            <div key={li} style={{
              fontSize: size,
              color: 'var(--ink)',
              transform: `translateX(${(1 - lt) * (li % 2 ? 60 : -60)}px)`,
              opacity: lt,
            }}>
              {line}
            </div>
          );
        })}
      </div>

      {/* Subtitle */}
      <div className="label" style={{
        position: 'relative', zIndex: 5,
        color: 'var(--cream)',
        background: 'var(--ink)',
        padding: '6px 14px',
        marginTop: 20,
        opacity: introT,
      }}>
        BUILDER · CSE · INDIA
      </div>

      {/* Scroll hint */}
      <div style={{
        position: 'absolute',
        bottom: 88,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        opacity: scrolled ? 0 : introT,
        transition: 'opacity 0.4s',
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: '0.3em', opacity: 0.6 }}>SCROLL</div>
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none" style={{ animation: 'mobileScrollBounce 1.6s ease-in-out infinite' }}>
          <path d="M8 2 L8 18 M3 13 L8 18 L13 13" stroke="var(--ink)" strokeWidth="2" strokeLinecap="square"/>
        </svg>
        <style>{`@keyframes mobileScrollBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(5px); } }`}</style>
      </div>
    </div>
  );
}

function MobileManifestoSection() {
  const [ref, visible] = useMobileReveal(0.2);
  return (
    <div ref={ref} style={{
      position: 'relative',
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      overflow: 'hidden',
    }} className="paper-bg">
      <div className="grid-overlay" />

      {/* Decorative red disc top-right */}
      <div style={{
        position: 'absolute',
        top: -40, right: -40,
        width: '40vw', height: '40vw',
        maxWidth: 180, maxHeight: 180,
        borderRadius: '50%',
        background: 'var(--red)',
        opacity: 0.5,
        pointerEvents: 'none',
      }} />
      {/* Halftone slab bottom-left */}
      <div style={{
        position: 'absolute',
        bottom: 60, left: -20,
        width: '30vw', height: '40vw',
        maxWidth: 130, maxHeight: 180,
        backgroundImage: 'radial-gradient(circle, var(--ink) 1.4px, transparent 2px)',
        backgroundSize: '7px 7px',
        opacity: 0.3,
        pointerEvents: 'none',
      }} />

      {/* Manifesto card */}
      <div style={{
        position: 'relative', zIndex: 5,
        width: '100%',
        maxWidth: 520,
        padding: '28px 24px',
        background: 'var(--cream)',
        border: '3px solid var(--ink)',
        boxShadow: '8px 8px 0 var(--red)',
        transform: visible ? 'translateY(0) rotate(-1deg)' : 'translateY(40px) rotate(-1deg)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.6s cubic-bezier(.2,0,.2,1), opacity 0.6s ease',
      }}>
        <div className="label" style={{ color: 'var(--red)', marginBottom: 18 }}>· MANIFESTO ·</div>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif',
          fontSize: 'clamp(22px, 5.5vw, 36px)',
          lineHeight: 1.1,
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
        }}>
          I build <span style={{ color: 'var(--red)' }}>intelligent</span> systems —
          <br />from <span style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '0 5px' }}>L·L·M</span> vulnerability detectors
          <br />to <span style={{ textDecoration: 'underline', textDecorationColor: 'var(--red)', textDecorationThickness: 4 }}>real-time</span> collaboration platforms.
        </div>
        <div style={{
          marginTop: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        }}>
          <div className="mono" style={{ fontSize: 11, opacity: 0.6 }}>
            VIT-AP · CSE · 2022—<br />Mego Forex · Full-Stack
          </div>
          <div style={{
            width: 44, height: 44,
            background: 'var(--ochre)',
            clipPath: 'polygon(50% 0, 100% 100%, 0 100%)',
          }} />
        </div>
      </div>
    </div>
  );
}

function MobileSkillsSection() {
  const [ref, visible] = useMobileReveal(0.15);

  const skills = [
    { name: 'REACT', cat: 'WEB' },
    { name: 'TYPESCRIPT', cat: 'WEB' },
    { name: 'NODEJS', cat: 'RUNTIME' },
    { name: 'FASTAPI', cat: 'API' },
    { name: 'NESTJS', cat: 'API' },
    { name: 'POSTGRES', cat: 'DATA' },
    { name: 'DOCKER', cat: 'OPS' },
    { name: 'PYTHON', cat: 'CORE' },
    { name: 'WEBRTC', cat: 'REALTIME' },
    { name: 'LANGCHAIN', cat: 'AI' },
    { name: 'NEXTJS', cat: 'WEB' },
    { name: 'MONGODB', cat: 'DATA' },
  ];

  return (
    <div ref={ref} style={{
      position: 'relative',
      minHeight: '100svh',
      padding: '60px 20px 130px',
      overflow: 'hidden',
    }} className="paper-bg">
      <div className="grid-overlay" />

      {/* Decorative shapes */}
      <div style={{
        position: 'absolute',
        top: 20, left: -20,
        width: '30vw', height: '30vw',
        maxWidth: 120, maxHeight: 120,
        background: 'var(--ink)',
        transform: 'rotate(15deg)',
        opacity: 0.7,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        top: 10, right: -10,
        width: 0, height: 0,
        borderTop: '60px solid var(--ochre)',
        borderLeft: '60px solid transparent',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: 140, right: -40,
        width: '40vw', height: '40vw',
        maxWidth: 180, maxHeight: 180,
        borderRadius: '50%',
        background: 'var(--red)',
        opacity: 0.5,
        pointerEvents: 'none',
      }} />

      {/* Title */}
      <div style={{
        position: 'relative', zIndex: 5,
        textAlign: 'center',
        marginBottom: 32,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.5s cubic-bezier(.2,0,.2,1), opacity 0.5s ease',
      }}>
        <div className="label" style={{ color: 'var(--red)', marginBottom: 10 }}>SECTION III · INSTRUMENTS</div>
        <div className="display" style={{ fontSize: 'clamp(40px, 10vw, 64px)', color: 'var(--ink)' }}>
          THE TOOLBOX
        </div>
      </div>

      {/* Skill grid — 2 columns */}
      <div style={{
        position: 'relative', zIndex: 5,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 0,
        border: '3px solid var(--ink)',
        background: 'var(--ink)',
      }}>
        {skills.map((s, i) => {
          const isRed = i % 7 === 3;
          const delay = `${i * 0.04}s`;
          return (
            <div key={s.name} style={{
              padding: '20px 14px',
              background: isRed ? 'var(--red)' : 'var(--cream)',
              color: isRed ? 'var(--cream)' : 'var(--ink)',
              border: '1px solid var(--ink)',
              transform: visible ? 'translateY(0)' : 'translateY(40px)',
              opacity: visible ? 1 : 0,
              transition: `transform 0.5s cubic-bezier(.2,0,.2,1) ${delay}, opacity 0.5s ease ${delay}`,
            }}>
              <div className="mono" style={{ fontSize: 8, opacity: 0.5, marginBottom: 5 }}>
                {String(i + 1).padStart(2, '0')} · {s.cat}
              </div>
              <div className="display" style={{ fontSize: 15, letterSpacing: '-0.02em' }}>
                {s.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileHomePage /> : <DesktopHomePage />;
}

window.HomePage = HomePage;

