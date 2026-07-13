import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, useScroll, useSpring, useTransform, useMotionValue, useMotionTemplate, useMotionValueEvent, animate } from 'motion/react';
import { useRoute, easeOut, easeInOut, easeIn, backOut, seg, clamp, remap } from '../components/primitives.jsx';

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

// Acts hand off with staggered per-element motion (seg/easeIn/backOut from
// primitives) instead of crossfades: every element enters/exits by
// translate/rotate/scale on its own sub-window of the act's progress, so
// transitions scrub cleanly in both directions.

// All per-frame animation runs on MotionValues: scroll, mouse and intro write
// straight to the DOM via motion.div, so React never re-renders during
// scrolling or mouse movement. The spring on scroll progress smooths the
// discrete wheel steps that used to make acts snap.
function DesktopHomePage() {
  const scrollRef = useRef(null);
  const { go } = useRoute();

  const { scrollYProgress } = useScroll({ container: scrollRef });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.5, restDelta: 0.0005 });

  // On-mount intro animation
  const intro = useMotionValue(0);
  useEffect(() => {
    const controls = animate(intro, 1, { duration: 1.2, ease: easeOut });
    return () => controls.stop();
  }, [intro]);

  // Mouse parallax — springs keep the drift smooth even with high-rate mice
  const rawMx = useMotionValue(0);
  const rawMy = useMotionValue(0);
  useEffect(() => {
    const handle = (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      rawMx.set(((e.clientX - cx) / cx) * 8);
      rawMy.set(((e.clientY - cy) / cy) * 8);
    };
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, [rawMx, rawMy]);
  const mx = useSpring(rawMx, { stiffness: 140, damping: 18, mass: 0.4 });
  const my = useSpring(rawMy, { stiffness: 140, damping: 18, mass: 0.4 });

  // Timeline: each act's main frame is a HOLD plateau where nothing moves
  // (except mouse parallax); all kinetic motion happens inside three
  // transition zones between them. Motion eases out into each hold.
  //   hold 1: 0.00-0.17   zone 1: 0.17-0.27
  //   hold 2: 0.27-0.44   zone 2: 0.44-0.54
  //   hold 3: 0.54-0.71   zone 3: 0.71-0.81
  //   hold 4: 0.81-1.00
  // NOTE: multi-input derivations below use the explicit-dependency form of
  // useTransform ([deps], fn) — the auto-tracking arrow form misses
  // subscriptions when a dependency isn't read on the first call (e.g. after
  // a short-circuiting ||), which froze exit animations mid-flight.
  const Z1 = [0.17, 0.27], Z2 = [0.44, 0.54], Z3 = [0.71, 0.81];
  const exit1 = useTransform(progress, (p) => seg(p, Z1[0], Z1[1]));
  const enter2 = useTransform(progress, (p) => seg(p, Z1[0] + 0.02, Z1[1] + 0.02));
  const exit2 = useTransform(progress, (p) => seg(p, Z2[0], Z2[1]));
  const enter3 = useTransform(progress, (p) => seg(p, Z2[0] + 0.02, Z2[1] + 0.02));
  const exit3 = useTransform(progress, (p) => seg(p, Z3[0], Z3[1]));
  const enter4 = useTransform(progress, (p) => seg(p, Z3[0] + 0.02, Z3[1] + 0.04));

  // Camera parks EXACTLY on each act's plane at each hold (acts sit at z=0,
  // 600, 1100, 1700) so resting acts render 1:1 and centered — any offset
  // would zoom/shift them via the perspective origin. The tilt peaks
  // mid-transition and levels out to 0 at every hold.
  const cameraTransform = useTransform(progress, (p) => {
    const s1 = seg(p, Z1[0], Z1[1], easeInOut);
    const s2 = seg(p, Z2[0], Z2[1], easeInOut);
    const s3 = seg(p, Z3[0], Z3[1], easeInOut);
    const z = s1 * 600 + s2 * 500 + s3 * 600;
    const tilt = Math.sin(Math.PI * s1) + Math.sin(Math.PI * s2) + Math.sin(Math.PI * s3);
    return `translateZ(${-z}px) rotateX(${tilt * -5}deg)`;
  });

  return (
    <div ref={scrollRef} style={{
      position: 'absolute', inset: 0,
      overflowY: 'auto', overflowX: 'hidden',
      perspective: 1800,
      perspectiveOrigin: '50% 40%',
    }}>
      {/* Tall scroll spacer — length sets pacing: holds get ~9 wheel notches each */}
      <div style={{ height: '650vh', position: 'relative' }}>
        {/* Sticky stage */}
        <div style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          width: '100%',
          overflow: 'hidden',
        }} className="paper-bg">

          {/* Background grid */}
          <div className="grid-overlay" />

          {/* Persistent corner blocks */}
          <CornerChrome progress={progress} />

          {/* The 3D canvas */}
          <motion.div style={{
            position: 'absolute', inset: 0,
            transformStyle: 'preserve-3d',
            transform: cameraTransform,
          }}>
            <Act1Title build={intro} exit={exit1} mx={mx} my={my} />
            <Act2Manifesto enter={enter2} exit={exit2} mx={mx} my={my} />
            <Act3Skills enter={enter3} exit={exit3} mx={mx} my={my} />
            {/* Arrow bar decoration stays in 3D */}
            <Act4Decor t={enter4} />
          </motion.div>

          {/* Act4 CTA rendered OUTSIDE 3D canvas — flat overlay, reliable click events */}
          <Act4Exit t={enter4} go={go} />

          {/* Progress dial */}
          <ProgressDial progress={progress} />
        </div>
      </div>
    </div>
  );
}

