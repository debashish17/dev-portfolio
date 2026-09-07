import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, useTransform, useMotionValue, animate } from 'motion/react';
import { useXRayRegister } from '../components/xray/hooks.js';
import { xv } from '../components/xray/descriptors.js';
import { useRenderCount } from '../lib/xray/render-count.js';
import { takePendingProject } from '../lib/site-bus.js';
import { useRoute, useMouseParallaxMV, easeOut, clamp, remap, LogoMark, Circle, Bar, Triangle, Wedge, Ring, Halftone } from '../components/primitives.jsx';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handle = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return mobile;
}

// WORK / PROJECTS PAGE
// Project cards that explode into deconstructed views on hover/click

const PROJECTS = [
  {
    id: 'llm-vul',
    repoUrl: 'https://github.com/debashish17/LLM-VUL',
    no: '01',
    title: 'LLM-VUL',
    tag: 'AI · SECURITY',
    desc: 'Point it at any GitHub repo and it scans the C/C++. Static analysis and ML run as two independent layers — never merged, so each signal stands on its own.',
    bullets: [
      'Layer 1 — CppCheck, Flawfinder and Semgrep catch deterministic pattern violations.',
      'Layer 2, your pick — a gradient-boosting ensemble over 304 features (CPU-only), or QLoRA CodeBERT tuning just 1.4% of its parameters.',
      'Trained on 718K functions from DiverseVul, MegaVul and Devign, at an 11.7:1 safe-to-vulnerable ratio.',
      'Limits published, not hidden: 53–64% precision, and 99.7% C training data means C++ generalises poorly.',
    ],
    stack: ['Python', 'FastAPI', 'React', 'PyTorch', 'XGBoost', 'CodeBERT', 'Docker'],
    metrics: [{ k: 'ROC-AUC', v: '0.905' }, { k: 'RECALL', v: '91.1%' }, { k: 'CORPUS', v: '718K' }],
    color: 'var(--red)',
    accent: 'var(--ink)',
  },
  {
    id: 'sitesmith',
    repoUrl: 'https://github.com/debashish17/Sitesmith',
    no: '02',
    title: 'SITESMITH',
    tag: 'AI · WEB',
    desc: 'Describe a web app in plain English, get a working one — then keep talking to it to change it. The interesting problem is not generation, it is editing without rewriting everything.',
    bullets: [
      'FAISS vector search locates the code a request actually touches, so a change regenerates only the affected files instead of the whole project.',
      'Every request is scored before the model is called: intent, target elements, affected files, and a 0–100% confidence rating that prompts you to clarify vague asks.',
      'Monaco editor with a WebContainer live preview, terminal and file explorer, all in the browser.',
      'Pluggable model providers — NVIDIA free tier or Claude.',
    ],
    stack: ['React', 'TypeScript', 'Express.js', 'MongoDB', 'FAISS', 'Vector Search'],
    metrics: [{ k: 'INPUT', v: 'NL' }, { k: 'OUTPUT', v: 'APP' }, { k: 'EDITOR', v: 'LIVE' }],
    color: 'var(--ink)',
    accent: 'var(--red)',
  },
  {
    id: 'flux',
    repoUrl: 'https://github.com/debashish17/Flux',
    no: '03',
    title: 'FLUX',
    tag: 'AI · DOCS',
    desc: 'Conversational .docx and .pptx generation. The AI plans a structure, then you refine it section by section — the opposite of one-shotting a document and hoping.',
    bullets: [
      'Dislike a section, say why, and only that section regenerates against your feedback — the rest stays untouched.',
      'Inline editing, add/remove/reorder sections, and a 1.5s debounced auto-save so nothing is lost.',
      'Gemini Flash writes the content; python-docx and python-pptx emit real, downloadable files.',
      'JWT auth over Prisma + PostgreSQL, with per-project chat history the assistant can read back.',
    ],
    stack: ['React 19', 'FastAPI', 'PostgreSQL', 'Prisma', 'Google Gemini', 'JWT'],
    metrics: [{ k: 'MODEL', v: 'GEMINI' }, { k: 'AUTH', v: 'JWT' }, { k: 'EXPORT', v: 'DOCX/PPTX' }],
    color: 'var(--ochre)',
    accent: 'var(--ink)',
  },
  {
    id: 'ttsched',
    repoUrl: 'https://github.com/debashish17/TT-Scheduler',
    no: '04',
    title: 'TT-SCHEDULER',
    tag: 'CONSTRAINT · WEB',
    desc: 'Building a timetable for hundreds of students, dozens of faculty and a fixed number of rooms is NP-hard. This solves it in under 60 seconds, with zero clashes guaranteed rather than merely likely.',
    bullets: [
      'OR-Tools CP-SAT enforces 8 hard constraints — faculty, room and batch overlap, capacity, contact hours, workload, room features, consecutive labs.',
      'Any violation discards the entire solution — there is no partially valid timetable.',
      'A 7-step wizard takes an institution from departments to generation, with Excel bulk import.',
      'State snapshots persist to Supabase — resume across devices, restore any past timetable.',
    ],
    stack: ['React 18', 'FastAPI', 'OR-Tools', 'PostgreSQL', 'Supabase', 'Celery'],
    metrics: [{ k: 'SOLVE', v: '<60s' }, { k: 'CONSTR', v: '8' }, { k: 'VIEWS', v: '4' }],
    color: 'var(--red)',
    accent: 'var(--ochre)',
    liveUrl: 'https://tt-scheduler.vercel.app/',
  },
  {
    id: 'riverside',
    repoUrl: 'https://github.com/debashish17/Riverside',
    no: '05',
    title: 'COLLAB · LIVE',
    tag: 'REAL-TIME · MEDIA',
    desc: 'Multi-participant video sessions that record themselves, in the shape of Riverside.fm. Video travels peer-to-peer; the recording is captured locally so quality does not depend on the call.',
    bullets: [
      'WebRTC carries the media directly between peers, with Socket.IO handling only signalling.',
      'The MediaRecorder API captures in the background from session start, then files the result to disk or S3.',
      'Recordings are organised by project behind JWT auth, over Prisma + PostgreSQL.',
      'Fully containerised with Docker Compose, including health and metrics endpoints.',
    ],
    stack: ['WebRTC', 'Socket.IO', 'Express', 'Prisma', 'PostgreSQL', 'AWS S3'],
    metrics: [{ k: 'TRANSPORT', v: 'P2P' }, { k: 'SIGNAL', v: 'WS' }, { k: 'STORE', v: 'S3' }],
    color: 'var(--ink)',
    accent: 'var(--red)',
  },
];

