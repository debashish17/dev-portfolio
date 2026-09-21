import React, { useState, useEffect, useRef } from 'react';
import { motion, useSpring, useTransform, useMotionValue, useMotionTemplate, animate } from 'motion/react';
import { useIsMobile, easeOut, easeInOut, easeIn, backOut, seg, clamp, remap } from '../components/primitives.jsx';
import { SCROLL_SPRING, POINTER_SPRING, HOME_SEGS, homeCameraTransform } from '../motion/timeline.js';
// FOLIO — the landing's opening two acts.
//   Act 1: the name assembles from flying shapes
//   Act 2: the manifesto card rises
// The staircase that used to be Act 3 is its own section below this one, and
// the old Act 4 exit ramp is now the Work / Studio cards at the foot of the
// page — so this scroll runs two acts across one transition zone.

// Acts hand off with staggered per-element motion (seg/easeIn/backOut from
// primitives) instead of crossfades: every element enters/exits by
// translate/rotate/scale on its own sub-window of the act's progress, so
// transitions scrub cleanly in both directions.

// All per-frame animation runs on MotionValues: scroll, mouse and intro write
// straight to the DOM via motion.div, so React never re-renders during
// scrolling or mouse movement. The spring on scroll progress smooths the
// discrete wheel steps that used to make acts snap.
function DesktopFolio() {
  const sectionRef = useRef(null);

  // The route owns the scroller now (.home), so progress is measured against
  // this section inside it rather than by owning a scroll container — nesting
  // one scroller inside another chains badly on trackpads.
  const scrollYProgress = useMotionValue(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = sectionRef.current;
      if (!el) return;
      let sc = el.parentElement;
      while (sc) {
        const oy = getComputedStyle(sc).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight) break;
        sc = sc.parentElement;
      }
      const viewTop = sc ? sc.getBoundingClientRect().top : 0;
      const viewH = sc ? sc.clientHeight : window.innerHeight;
      const r = el.getBoundingClientRect();
      const travel = r.height - viewH;
      scrollYProgress.set(travel > 0 ? clamp((viewTop - r.top) / travel, 0, 1) : 0);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollYProgress]);

  const progress = useSpring(scrollYProgress, SCROLL_SPRING);

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
  const mx = useSpring(rawMx, POINTER_SPRING);
  const my = useSpring(rawMy, POINTER_SPRING);

  // Each act's main frame is a HOLD plateau where nothing moves but the
  // pointer; all kinetic motion happens inside the single transition zone
  // between them, and motion eases out into each hold.
  //   hold 1: 0.00-0.42   zone: 0.42-0.58   hold 2: 0.58-1.00
  // NOTE: multi-input derivations below use the explicit-dependency form of
  // useTransform ([deps], fn) — the auto-tracking arrow form misses
  // subscriptions when a dependency isn't read on the first call (e.g. after
  // a short-circuiting ||), which froze exit animations mid-flight.
  // Zone edges and seg windows live in src/motion/timeline.js.
  const exit1 = useTransform(progress, (p) => seg(p, ...HOME_SEGS.exit1));
  const enter2 = useTransform(progress, (p) => seg(p, ...HOME_SEGS.enter2));

  // Camera parks EXACTLY on each act's plane at each hold (z 0 and 600) so a
  // resting act renders 1:1 and centred — any offset would zoom or shift it
  // through the perspective origin. Math is homeCamera() in timeline.js.
  const cameraTransform = useTransform(progress, homeCameraTransform);

  // Act 2 exits on the section's tail. Without this the card sat frozen while
  // the folio scrolled out from under it and the staircase arrived separately,
  // which is what made the seam read as a page break: the eye saw two motions
  // instead of one. Now the card lifts away as the next section rises.
  const exit2 = useTransform(progress, (p) => seg(p, 0.82, 1));

  return (
    <section ref={sectionRef} className="folio">
      <div className="folio-sticky paper-bg">
        {/* Background grid */}
        <div className="grid-overlay" />

        {/* The 3D canvas */}
        <motion.div style={{
          position: 'absolute', inset: 0,
          transformStyle: 'preserve-3d',
          transform: cameraTransform,
        }}>
          <Act1Title build={intro} exit={exit1} mx={mx} my={my} />
          <Act2Manifesto enter={enter2} exit={exit2} mx={mx} my={my} />
        </motion.div>
      </div>
    </section>
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
        bottom: 'clamp(38px, 8vh, 80px)',
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
  const containerTransform = 'translateZ(600px)';
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
    // Linear, and 36vh — which is exactly how far the page scrolls across the
    // exit window (0.18 of a 2vh travel). Eased or further and the card
    // outruns the page, which is what made the seam read as two motions.
    const o = ex;
    return `translateY(${(1 - i) * 70 - o * 36}vh) rotate(-1deg)`;
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
        <div style={{
          fontFamily: 'Archivo Black, sans-serif',
          fontSize: 'clamp(24px, 2.7vw, 38px)',
          lineHeight: 1.08,
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          textWrap: 'pretty',
        }}>
          I build things, then spend <span style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}>too long</span> making them
          better than they needed to be. It&rsquo;s a{' '}
          <span style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '0 6px', whiteSpace: 'nowrap' }}>bad habit</span>{' '}
          professionally and a <span style={{ textDecoration: 'underline', textDecorationColor: 'var(--red)', textDecorationThickness: 6, whiteSpace: 'nowrap' }}>good one</span>{' '}
          personally. Somewhere in between is where most of my work lives.
        </div>
        <div className="mono" style={{ marginTop: 32, fontSize: 12, opacity: 0.6 }}>
          VIT-AP · CSE · 2022—<br />RBP Finivis · Full-Stack
        </div>
      </motion.div>
    </motion.div>
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
// Mobile is a plain scroll page — no spring, no camera, no timeline. It is a
// sibling of the route's scroller rather than one of its own, so the staircase
// and the sections below it keep scrolling as one document.
function MobileFolio() {
  return (
    <section className="folio is-mobile">
      <MobileHeroSection />
      <MobileManifestoSection />
    </section>
  );
}