// Hide fully-faded acts so they don't cost paint while invisible
// (they stay mounted — mount/unmount would require React renders per frame)
function useActVisibility(t) {
  return useTransform(t, (v) => (v <= 0.001 ? 'hidden' : 'visible'));
}

// =================== CORNER CHROME ===================
function CornerChrome({ progress }) {
  // Local state confined to this tiny label — updates only when the numeral changes
  const [section, setSection] = useState('I');
  useMotionValueEvent(progress, 'change', (v) => {
    setSection(v < 0.22 ? 'I' : v < 0.49 ? 'II' : v < 0.76 ? 'III' : 'IV');
  });
  return (
    <>
      {/* Top-left index */}
      <div style={{
        position: 'absolute', top: 24, left: 24, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div className="label" style={{ color: 'var(--red)' }}>FOLIO № I</div>
        <div className="mono" style={{ fontSize: 10, opacity: 0.6 }}>
          SECTION · {section}
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
function Act1Title({ build, exit, mx, my }) {
  const visibility = useTransform(exit, (v) => (v >= 0.999 ? 'hidden' : 'visible'));
  const discTransform = useTransform([build, exit, mx, my], ([b, ex, x, y]) => {
    const e = seg(ex, 0.10, 0.80, easeIn);
    return `translateZ(-200px) translate(${x * 2}px, ${y * 2}px) scale(${easeOut(b) * (1 - e)})`;
  });
  const wedgeTransform = useTransform([build, exit], ([b, ex]) => {
    const e = seg(ex, 0.05, 0.70, easeIn);
    return `translateZ(-100px) scaleY(${easeOut(b) * (1 - e)})`;
  });
  const barTransform = useTransform([build, exit], ([b, ex]) => {
    const e = seg(ex, 0, 0.60, easeIn);
    return `rotate(-22deg) translateX(${(1 - b) * -100 + e * 170}%) translateZ(50px)`;
  });
  const subTransform = useTransform([build, exit], ([b, ex]) => {
    const e = seg(ex, 0.12, 0.72, easeIn);
    return `translateY(${(1 - b) * 3 + e * 45}vh)`;
  });
  return (
    <motion.div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transformStyle: 'preserve-3d',
      visibility,
    }}>
      {/* Big red circle behind */}
      <motion.div style={{
        position: 'absolute',
        width: '70vh', height: '70vh',
        borderRadius: '50%',
        background: 'var(--red)',
        left: 'calc(50% - 35vh)',
        top: 'calc(50% - 35vh)',
        transform: discTransform,
      }} />

      {/* Black wedge */}
      <motion.div style={{
        position: 'absolute',
        width: '50vh', height: '25vh',
        background: 'var(--ink)',
        borderRadius: '50vh 50vh 0 0',
        left: 'calc(50% - 25vh)',
        top: 'calc(50% - 30vh)',
        transform: wedgeTransform,
        transformOrigin: 'bottom',
      }} />

      {/* Diagonal yellow bar */}
      <motion.div style={{
        position: 'absolute',
        width: '120vw', height: 28,
        background: 'var(--ochre)',
        top: '52%',
        left: '-10vw',
        transform: barTransform,
      }} />

      {/* The name - render twice: black layer + cream layer clipped to red disc */}
      <NameStack build={build} exit={exit} mx={mx} my={my} />

      {/* Subtitle */}
      <motion.div style={{
        position: 'absolute',
        bottom: 80,
        left: 0, right: 0,
        textAlign: 'center',
        zIndex: 20,
        pointerEvents: 'none',
        transform: subTransform,
        opacity: build,
      }}>
        <div className="label" style={{ color: 'var(--cream)', background: 'var(--ink)', padding: '6px 16px', display: 'inline-block' }}>
          BUILDER · CSE · INDIA
        </div>
      </motion.div>
    </motion.div>
  );
}

function NameStack({ build, exit, mx, my }) {
  // Disc in screen coordinates: 70vh wide, centered. The cream layer is clipped
  // to a circle that tracks the disc's mouse-parallax translate.
  const dx = useTransform(mx, (x) => x * 2);
  const dy = useTransform(my, (y) => y * 2);
  const clipPath = useMotionTemplate`circle(35vh at calc(50% + ${dx}px) calc(50% + ${dy}px))`;
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
        <NameLetters build={build} exit={exit} colorMode="ink" />
      </div>
      {/* Layer 2: cream letters, clipped to the red disc only — gives the invert effect */}
      <motion.div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        clipPath,
      }}>
        <div style={{ position: 'relative', textAlign: 'center', transformStyle: 'preserve-3d' }}>
          <NameLetters build={build} exit={exit} colorMode="cream" />
        </div>
      </motion.div>
    </div>
  );
}