// ---- Card typography -------------------------------------------------
// Every card is set at ONE size in each state, driven by the longest title in
// the set rather than by each card's own string. Sizing per card put five
// different sizes on one row; a shelf of spines only reads as a shelf if the
// type is identical along it. All five also run nowrap, because line COUNT
// was disagreeing too — 'LLM-VUL' broke at its hyphen while 'SITESMITH', with
// nowhere to break, did not, and in the expanded box a second line pushed the
// blurb, chips and metrics down on two cards out of five.
//
// Measured in Chrome, Archivo Black at letter-spacing -0.04em (100px sample):
//   LLM-VUL 4.61em · SITESMITH 5.81em · FLUX 2.76em
//   TT-SCHEDULER 8.06em · COLLAB · LIVE 7.54em
// so ~0.67em per cap is the safe upper bound to budget with.
const LONGEST_TITLE = Math.max(...PROJECTS.map(p => p.title.length));

// COLLAPSED: writing-mode vertical-rl, so the line runs DOWN the card and the
// binding box is card HEIGHT, not width. The card is 100vh - 264px tall and
// gives up ~104px to the № / tag block and the bottom inset, so the run has
// about (100vh - 368px) to live in — 5vh clears LONGEST_TITLE * 0.67em at
// every height from 720 to 1440. The vw leg only takes over on narrow-but-tall
// windows, where width becomes the scarcer axis.
const V_TITLE_SIZE = LONGEST_TITLE >= 11 ? 'clamp(26px, min(3vw, 5vh), 56px)'
  : LONGEST_TITLE >= 8 ? 'clamp(30px, min(3.4vw, 6.5vh), 68px)'
  : 'clamp(36px, min(4vw, 8.5vh), 84px)';

