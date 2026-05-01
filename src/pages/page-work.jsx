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

// WORK / PROJECTS PAGE
// Project cards that explode into deconstructed views on hover/click

const PROJECTS = [
  {
    id: 'llm-vul',
    no: '01',
    title: 'LLM-VUL',
    tag: 'AI · SECURITY',
    desc: 'C/C++ vulnerability detection platform combining static analysis with two ML layers — gradient boosting ensemble (ROC-AUC 0.905) and QLoRA fine-tuned CodeBERT (F1 0.75, Recall 91.1%).',
    stack: ['Python', 'FastAPI', 'React', 'PyTorch', 'XGBoost', 'CodeBERT', 'Docker'],
    metrics: [{ k: 'ROC-AUC', v: '0.905' }, { k: 'RECALL', v: '91.1%' }, { k: 'CORPUS', v: '718K' }],
    color: 'var(--red)',
    accent: 'var(--ink)',
  },
  {
    id: 'sitesmith',
    no: '02',
    title: 'SITESMITH',
    tag: 'AI · WEB',
    desc: 'AI-driven platform converting natural language requirements into functional web applications using LLM-based code generation and vector search for code regeneration.',
    stack: ['React', 'TypeScript', 'Express.js', 'MongoDB', 'LLM', 'Vector Search'],
    metrics: [{ k: 'INPUT', v: 'NL' }, { k: 'OUTPUT', v: 'APP' }, { k: 'EDITOR', v: 'LIVE' }],
    color: 'var(--ink)',
    accent: 'var(--red)',
  },
  {
    id: 'flux',
    no: '03',
    title: 'FLUX',
    tag: 'AI · DOCS',
    desc: 'Full-stack AI document and presentation generation platform enabling conversational creation and iterative refinement of professional files.',
    stack: ['React', 'TypeScript', 'FastAPI', 'PostgreSQL', 'Google Gemini', 'JWT'],
    metrics: [{ k: 'MODEL', v: 'GEMINI' }, { k: 'AUTH', v: 'JWT' }, { k: 'EDIT', v: 'RICH' }],
    color: 'var(--ochre)',
    accent: 'var(--ink)',
  },
  {
    id: 'ttsched',
    no: '04',
    title: 'TT-SCHEDULER',
    tag: 'CONSTRAINT · WEB',
    desc: 'Conflict-free academic timetable platform solving an NP-hard scheduling problem in under 60s using Google OR-Tools CP-SAT with 8 hard constraints. 7-step onboarding wizard, Excel I/O.',
    stack: ['React', 'FastAPI', 'OR-Tools', 'PostgreSQL', 'Supabase', 'Docker'],
    metrics: [{ k: 'SOLVE', v: '<60s' }, { k: 'CONSTR', v: '8' }, { k: 'STEPS', v: '7' }],
    color: 'var(--red)',
    accent: 'var(--ochre)',
    liveUrl: 'https://tt-scheduler.vercel.app/',
  },
  {
    id: 'riverside',
    no: '05',
    title: 'COLLAB · LIVE',
    tag: 'REAL-TIME · MEDIA',
    desc: 'Real-time video collaboration platform supporting peer-to-peer streaming and local recording. WebRTC + Socket.IO signalling, FFmpeg media processing, JWT-secured backend.',
    stack: ['WebRTC', 'Socket.IO', 'JWT', 'PostgreSQL', 'FFmpeg'],
    metrics: [{ k: 'PROTOCOL', v: 'P2P' }, { k: 'SIGNAL', v: 'WS' }, { k: 'PROC', v: 'FFMPEG' }],
    color: 'var(--ink)',
    accent: 'var(--red)',
  },
];