function NameLetters({ build, exit, colorMode = 'ink' }) {
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
      {lines.map((line, li) => (
        <NameLine key={li} build={build} exit={exit} li={li} line={line} colorMode={colorMode} />
      ))}
    </div>
  );
}

function NameLine({ build, exit, li, line, colorMode }) {
  // Entrance (intro) slides lines in from ±200px; exit shoots them fully
  // off-screen in alternating directions, staggered top-to-bottom.
  const lt = useTransform(build, (b) => clamp(remap(b, li * 0.15, 0.4 + li * 0.15, 0, 1), 0, 1));
  const transform = useTransform([lt, exit], ([inT, ex]) => {
    const e = seg(ex, li * 0.08, 0.7 + li * 0.08, easeIn);
    const dir = li % 2 ? -1 : 1;
    return `translateX(calc(${(1 - inT) * (li % 2 ? 200 : -200)}px + ${e * dir * 120}vw)) translateZ(${li * 30}px) rotateY(${(1 - inT) * 30 - e * dir * 25}deg)`;
  });
  const size = li === 1 ? 'clamp(70px, 12vw, 200px)' : 'clamp(80px, 14vw, 220px)';
  // colorMode "ink" = whole name dark; "cream" = whole name light (used inside disc clip)
  const color = colorMode === 'cream' ? 'var(--cream)' : 'var(--ink)';
  const offset = li === 1 ? -60 : 0;
  return (
    <motion.div style={{
      fontSize: size,
      color,
      transform,
      opacity: lt,
      marginLeft: offset,
    }}>
      {line}
    </motion.div>
  );
}

