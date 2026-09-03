import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useSpring, useTransform, useMotionValue, animate } from 'motion/react';
import { useIsMobile, easeOut, easeInOut, easeIn, backOut, seg, SectionMarker } from '../components/primitives.jsx';
import { SCROLL_SPRING, POINTER_SPRING, ABOUT_SEGS, ABOUT_TIMELINE, aboutCameraTransform } from '../motion/timeline.js';
import { useXRayRegister } from '../components/xray/hooks.js';
import { xv } from '../components/xray/descriptors.js';

// ABOUT PAGE - bio, education, summary
// Layout: split poster — left half is portrait silhouette in halftone + geometric collage,
// right half is structured information in stamped/typed cards.
//
// Same architecture as the home page: all per-frame animation runs on
// MotionValues (no React re-renders on scroll/mouse), and the timeline is
// hold plateaus separated by kinetic transition zones — scenes rest
// dead-still on their main frame, then hand off with staggered motion.
//   hold 1: 0.00-0.20   zone 1: 0.20-0.34
//   hold 2: 0.34-0.56   zone 2: 0.56-0.70
//   hold 3: 0.70-1.00

export default function AboutPage() {
  const scrollRef = useRef(null);
  const isMobile = useIsMobile();

  const { scrollYProgress } = useScroll({ container: scrollRef });
  const progress = useSpring(scrollYProgress, SCROLL_SPRING);

  // On-mount intro for scene 1
  const build = useMotionValue(0);
  useEffect(() => {
    const controls = animate(build, 1, { duration: 1.4, ease: easeOut });
    return () => controls.stop();
  }, [build]);

  // Mouse parallax (desktop only)
  const rawMx = useMotionValue(0);
  const rawMy = useMotionValue(0);
  useEffect(() => {
    if (isMobile) { rawMx.set(0); rawMy.set(0); return; }
    const handle = (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      rawMx.set(((e.clientX - cx) / cx) * 6);
      rawMy.set(((e.clientY - cy) / cy) * 6);
    };
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, [isMobile, rawMx, rawMy]);
  const mx = useSpring(rawMx, POINTER_SPRING);
  const my = useSpring(rawMy, POINTER_SPRING);

  // Zone edges and seg windows live in src/motion/timeline.js (shared with x-ray).
  const exit1 = useTransform(progress, (p) => seg(p, ...ABOUT_SEGS.exit1));
  const enter2 = useTransform(progress, (p) => seg(p, ...ABOUT_SEGS.enter2));
  const exit2 = useTransform(progress, (p) => seg(p, ...ABOUT_SEGS.exit2));
  const enter3 = useTransform(progress, (p) => seg(p, ...ABOUT_SEGS.enter3));

  // Camera cranes down/inward only through the zones and parks EXACTLY on
  // each scene's plane at each hold (scenes sit at y=0/100/200vh, z=0/300/600)
  // so resting scenes render 1:1. Slight tilt peaks mid-transition. Math is
  // aboutCamera() in timeline.js, shared with the x-ray scrubber's readout.
  const cameraTransform = useTransform(progress, (p) => aboutCameraTransform(p, isMobile));

  // Publish the MotionValues this page already owns to x-ray mode.
  useXRayRegister('about', {
    variant: isMobile ? 'mobile' : 'desktop', timeline: ABOUT_TIMELINE, scroller: scrollRef,
    values: {
      scrollY: xv.raw(scrollYProgress, [0, 1], '', 'scrollYProgress (raw)'),
      progress: xv.progress(progress, SCROLL_SPRING, { source: 'useSpring(scrollYProgress)' }),
      build: xv.raw(build, [0, 1], '', 'build · animate() 1.4s'),
      rawMx: xv.raw(rawMx, [-6, 6]), rawMy: xv.raw(rawMy, [-6, 6]),
      mx: xv.spring(mx, POINTER_SPRING, [-6, 6]), my: xv.spring(my, POINTER_SPRING, [-6, 6]),
      exit1: xv.seg(exit1, ABOUT_SEGS.exit1), enter2: xv.seg(enter2, ABOUT_SEGS.enter2),
      exit2: xv.seg(exit2, ABOUT_SEGS.exit2), enter3: xv.seg(enter3, ABOUT_SEGS.enter3),
      camera: xv.transform(cameraTransform, 'camera · translateZ / rotateX / translateY'),
    },
  });

  return (
    <div ref={scrollRef} style={{
      position: 'absolute', inset: 0,
      overflowY: 'auto', overflowX: 'hidden',
      perspective: 1600,
    }}>
      <div style={{ height: '500vh', position: 'relative' }}>
        <div style={{
          position: 'sticky', top: 0,
          height: '100vh', width: '100%', overflow: 'hidden',
        }} className="paper-bg">
          <div className="grid-overlay" style={{ zIndex: 0 }} />

          {/* Camera move */}
          <motion.div style={{
            position: 'absolute', inset: 0,
            transformStyle: 'preserve-3d',
            transform: cameraTransform,
          }}>
            <AboutScene1 build={build} exit={exit1} mx={mx} my={my} />
            <AboutScene2 enter={enter2} exit={exit2} />
            <AboutScene3 enter={enter3} isMobile={isMobile} />
          </motion.div>

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
// Assembles via the on-mount intro; exits kinetically in zone 1 — collage
// pieces fly off staggered, the ID column slides out right.
function AboutScene1({ build, exit, mx, my }) {
  const visibility = useTransform(exit, (v) => (v >= 0.999 ? 'hidden' : 'visible'));

  const squareTransform = useTransform([exit, mx, my], ([ex, x, y]) => {
    const o = seg(ex, 0.05, 0.7, easeIn);
    return `rotate(-4deg) translate(calc(-70px - ${o * 70}vw), -60px) translate(${x}px, ${y}px) translateZ(0px)`;
  });
  const discTransform = useTransform([exit, mx, my], ([ex, x, y]) => {
    const o = seg(ex, 0, 0.65, easeIn);
    return `translate(140px, 130px) translate(${x * 2}px, ${y * 2}px) translateZ(40px) scale(${1 - o})`;
  });
  const stripTransform = useTransform(exit, (ex) => {
    const o = seg(ex, 0.1, 0.75, easeIn);
    return `translate(calc(-160px - ${o * 55}vw), 0px) translateZ(80px)`;
  });
  const svgTransform = useTransform(exit, (ex) => {
    const o = seg(ex, 0.15, 0.85, easeIn);
    return `translate(20px, ${-o * 130}vh) translateZ(120px)`;
  });
  const photoTransform = useTransform([exit, mx, my], ([ex, x, y]) => {
    const o = seg(ex, 0.1, 0.9, easeIn);
    return `translate(-44%, calc(-52% - ${o * 150}vh)) rotate(${-1.5 - o * 8}deg) translate(${x * 1.5}px, ${y * 1.5}px) translateZ(160px)`;
  });
  const plateTransform = useTransform(exit, (ex) => {
    const o = seg(ex, 0, 0.6, easeIn);
    return `translateZ(200px) rotate(-4deg) translateY(${o * 60}vh)`;
  });
  const idColTransform = useTransform([build, exit], ([b, ex]) => {
    const o = seg(ex, 0.08, 0.8, easeIn);
    return `translateX(calc(${(1 - b) * 120}px + ${o * 70}vw))`;
  });

  return (
    <motion.div style={{
      position: 'absolute', inset: 0,
      display: 'grid',
      gridTemplateColumns: '0.9fr 1.1fr',
      transformStyle: 'preserve-3d',
      visibility,
    }} className="about-scene1-grid">
      {/* Left: portrait collage */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transformStyle: 'preserve-3d',
      }}>
        {/* Big black square — peeks top-left */}
        <motion.div data-xray="SCENE 1 · SQUARE" data-xray-values="exit1,mx,my" style={{
          position: 'absolute',
          width: 320, height: 420,
          background: 'var(--ink)',
          transform: squareTransform,
        }} />
        {/* Red circle — bleeds bottom-right */}
        <motion.div data-xray="SCENE 1 · DISC" data-xray-values="exit1,mx,my" style={{
          position: 'absolute',
          width: 460, height: 460,
          background: 'var(--red)',
          borderRadius: '50%',
          transform: discTransform,
        }} />
        {/* Halftone strip — bleeds left edge */}
        <motion.div data-xray="SCENE 1 · STRIP" data-xray-values="exit1" style={{
          position: 'absolute',
          width: 180, height: 460,
          backgroundImage: 'radial-gradient(circle, var(--ink) 1.4px, transparent 2px)',
          backgroundSize: '7px 7px',
          transform: stripTransform,
          opacity: 0.5,
        }} />
        {/* Portrait silhouette - abstract head shape */}
        <motion.svg data-xray="SCENE 1 · SILHOUETTE" data-xray-values="exit1" viewBox="0 0 200 260" style={{
          position: 'relative',
          width: 280, height: 360,
          transform: svgTransform,
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
        </motion.svg>

        {/* Real photo — stacked on top of shapes */}
        <motion.div data-xray="SCENE 1 · PHOTO" data-xray-values="exit1,mx,my" style={{
          position: 'absolute',
          width: 340, height: 460,
          top: '50%', left: '50%',
          transform: photoTransform,
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
        </motion.div>

        {/* Number plate */}
        <motion.div data-xray="SCENE 1 · PLATE" data-xray-values="exit1" style={{
          position: 'absolute',
          bottom: '15%', left: '15%',
          background: 'var(--ochre)',
          padding: '6px 12px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          fontWeight: 700,
          transform: plateTransform,
          zIndex: 6,
        }}>
          SUBJECT · 001
        </motion.div>
      </div>

      {/* Right: identification */}
      <motion.div data-xray="SCENE 1 · ID COLUMN" data-xray-values="build,exit1" style={{
        padding: '80px 48px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        gap: 20,
        transform: idColTransform,
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
          production web platforms. Full-Stack Developer
          at <strong>RBP Finivis</strong>, shipping real-time financial workflows.
        </div>
      </motion.div>
    </motion.div>
  );
}

// Scene 2: Education timeline as constructivist diagram
// Title rises into place, the timeline bar draws itself, cards rise from
// below staggered; everything reverses out in zone 2. No fades.
function AboutScene2({ enter, exit }) {
  const visibility = useTransform([enter, exit], ([i, o]) => (i <= 0.001 || o >= 0.99 ? 'hidden' : 'visible'));

  const titleTransform = useTransform([enter, exit], ([en, ex]) => {
    const i = seg(en, 0, 0.7, backOut);
    const o = seg(ex, 0.1, 0.9, easeIn);
    return `translateX(${(1 - i) * -100}px) translateY(${(1 - i) * 10 - o * 70}vh)`;
  });
  const barTransform = useTransform([enter, exit], ([en, ex]) => {
    const i = seg(en, 0.15, 0.85, easeOut);
    const o = seg(ex, 0, 0.55, easeIn);
    return `scaleX(${i * (1 - o)})`;
  });

  const edu = [
    { year: '2019', period: '2017 — 2019', school: 'ST. THERESA ENGLISH', level: 'ICSE · X', color: 'var(--ochre)' },
    { year: '2021', period: '2019 — 2021', school: 'ODM PUBLIC SCHOOL', level: 'CBSE · XII', color: 'var(--ink)' },
    { year: '2022—', period: '2022 — PRESENT', school: 'VIT-AP UNIVERSITY', level: 'B.TECH CSE', color: 'var(--red)' },
  ];

  return (
    <motion.div className="about-scene2-inner" style={{
      position: 'absolute',
      inset: 0,
      top: '100vh',
      padding: '80px 64px',
      transformStyle: 'preserve-3d',
      transform: 'translateZ(300px)',
      visibility,
    }}>
      <div style={{ marginBottom: 40 }}>
        <SectionMarker num="II.A" label="EDUCATION RECORD" />
      </div>

      <motion.div className="display about-edu-title" data-xray="SCENE 2 · TITLE" data-xray-values="enter2,exit2" style={{
        fontSize: 'clamp(60px, 8vw, 120px)',
        marginBottom: 60,
        transform: titleTransform,
      }}>
        TRAJECTORY<span style={{ color: 'var(--red)' }}>.</span>
      </motion.div>

      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 24,
        maxWidth: 1100,
      }} className="about-edu-grid">
        {/* Timeline bar */}
        <motion.div data-xray="SCENE 2 · RAIL" data-xray-values="enter2,exit2" style={{
          position: 'absolute',
          left: 0, right: 0,
          top: 80,
          height: 6,
          background: 'var(--ink)',
          transform: barTransform,
          transformOrigin: 'left',
        }} />

        {edu.map((e, i) => (
          <EduCard key={i} enter={enter} exit={exit} e={e} i={i} />
        ))}
      </div>
    </motion.div>
  );
}

function EduCard({ enter, exit, e, i }) {
  // Rises from below the frame in forward stagger; flies up and out in
  // reverse stagger on exit.
  const transform = useTransform([enter, exit], ([en, ex]) => {
    const inT = seg(en, 0.15 + i * 0.15, 0.6 + i * 0.15, backOut);
    const outT = seg(ex, (2 - i) * 0.08, 0.6 + (2 - i) * 0.08, easeIn);
    return `translateY(${(1 - inT) * 80 - outT * 120}vh) translateZ(${i * 20}px)`;
  });
  return (
    <motion.div data-xray={`SCENE 2 · CARD ${i + 1}`} data-xray-values="enter2,exit2" style={{
      transform,
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
    </motion.div>
  );
}

// Scene 3: Current Experience
// Callout slides in from the left, stat blocks from the right in stagger.
// Final scene — no exit.
function AboutScene3({ enter, isMobile }) {
  const visibility = useTransform(enter, (v) => (v <= 0.001 ? 'hidden' : 'visible'));
  const calloutTransform = useTransform(enter, (v) => `translateX(${(1 - seg(v, 0, 0.8, backOut)) * -60}vw)`);
  const statsTransform = useTransform(enter, (v) => `translateX(${(1 - seg(v, 0.15, 0.95, backOut)) * 60}vw)`);

  return (
    <motion.div className="about-scene3-inner" style={{
      position: 'absolute',
      inset: 0,
      top: '200vh',
      padding: '80px 64px',
      transformStyle: 'preserve-3d',
      transform: 'translateZ(600px)',
      visibility,
    }}>
      <div style={{ marginBottom: 40 }}>
        <SectionMarker num="II.B" label="CURRENT POST" />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.05fr',
        gap: 40,
        alignItems: 'center',
        maxWidth: 1280,
      }} className="about-exp-grid">
        {/* Left: the employer — licence, role, stack */}
        <motion.div className="about-exp-left" data-xray="SCENE 3 · POST" data-xray-values="enter3" style={{
          position: 'relative',
          padding: isMobile ? '28px 20px' : '40px 36px',
          background: 'var(--ink)',
          color: 'var(--cream)',
          transform: isMobile ? 'none' : calloutTransform,
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
          <div className="display" style={{ fontSize: 'clamp(32px, 4vw, 58px)', marginTop: 12, marginBottom: 8, lineHeight: 0.95 }}>
            RBP FINIVIS
          </div>
          <div className="label" style={{ color: 'var(--ochre)', marginBottom: 16 }}>
            FULL-STACK DEVELOPER · FULL-TIME · REMOTE
          </div>
          <div className="mono" style={{ fontSize: 10, opacity: 0.65, marginBottom: 16, letterSpacing: '0.08em' }}>
            RBI-LICENSED FFMC · CHG. FFMC 0297/2023
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, opacity: 0.85 }}>
            I build the production forex stack in <strong>React + NestJS + PostgreSQL</strong> —
            integrating live rate vendors, payment gateways and third-party forex data
            providers, and designing REST APIs and schemas for real-time transaction
            workflows. Regulated money movement, so correctness and auditability
            outrank cleverness.
          </div>
          <div className="mono" style={{ fontSize: 10, marginTop: 20, color: 'var(--ochre)', letterSpacing: '0.14em' }}>
            TWO PRODUCTS IN PRODUCTION →
          </div>
        </motion.div>

        {/* Right: the two shipped products, both publicly reachable */}
        <motion.div className="about-exp-right" data-xray="SCENE 3 · PRODUCTS" data-xray-values="enter3" style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          transform: isMobile ? 'none' : statsTransform,
        }}>
          {[
            {
              name: 'MEGOFOREX',
              tag: 'CONSUMER · REGULATED',
              body: 'Eight services in one checkout — remittance, currency exchange, forex cards, insurance, SIM, visa, education loans, trade. Rate locking over live market feeds, in-flow video KYC, one tracked reference per order, and automatic RBI annual-limit enforcement.',
              url: 'https://www.megoforex.com/',
              c: 'var(--red)',
            },
            {
              name: 'WHITE-LABEL PLATFORM',
              tag: 'PLATFORM · MULTI-TENANT',
              body: 'The same regulated stack resold to banks and fintechs under their own brand. Six-step self-serve onboarding replaces an enterprise sales cycle — and a live sandbox lets a buyer brand a working copy of their future platform before paying.',
              url: 'https://www.rbpfinivis.com/',
              c: 'var(--ochre)',
            },
          ].map((prod) => (
            <div key={prod.name} style={{
              padding: isMobile ? '18px 18px' : '20px 22px',
              background: 'var(--cream)',
              border: '2px solid var(--ink)',
              boxShadow: `6px 6px 0 ${prod.c}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div className="display" style={{ fontSize: 'clamp(19px, 2vw, 26px)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {prod.name}
                </div>
                <a
                  href={prod.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="clickable"
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    padding: '5px 10px',
                    background: 'var(--ink)',
                    color: 'var(--cream)',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >LIVE ↗</a>
              </div>
              <div className="label" style={{ color: prod.c, marginTop: 8, fontSize: 9 }}>{prod.tag}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 10, opacity: 0.82 }}>
                {prod.body}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}

window.AboutPage = AboutPage;