function MobileHeroSection() {
  // One MotionValue tween drives the intro; Motion writes the styles, so this
  // section renders once instead of ~170 times during the first 1.2s (it used
  // to setState from a rAF loop — the weakest devices paid for that on load).
  const intro = useMotionValue(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const controls = animate(intro, 1, { duration: 1.2, ease: easeOut });
    return () => controls.stop();
  }, [intro]);

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
        {lines.map((line, li) => (
          <MobileNameLine key={li} intro={intro} li={li} line={line} />
        ))}
      </div>

      {/* Subtitle */}
      <motion.div className="label" style={{
        position: 'relative', zIndex: 5,
        color: 'var(--cream)',
        background: 'var(--ink)',
        padding: '6px 14px',
        marginTop: 34,
        opacity: intro,
      }}>
        BUILDER · CSE · INDIA
      </motion.div>

      {/* Scroll hint — intro fade on the outer layer (MotionValue), scrolled fade on the inner (state) */}
      <motion.div style={{
        position: 'absolute',
        bottom: 88,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity: intro,
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          opacity: scrolled ? 0 : 1,
          transition: 'opacity 0.4s',
        }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: '0.3em', opacity: 0.6 }}>SCROLL</div>
          {/* Static. The cue already earns attention by arriving with the hero
              and disappearing on first scroll; a perpetual bounce on top of
              that is decoration competing with the one authored moment. */}
          <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
            <path d="M8 2 L8 18 M3 13 L8 18 L13 13" stroke="var(--ink)" strokeWidth="2" strokeLinecap="square"/>
          </svg>
        </div>
      </motion.div>
    </div>
  );
}

function MobileNameLine({ intro, li, line }) {
  // Same stagger as before: each line slides in from alternating sides on its own
  // sub-window of the intro, now as two MotionValue bindings instead of a re-render.
  const lt = useTransform(intro, (v) => clamp(remap(v, li * 0.15, 0.4 + li * 0.15, 0, 1), 0, 1));
  const transform = useTransform(lt, (t) => `translateX(${(1 - t) * (li % 2 ? 60 : -60)}px)`);
  const size = li === 1 ? 'clamp(52px, 13vw, 80px)' : 'clamp(60px, 15vw, 90px)';
  return (
    <motion.div style={{
      fontSize: size,
      color: 'var(--ink)',
      transform,
      opacity: lt,
    }}>
      {line}
    </motion.div>
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
        <div style={{
          fontFamily: 'Archivo Black, sans-serif',
          fontSize: 'clamp(19px, 4.6vw, 30px)',
          lineHeight: 1.12,
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          textWrap: 'pretty',
        }}>
          I build things, then spend <span style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}>too long</span> making them
          better than they needed to be. It&rsquo;s a{' '}
          <span style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '0 5px', whiteSpace: 'nowrap' }}>bad habit</span>{' '}
          professionally and a <span style={{ textDecoration: 'underline', textDecorationColor: 'var(--red)', textDecorationThickness: 4, whiteSpace: 'nowrap' }}>good one</span>{' '}
          personally. Somewhere in between is where most of my work lives.
        </div>
        <div className="mono" style={{ marginTop: 24, fontSize: 11, opacity: 0.6 }}>
          VIT-AP · CSE · 2022—<br />RBP Finivis · Full-Stack
        </div>
      </div>
    </div>
  );
}

export default function Folio() {
  const isMobile = useIsMobile();
  // Reduced motion takes the mobile composition on any width. The desktop act
  // is driven entirely by scroll progress, so with the camera disabled its two
  // acts would sit at their pre-arrival transforms — the name half-assembled
  // and the manifesto still parked 70vh below the fold. The mobile one is a
  // plain stacked document and says the same thing without the camera.
  const [reduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  return isMobile || reduced ? <MobileFolio /> : <DesktopFolio />;
}