// =================== ACT 2 : MANIFESTO ===================
function Act2Manifesto({ enter, exit, mx, my }) {
  // Kinetic handoff: no crossfade — the slab slides in from the left, disc and
  // ring pop up from scale 0, the card rises from below the viewport; on exit
  // everything reverses out. During the hold (enter=1, exit=0) the act is
  // completely still apart from mouse parallax.
  const visibility = useTransform([enter, exit], ([i, o]) => (i <= 0.001 || o >= 0.99 ? 'hidden' : 'visible'));
  const containerTransform = useTransform(exit, (o) => `translateZ(${600 + o * 150}px)`);
  const slabTransform = useTransform([enter, exit, mx, my], ([en, ex, x, y]) => {
    const i = seg(en, 0, 0.8, easeOut);
    const o = seg(ex, 0.05, 0.9, easeIn);
    return `translateZ(-50px) rotate(-8deg) translate(calc(${x * 4}px + ${(1 - i) * -60 - o * 90}vw), ${y * 4}px)`;
  });
  const discTransform = useTransform([enter, exit, mx, my], ([en, ex, x, y]) => {
    const i = seg(en, 0.1, 0.85, backOut);
    const o = seg(ex, 0, 0.7, easeIn);
    return `translateZ(-100px) translate(${x * 6}px, ${y * 6}px) scale(${Math.max(0, i * (1 - o))})`;
  });
  const ringTransform = useTransform([enter, exit, mx, my], ([en, ex, x, y]) => {
    const i = seg(en, 0.2, 0.95, backOut);
    const o = seg(ex, 0.1, 0.8, easeIn);
    return `translateZ(-90px) translate(${x * 6}px, ${y * 6}px) scale(${Math.max(0, i * (1 - o))})`;
  });
  const cardTransform = useTransform([enter, exit], ([en, ex]) => {
    const i = seg(en, 0, 0.9, backOut);
    const o = seg(ex, 0.05, 1, easeIn);
    return `translateY(${(1 - i) * 70 - o * 120}vh) rotate(-1deg)`;
  });

  return (
    <motion.div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transformStyle: 'preserve-3d',
      transform: containerTransform,
      visibility,
    }}>
      {/* Big halftone slab */}
      <motion.div style={{
        position: 'absolute',
        width: 480, height: 480,
        backgroundImage: 'radial-gradient(circle, var(--ink) 1.5px, transparent 2px)',
        backgroundSize: '8px 8px',
        left: 'calc(50% - 600px)',
        top: 'calc(50% - 240px)',
        transform: slabTransform,
        opacity: 0.4,
      }} />

      {/* Big red disc */}
      <motion.div style={{
        position: 'absolute',
        width: 380, height: 380,
        background: 'var(--red)',
        borderRadius: '50%',
        right: 'calc(50% - 580px)',
        top: 'calc(50% - 190px)',
        transform: discTransform,
      }} />

      {/* White ring */}
      <motion.div style={{
        position: 'absolute',
        width: 380, height: 380,
        border: '8px solid var(--ink)',
        borderRadius: '50%',
        right: 'calc(50% - 600px)',
        top: 'calc(50% - 200px)',
        transform: ringTransform,
      }} />

      {/* Manifesto text block */}
      <motion.div style={{
        position: 'relative',
        maxWidth: 720,
        padding: '40px 48px',
        background: 'var(--cream)',
        border: '3px solid var(--ink)',
        boxShadow: '12px 12px 0 var(--red)',
        transformStyle: 'preserve-3d',
        transform: cardTransform,
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
      </motion.div>
    </motion.div>
  );
}