// EXPANDED: the title is horizontal now, so the whole string binds against the
// hovered card's width. That card is flex 3 of 7 units inside a row inset 64px
// each side with four 16px gaps, less its own 24px padding either side:
//   inner = (3/7) * (100vw - 192px) - 48px  =  0.4286vw - 130px
// A plain vw fraction cannot track that — the -130px offset means the box is
// 30% of the viewport at 1024 and 38% at 2560 — so the size is expressed as
// the same affine curve, inner / (LONGEST_TITLE * 0.67em), with ~10% headroom.
const EXPANDED_TITLE_SIZE = 'clamp(22px, calc(5.2vw - 18px), 96px)';

// The ghost numeral tracked nothing at all: a flat 100/200px, cramped on a
// 1024 laptop and lost on a 2560 display. It is now the same affine curve as
// the card it sits in — collapsed cards are (100vw - 192px)/5, the expanded
// one is 3/7 of the row — with the ratio anchored to how it looked at
// 1600x900 (~0.35 of a collapsed card, ~0.33 of an expanded one) so the
// design size is unchanged and only the other sizes move to match it.
const GHOST_COLLAPSED = 'clamp(56px, calc(7vw - 13px), 150px)';
const GHOST_EXPANDED = 'clamp(110px, calc(14.1vw - 27px), 300px)';