export default function WorkPage() {
  const [active, setActive] = useState(null);
  const isMobile = useIsMobile();
  const mouse = useMouseParallax(isMobile ? 0 : 4);

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
      <div style={{
        position: 'absolute',
        right: -120, top: 80,
        width: 380, height: 380,
        borderRadius: '50%',
        background: 'var(--red)',
        opacity: 0.08,
        transform: `translate(${mouse.x * 5}px, ${mouse.y * 5}px)`,
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
              fontSize: 'clamp(40px, 4.5vw, 64px)',
              letterSpacing: '-0.03em',
              whiteSpace: isMobile ? 'nowrap' : 'normal',
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
              fontSize: 'clamp(48px, 5vw, 80px)',
              letterSpacing: '-0.04em',
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
        fontSize: expanded ? 200 : 100,
        lineHeight: 0.8,
        opacity: 0.15,
        transition: 'font-size 0.6s',
        pointerEvents: 'none',
      }}>
        {project.no}
      </div>
    </div>
  );
}

function ProjectDetail({ project, onClose }) {
  // Deconstructed view: project explodes into separated geometric pieces
  const [t, setT] = useState(0);
  const isMobile = useIsMobile();
  useEffect(() => {
    const start = Date.now();
    let raf;
    const tick = () => {
      const dt = Math.min(1, (Date.now() - start) / 700);
      setT(easeOut(dt));
      if (dt < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="work-detail-overlay" style={{
      position: 'fixed',
      inset: isMobile ? 0 : 56,
      zIndex: 50,
      pointerEvents: 'auto',
      background: 'rgba(242,234,211,0.96)',
      backdropFilter: 'blur(2px)',
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
        <div className="work-detail-piece1" style={isMobile ? {
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
          transform: `translateX(${(1 - t) * -200}px) translateZ(${t * 100}px) rotate(-3deg)`,
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
        </div>

        {/* Piece 2: title slab */}
        <div className="work-detail-piece2" style={isMobile ? {
          /* nothing — just normal flow */
        } : {
          position: 'absolute',
          top: 90, left: '28%', right: '32%',
          transform: `translateY(${(1 - t) * -100}px) translateZ(${t * 50}px) rotate(1deg)`,
        }}>
          <div className="label" style={{ color: 'var(--red)', marginBottom: 8 }}>{project.tag}</div>
          <div className="display" style={{
            fontSize: isMobile ? 'clamp(32px, 8vw, 52px)' : 'clamp(40px, 5.2vw, 78px)',
            color: 'var(--ink)',
            letterSpacing: '-0.04em',
            lineHeight: 0.85,
          }}>{project.title}</div>
        </div>

        {/* Piece 4: metrics */}
        <div className="work-detail-piece4" style={isMobile ? {
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap',
        } : {
          position: 'absolute',
          right: '5%', top: 80,
          width: 200,
          transform: `translateY(${(1 - t) * 150}px) translateZ(${t * 60}px)`,
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
        </div>

        {/* Piece 3: BRIEF */}
        <div className="work-detail-piece3" style={isMobile ? {
          padding: '16px 20px',
          background: 'var(--cream)',
          border: '2px solid var(--ink)',
          boxShadow: '6px 6px 0 var(--red)',
        } : {
          position: 'absolute',
          top: '46%', left: '5%', right: '32%',
          transform: `translateX(${(1 - t) * 200}px) translateZ(${t * 80}px)`,
          padding: '20px 28px',
          background: 'var(--cream)',
          border: '2px solid var(--ink)',
          boxShadow: '8px 8px 0 var(--red)',
        }}>
          <div className="label" style={{ color: 'var(--red)', marginBottom: 10 }}>BRIEF</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{project.desc}</div>
        </div>

        {/* Piece 5: stack chips */}
        <div className="work-detail-piece5" style={isMobile ? {
          paddingBottom: 8,
        } : {
          position: 'absolute',
          bottom: 32, left: '5%', right: '5%',
          transform: `translateY(${(1 - t) * 120}px) translateZ(${t * 40}px)`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
            <div className="label" style={{ color: 'var(--red)' }}>INSTRUMENTS</div>
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
        </div>

        {/* Decorative geometric explosions - kept behind */}
        <div style={{
          position: 'absolute',
          top: '70%', right: '12%',
          width: 160, height: 160,
          borderRadius: '50%',
          background: project.accent,
          opacity: 0.12,
          transform: `translateZ(${-t * 100}px) scale(${t})`,
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}

window.WorkPage = WorkPage;