// =================== ACT 3 : SKILLS ===================
function Act3Skills({ enter, exit, mx, my }) {
  // Kinetic handoff: shapes slide in from their nearest screen edge, the title
  // rises into place, cells flip up from edge-on; exits reverse out staggered.
  // Dead-still during the hold (enter=1, exit=0) apart from mouse parallax.
  const visibility = useTransform([enter, exit], ([i, o]) => (i <= 0.001 || o >= 0.99 ? 'hidden' : 'visible'));
  const containerTransform = useTransform(exit, (o) => `translateZ(${1100 + o * 150}px)`);
  const squareTransform = useTransform([enter, exit, mx, my], ([en, ex, x, y]) => {
    const i = seg(en, 0, 0.7, easeOut);
    const o = seg(ex, 0.1, 0.8, easeIn);
    return `rotate(15deg) translate(calc(${x * 3}px + ${(1 - i) * -40 - o * 60}vw), ${y * 3}px)`;
  });
  const discTransform = useTransform([enter, exit, mx, my], ([en, ex, x, y]) => {
    const i = seg(en, 0.05, 0.75, easeOut);
    const o = seg(ex, 0.15, 0.85, easeIn);
    return `translate(calc(${x * 5}px + ${(1 - i) * 50 + o * 70}vw), ${y * 5}px)`;
  });
  const triTransform = useTransform([enter, exit, mx, my], ([en, ex, x, y]) => {
    const i = seg(en, 0.1, 0.8, easeOut);
    const o = seg(ex, 0.1, 0.75, easeIn);
    return `translate(${x * 4}px, calc(${y * 4}px + ${(1 - i) * -40 - o * 60}vh))`;
  });
  const titleTransform = useTransform([enter, exit], ([en, ex]) => {
    const i = seg(en, 0, 0.75, backOut);
    const o = seg(ex, 0.1, 0.9, easeIn);
    return `translate(-50%, ${(1 - i) * 20 - o * 60}vh)`;
  });
  // The grid's ink frame rises with the act and leaves upward — otherwise it
  // would sit as an empty black slab while cells are still edge-on
  const gridTransform = useTransform([enter, exit], ([en, ex]) => {
    const i = seg(en, 0, 0.55, easeOut);
    const o = seg(ex, 0.25, 1, easeIn);
    return `translateY(${(1 - i) * 80 - o * 130}vh)`;
  });

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
    <motion.div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transformStyle: 'preserve-3d',
      transform: containerTransform,
      visibility,
    }}>
      {/* Background poster shapes */}
      <div style={{
        position: 'absolute', inset: 0,
        transformStyle: 'preserve-3d',
      }}>
        <motion.div style={{
          position: 'absolute',
          left: '8%', top: '15%',
          width: 200, height: 200,
          background: 'var(--ink)',
          transform: squareTransform,
        }} />
        <motion.div style={{
          position: 'absolute',
          right: '10%', bottom: '15%',
          width: 280, height: 280,
          background: 'var(--red)',
          borderRadius: '50%',
          transform: discTransform,
        }} />
        <motion.div style={{
          position: 'absolute',
          right: '8%', top: '12%',
          width: 0, height: 0,
          borderTop: '120px solid var(--ochre)',
          borderLeft: '120px solid transparent',
          transform: triTransform,
        }} />
      </div>

      {/* Title */}
      <motion.div style={{
        position: 'absolute',
        top: '12%',
        left: '50%',
        transform: titleTransform,
        textAlign: 'center',
      }}>
        <div className="label" style={{ color: 'var(--red)', marginBottom: 12 }}>SECTION III · INSTRUMENTS</div>
        <div className="display" style={{ fontSize: 'clamp(48px, 6vw, 84px)', color: 'var(--ink)' }}>
          THE TOOLBOX
        </div>
      </motion.div>

      {/* Skill grid */}
      <motion.div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 0,
        width: 'min(900px, 80vw)',
        marginTop: 100,
        border: '3px solid var(--ink)',
        background: 'var(--ink)',
        transform: gridTransform,
      }}>
        {skills.map((s, i) => (
          <SkillCell key={s.name} enter={enter} exit={exit} s={s} i={i} />
        ))}
      </motion.div>
    </motion.div>
  );
}