export default function WorkPage() {
  const [active, setActive] = useState(null);

  // The chat can deep-link into a project. Covers both orders: Work already
  // mounted (event), and Work mounting right after a route change (pending).
  useEffect(() => {
    const pending = takePendingProject();
    if (pending) setActive(pending);
    const onOpen = (e) => { takePendingProject(); setActive(e.detail?.id ?? null); };
    window.addEventListener('site:open-project', onOpen);
    return () => window.removeEventListener('site:open-project', onOpen);
  }, []);
  const isMobile = useIsMobile();
  // MotionValue parallax — same feel, but no page re-render per mousemove
  const mouse = useMouseParallaxMV(isMobile ? 0 : 4);
  const discParallax = useTransform([mouse.x, mouse.y], ([x, y]) => `translate(${x * 5}px, ${y * 5}px)`);

  // Publish to x-ray mode. No scroll timeline on this page — pointer parallax only.
  useXRayRegister('work', {
    variant: isMobile ? 'mobile' : 'desktop', timeline: null, scroller: null,
    values: {
      mouseX: xv.raw(mouse.x, [-4, 4], '', 'useMouseParallaxMV.x (unsprung)'),
      mouseY: xv.raw(mouse.y, [-4, 4], '', 'useMouseParallaxMV.y (unsprung)'),
      discParallax: xv.transform(discParallax, 'decor disc · translate'),
    },
    notes: ['card width: CSS transition flex 0.6s', 'deconstruct: MotionValue tween 700ms'],
  });

  return (
    <div className="paper-bg" style={{
      position: 'absolute', inset: 0,
      overflowX: 'hidden',
      overflowY: isMobile ? 'auto' : 'hidden',
    }}>
      <div className="grid-overlay" />

      {/* Header */}
      <div className="work-header" style={{
        position: 'absolute',
        top: 32, left: 64, right: 64,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        zIndex: 5,
      }}>
        <div>
          <div className="label" style={{ color: 'var(--red)' }}>FOLIO № III · ARCHIVE</div>
          <div className="display" style={{
            fontSize: 'clamp(50px, 7vw, 110px)',
            color: 'var(--ink)',
            marginTop: 8,
          }}>
            THE WORK<span style={{ color: 'var(--red)' }}>.</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 11, opacity: 0.6 }}>
            {String(PROJECTS.length).padStart(2, '0')} · ENTRIES
          </div>
          <div className="mono" style={{ fontSize: 11, opacity: 0.6 }}>
            HOVER · CLICK TO INSPECT
          </div>
        </div>
      </div>

      {/* Background poster shapes */}
      <motion.div data-xray="DECOR · DISC" data-xray-values="mouseX,mouseY" style={{
        position: 'absolute',
        right: -120, top: 80,
        width: 380, height: 380,
        borderRadius: '50%',
        background: 'var(--red)',
        opacity: 0.08,
        transform: discParallax,
      }} />
      <div style={{
        position: 'absolute',
        left: -80, bottom: -80,
        width: 0, height: 0,
        borderTop: '300px solid var(--ink)',
        borderRight: '300px solid transparent',
        opacity: 0.06,
      }} />

      {/* Project cards */}
      <div className="work-cards-container" style={{
        position: 'absolute',
        top: 200, left: 64, right: 64, bottom: 64,
        display: 'flex',
        gap: 16,
        perspective: 1200,
      }}>
        {PROJECTS.map((p, i) => (
          <ProjectCard
            key={p.id}
            project={p}
            index={i}
            isActive={active === p.id}
            anyActive={active !== null}
            onActivate={() => setActive(p.id)}
            onDeactivate={() => setActive(null)}
          />
        ))}
      </div>

      {/* Detail overlay */}
      {active && (
        <ProjectDetail
          project={PROJECTS.find(p => p.id === active)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function ProjectCard({ project, index, isActive, anyActive, onActivate, onDeactivate }) {
  const [hover, setHover] = useState(false);
  const isMobile = useIsMobile();
  const expanded = hover && !anyActive;

  return (
    <div
      data-magnet
      data-xray={`CARD ${project.no}`}
      className="work-project-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onActivate}
      style={{
        flex: expanded ? 3 : 1,
        background: project.color,
        color: project.color === 'var(--ochre)' ? 'var(--ink)' : 'var(--cream)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'flex 0.6s cubic-bezier(.7,0,.3,1), transform 0.4s',
        overflow: 'hidden',
        transformStyle: 'preserve-3d',
        transform: anyActive && !isActive ? 'translateY(20px)' : 'translateY(0)',
        opacity: anyActive && !isActive ? 0.4 : 1,
        border: '2px solid var(--ink)',
      }}
    >
      {/* Vertical title (collapsed state) */}
      <div style={{
        position: 'absolute',
        top: 24, left: 24, right: 24,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
        zIndex: 2,
      }}>
        <div className="mono" style={{ fontSize: 11, opacity: 0.7 }}>№ {project.no}</div>
        <div className="label" style={{ opacity: 0.7 }}>{project.tag}</div>
      </div>

      {/* Big number / title */}
      <div style={{
        position: 'absolute',
        bottom: 24, left: 24, right: 24,
        pointerEvents: 'none',
      }}>
        {!expanded ? (
          <div style={isMobile ? {
            position: 'absolute',
            bottom: 16, left: 16, right: 16,
          } : {
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            position: 'absolute',
            bottom: 0, left: 0,
          }}>
            <div className="display" style={{
              fontSize: V_TITLE_SIZE,
              letterSpacing: '-0.03em',
              whiteSpace: 'nowrap',
              overflow: isMobile ? 'hidden' : 'visible',
              textOverflow: isMobile ? 'ellipsis' : 'clip',
            }}>
              {project.title}
            </div>
          </div>
        ) : (
          <div style={{
            transform: `translateZ(20px)`,
          }}>
            <div className="display" style={{
              fontSize: EXPANDED_TITLE_SIZE,
              letterSpacing: '-0.04em',
              whiteSpace: 'nowrap',
              marginBottom: 16,
            }}>
              {project.title}
            </div>
            <div style={{
              fontSize: 14,
              lineHeight: 1.5,
              maxWidth: 480,
              marginBottom: 20,
              opacity: 0.9,
            }}>
              {project.desc}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {project.stack.map(s => (
                <span key={s} className="mono" style={{
                  fontSize: 10,
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid currentColor',
                }}>{s}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              {project.metrics.map(m => (
                <div key={m.k}>
                  <div className="mono" style={{ fontSize: 10, opacity: 0.6 }}>{m.k}</div>
                  <div style={{
                    fontFamily: 'Bodoni Moda, serif',
                    fontStyle: 'italic',
                    fontWeight: 900,
                    fontSize: 28,
                  }}>{m.v}</div>
                </div>
              ))}
            </div>
            <div className="label" style={{ marginTop: 20, opacity: 0.7 }}>
              CLICK TO DECONSTRUCT →
            </div>
          </div>
        )}
      </div>

      {/* Hover decorative shape */}
      {expanded && (
        <>
          <div style={{
            position: 'absolute',
            top: 60, right: 40,
            width: 140, height: 140,
            borderRadius: '50%',
            background: project.accent,
            opacity: 0.6,
            transform: 'translateZ(10px)',
          }} />
          <div style={{
            position: 'absolute',
            top: 0, right: 0,
            width: 0, height: 0,
            borderTop: '80px solid var(--ink)',
            borderLeft: '80px solid transparent',
          }} />
        </>
      )}

      {/* Index pulse */}
      <div style={{
        position: 'absolute',
        top: 60, left: 24,
        fontFamily: 'Bodoni Moda, serif',
        fontStyle: 'italic',
        fontWeight: 900,
        fontSize: expanded ? GHOST_EXPANDED : GHOST_COLLAPSED,
        lineHeight: 0.8,
        opacity: 0.15,
        transition: 'font-size 0.6s',
        pointerEvents: 'none',
        zIndex: 1,
      }}>
        {project.no}
      </div>
    </div>
  );
}

function ProjectDetail({ project, onClose }) {
  // Deconstructed view: project explodes into separated geometric pieces.
  // One MotionValue tween drives every piece through useTransform, so Motion
  // writes the styles and React renders this overlay exactly once — it used to
  // setState from a rAF loop for 700ms (~42 renders of this whole subtree).
  useRenderCount('ProjectDetail');
  const t = useMotionValue(0);
  const isMobile = useIsMobile();
  useEffect(() => {
    const controls = animate(t, 1, { duration: 0.7, ease: easeOut });
    return () => controls.stop();
  }, [t]);
  const piece1T = useTransform(t, (v) => `translateX(${(1 - v) * -200}px) translateZ(${v * 100}px) rotate(-3deg)`);
  const piece2T = useTransform(t, (v) => `translateY(${(1 - v) * -100}px) translateZ(${v * 50}px) rotate(1deg)`);
  const piece4T = useTransform(t, (v) => `translateY(${(1 - v) * 150}px) translateZ(${v * 60}px)`);
  const piece3T = useTransform(t, (v) => `translateX(${(1 - v) * 200}px) translateZ(${v * 80}px)`);
  const piece5T = useTransform(t, (v) => `translateY(${(1 - v) * 120}px) translateZ(${v * 40}px)`);
  const decorT = useTransform(t, (v) => `translateZ(${-v * 100}px) scale(${v})`);

  return (
    <motion.div className="work-detail-overlay" style={{
      position: 'fixed',
      inset: isMobile ? 0 : 56,
      zIndex: 50,
      pointerEvents: 'auto',
      // 96%-opaque cream already reads as a scrim; the 2px backdrop blur it used
      // to carry was invisible and cost a full-screen surface every frame.
      background: 'rgba(242,234,211,0.96)',
      perspective: isMobile ? 'none' : 1400,
      opacity: isMobile ? 1 : t,
      overflowY: isMobile ? 'auto' : 'hidden',
      overflowX: 'hidden',
    }}>
      <div className="grid-overlay" />

      {/* Close */}
      <button
        onClick={onClose}
        className="clickable"
        style={{
          position: 'absolute',
          top: 24, right: 24,
          background: 'var(--ink)',
          color: 'var(--cream)',
          border: 'none',
          padding: '12px 16px',
          cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.15em',
          zIndex: 10,
        }}
      >× CLOSE</button>

      {/* Deconstructed pieces */}
      <div style={isMobile ? {
        position: 'relative',
        padding: '72px 20px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      } : {
        position: 'absolute',
        inset: 0,
        transformStyle: 'preserve-3d',
      }}>
        {/* Piece 1: number plate */}
        <motion.div className="work-detail-piece1" data-xray="DETAIL · PLATE" data-xray-render="ProjectDetail" style={isMobile ? {
          background: project.color,
          color: project.color === 'var(--ochre)' ? 'var(--ink)' : 'var(--cream)',
          padding: '12px 18px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          alignSelf: 'flex-start',
          boxShadow: '6px 6px 0 var(--ink)',
        } : {
          position: 'absolute',
          top: 80, left: '5%',
          transform: piece1T,
          background: project.color,
          color: project.color === 'var(--ochre)' ? 'var(--ink)' : 'var(--cream)',
          padding: '16px 22px',
          width: 150,
          boxShadow: '10px 10px 0 var(--ink)',
        }}>
          <div className="label" style={{ opacity: 0.7, fontSize: 9 }}>№ {project.no}</div>
          <div style={{
            fontFamily: 'Bodoni Moda, serif',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: isMobile ? 48 : 80,
            lineHeight: 0.85,
          }}>{project.no}</div>
        </motion.div>

        {/* Piece 2: title slab */}
        <motion.div className="work-detail-piece2" data-xray="DETAIL · TITLE" style={isMobile ? {
          /* nothing — just normal flow */
        } : {
          position: 'absolute',
          top: 90, left: '21%', right: '30%',
          transform: piece2T,
        }}>
          <div className="label" style={{ color: 'var(--red)', marginBottom: 8 }}>{project.tag}</div>
          <div className="display" style={{
            fontSize: isMobile ? 'clamp(32px, 8vw, 52px)' : 'clamp(40px, 5.2vw, 78px)',
            color: 'var(--ink)',
            letterSpacing: '-0.04em',
            lineHeight: 0.85,
            whiteSpace: isMobile ? 'normal' : 'nowrap',
          }}>{project.title}</div>
        </motion.div>

        {/* Piece 4: metrics */}
        <motion.div className="work-detail-piece4" data-xray="DETAIL · READINGS" style={isMobile ? {
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap',
        } : {
          position: 'absolute',
          right: '5%', top: 80,
          width: 200,
          transform: piece4T,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div className="label" style={{ color: 'var(--red)', width: '100%' }}>READINGS</div>
          {project.metrics.map(m => (
            <div key={m.k} style={{
              padding: '10px 14px',
              background: 'var(--ink)',
              color: 'var(--cream)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flex: isMobile ? '1 1 auto' : undefined,
              minWidth: isMobile ? 80 : undefined,
            }}>
              <div className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{m.k}</div>
              <div style={{
                fontFamily: 'Bodoni Moda, serif',
                fontStyle: 'italic',
                fontWeight: 900,
                fontSize: 20,
                color: 'var(--ochre)',
              }}>{m.v}</div>
            </div>
          ))}
        </motion.div>

        {/* Piece 3: BRIEF */}
        <motion.div className="work-detail-piece3" data-xray="DETAIL · BRIEF" style={isMobile ? {
          padding: '16px 20px',
          background: 'var(--cream)',
          border: '2px solid var(--ink)',
          boxShadow: '6px 6px 0 var(--red)',
        } : {
          position: 'absolute',
          // NO bottom anchor on purpose: pinning top+bottom fixes the height
          // and forces a scrollbar the moment the copy exceeds it. The box
          // sizes to its text instead. It fits because titles are now one line
          // (so it can start high) and the bullets run in two columns.
          top: 196, left: '5%', right: '30%',
          transform: piece3T,
          padding: '16px 26px',
          background: 'var(--cream)',
          border: '2px solid var(--ink)',
          boxShadow: '8px 8px 0 var(--red)',
        }}>
          <div className="label" style={{ color: 'var(--red)', marginBottom: 10 }}>BRIEF</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{project.desc}</div>
          {project.bullets && (
            <ul className="work-detail-bullets">
              {project.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </motion.div>

        {/* Piece 5: stack chips */}
        <motion.div className="work-detail-piece5" data-xray="DETAIL · INSTRUMENTS" style={isMobile ? {
          paddingBottom: 8,
        } : {
          position: 'absolute',
          bottom: 32, left: '5%', right: '5%',
          transform: piece5T,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
            <div className="label" style={{ color: 'var(--red)' }}>INSTRUMENTS</div>
            <div style={{ display: 'flex', gap: 8 }}>
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  padding: '8px 18px',
                  background: 'transparent',
                  color: 'var(--ink)',
                  border: '2px solid var(--ink)',
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'background 0.2s, color 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--ink)'; e.currentTarget.style.color = 'var(--cream)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink)'; }}
              >
                CODE ↗
              </a>
            )}
            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  padding: '8px 18px',
                  background: 'var(--ink)',
                  color: 'var(--cream)',
                  border: '2px solid var(--ink)',
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'background 0.2s, color 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--ink)'; e.currentTarget.style.borderColor = 'var(--ink)'; }}
              >
                LIVE SITE ↗
              </a>
            )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {project.stack.map(s => (
              <span key={s} style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                padding: '6px 12px',
                background: 'var(--cream)',
                border: '2px solid var(--ink)',
                fontWeight: 700,
              }}>{s}</span>
            ))}
          </div>
        </motion.div>

        {/* Decorative geometric explosions - kept behind */}
        <motion.div style={{
          position: 'absolute',
          top: '70%', right: '12%',
          width: 160, height: 160,
          borderRadius: '50%',
          background: project.accent,
          opacity: 0.12,
          transform: decorT,
          pointerEvents: 'none',
        }} />
      </div>
    </motion.div>
  );
}

window.WorkPage = WorkPage;