// Hover color lives in CSS (.skill-cell:hover) — the previous inline-style
// mutation was wiped by every React render, causing flicker.
function SkillCell({ enter, exit, s, i }) {
  // Cells flip up from fully edge-on (90° = invisible, so no opacity needed)
  // in forward stagger; they flip away in reverse stagger on exit.
  const transform = useTransform([enter, exit], ([en, ex]) => {
    const inT = seg(en, i * 0.04, 0.55 + i * 0.04, easeOut);
    const outT = seg(ex, (11 - i) * 0.02, 0.55 + (11 - i) * 0.02, easeIn);
    return `translateY(${(1 - inT) * 40 + outT * 20}px) rotateX(${(1 - inT) * 90 - outT * 90}deg)`;
  });
  const isRed = i % 7 === 3;
  return (
    <motion.div data-magnet className={isRed ? 'skill-cell skill-cell-red' : 'skill-cell'} style={{
      padding: '24px 16px',
      border: '1px solid var(--ink)',
      transform,
      transformOrigin: 'top',
    }}>
      <div className="mono" style={{ fontSize: 9, opacity: 0.5, marginBottom: 6 }}>
        {String(i + 1).padStart(2, '0')} · {s.cat}
      </div>
      <div className="display" style={{ fontSize: 18, letterSpacing: '-0.02em' }}>
        {s.name}
      </div>
    </motion.div>
  );
}

// =================== ACT 4 : DECORATIVE arrow (stays in 3D canvas) ===================
function Act4Decor({ t }) {
  const visibility = useActVisibility(t);
  // The bar draws itself in via scaleX — no fade needed
  const barTransform = useTransform(t, (v) => `scaleX(${easeOut(v)})`);
  return (
    <motion.div style={{
      position: 'absolute', inset: 0,
      transformStyle: 'preserve-3d',
      transform: 'translateZ(1700px)',
      visibility,
      pointerEvents: 'none',
    }}>
      <motion.div style={{
        position: 'absolute',
        width: '80vw', height: 8,
        background: 'var(--red)',
        top: '50%', left: '10vw',
        transform: barTransform,
        transformOrigin: 'left',
      }} />
    </motion.div>
  );
}

// =================== ACT 4 : EXIT CTA (flat 2D overlay — reliable hit-testing) ===================
function Act4Exit({ t, go }) {
  const visibility = useActVisibility(t);
  const pointerEvents = useTransform(t, (v) => (v > 0.3 ? 'auto' : 'none'));
  // Staggered slide-up from below the viewport; button pops in with overshoot
  const labelTransform = useTransform(t, (v) => `translateY(${(1 - seg(v, 0.05, 0.55, backOut)) * 55}vh)`);
  const titleTransform = useTransform(t, (v) => `translateY(${(1 - seg(v, 0.15, 0.65, backOut)) * 60}vh)`);
  const btnTransform = useTransform(t, (v) => {
    const e = seg(v, 0.3, 0.85, backOut);
    return `translateY(${(1 - e) * 40}vh) scale(${0.6 + e * 0.4})`;
  });
  return (
    <motion.div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 20,
      pointerEvents,
      visibility,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <motion.div className="label" style={{ color: 'var(--red)', marginBottom: 16, transform: labelTransform }}>NEXT TRANSMISSION</motion.div>
        <motion.div className="display" style={{ fontSize: 'clamp(44px, 9vw, 140px)', color: 'var(--ink)', marginBottom: 32, lineHeight: 0.85, transform: titleTransform }}>
          TO THE<br />WORK<span style={{ color: 'var(--red)' }}>.</span>
        </motion.div>
        <motion.div style={{ transform: btnTransform }}>
          <button className="btn-block clickable" style={{ margin: '0 auto' }} onClick={() => go('work')}>
            ENTER ARCHIVE <span style={{ fontSize: 18 }}>→</span>
          </button>
        </motion.div>
      </div>
    </motion.div>
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
  // Integer percent — re-renders only this small dial, at most once per 1% change
  const [pct, setPct] = useState(0);
  useMotionValueEvent(progress, 'change', (v) => {
    setPct(clamp(Math.floor(v * 100), 0, 100));
  });
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
          strokeDasharray={`${(pct / 100) * 125.6} 125.6`}
          transform="rotate(-90 24 24)"
        />
        <circle cx="24" cy="24" r="3" fill="var(--ink)" />
      </svg>
      <div className="mono" style={{ fontSize: 10, opacity: 0.6 }}>
        {String(pct).padStart(2, '0')}
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

