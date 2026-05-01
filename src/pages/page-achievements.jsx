import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRoute, useMouseParallax, useScrollProgress, easeOut, clamp, remap, LogoMark, Circle, Bar, Triangle, Wedge, Ring, Halftone } from '../components/primitives.jsx';

// ACHIEVEMENTS PAGE - hackathon victories
// Big poster: medal/seal centered, geometric rays, achievement cards as cut-paper layers

const ACHIEVEMENTS = [
  {
    place: '1ST',
    title: 'HACKATHONX SEMI-FINALS',
    org: 'National Cyber Security Research Council · NCSRC, VIT-AP',
    prize: '₹1,00,000',
    desc: 'Discovered critical vulnerabilities in 17 Indian government websites — missing TLS/SSL certificates, SQL injection vulnerabilities, and misconfigured admin panels.',
    tags: ['CYBERSECURITY', 'PENETRATION TESTING', 'GOV CRITICAL'],
    color: 'var(--red)',
  },
  {
    place: '2ND',
    title: 'HACKAP HACKATHON',
    org: 'ahub Incubation Center',
    prize: 'TANK SAFE',
    desc: 'Built a real-time fuel transport monitoring system using IoT sensors and web dashboards to enhance logistics and prevent theft.',
    tags: ['IOT', 'REAL-TIME', 'LOGISTICS'],
    color: 'var(--ochre)',
  },
];

export default function AchievementsPage() {
  const mouse = useMouseParallax(5);
  const [hovered, setHovered] = useState(null);

  return (
    <div className="paper-bg" style={{
      position: 'absolute', inset: 0,
      overflow: 'hidden',
    }}>
      <div className="grid-overlay" />

      {/* Header */}
      <div style={{ position: 'absolute', top: 32, left: 64, zIndex: 5 }}>
        <div className="label" style={{ color: 'var(--red)' }}>FOLIO № IV · HONOURS</div>
      </div>

      {/* Background propaganda rays from top-right */}
      <div style={{
        position: 'absolute',
        top: -200, right: -200,
        width: 1200, height: 1200,
        transform: `rotate(${15 + mouse.x * 0.5}deg)`,
        pointerEvents: 'none',
      }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: 600, height: 60,
            background: i % 2 ? 'var(--red)' : 'transparent',
            opacity: i % 2 ? 0.06 : 0,
            transformOrigin: 'left center',
            transform: `translateY(-50%) rotate(${i * 30}deg)`,
          }} />
        ))}
      </div>

      {/* Big medal seal */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: 440, height: 440,
        marginLeft: -220, marginTop: -220,
        transform: `translate(${mouse.x * 4}px, ${mouse.y * 4}px)`,
        pointerEvents: 'none',
      }}>
        {/* Outer rotating ring */}
        <div style={{
          position: 'absolute', inset: 0,
          border: '3px dashed var(--ink)',
          borderRadius: '50%',
          animation: 'spin 60s linear infinite',
          opacity: 0.3,
        }} />
        {/* Star */}
        <svg viewBox="0 0 100 100" style={{
          position: 'absolute', inset: 30,
          animation: 'spinSlow 120s linear infinite',
        }}>
          <g transform="translate(50 50)">
            {Array.from({ length: 12 }).map((_, i) => (
              <polygon
                key={i}
                points="0,-44 6,0 0,44 -6,0"
                fill="var(--red)"
                opacity="0.85"
                transform={`rotate(${i * 30})`}
              />
            ))}
            <circle r="32" fill="var(--cream)" />
            <circle r="32" fill="none" stroke="var(--ink)" strokeWidth="2" />
            <text textAnchor="middle" y="-4" fontFamily="Archivo Black" fontSize="14" fill="var(--ink)" fontWeight="900">
              HONOURS
            </text>
            <text textAnchor="middle" y="14" fontFamily="Bodoni Moda" fontStyle="italic" fontSize="22" fill="var(--red)" fontWeight="900">
              MMXXVI
            </text>
          </g>
        </svg>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes spinSlow { to { transform: rotate(-360deg); } }
        `}</style>
      </div>

      {/* Big title behind/around */}
      <div style={{
        position: 'absolute',
        top: 110, left: 64, right: 64,
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div className="display" style={{
          fontSize: 'clamp(80px, 13vw, 200px)',
          color: 'var(--ink)',
          letterSpacing: '-0.05em',
          lineHeight: 0.85,
          opacity: 0.08,
        }}>
          VICTORY
        </div>
      </div>

      {/* Achievement cards — left and right */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '1fr 440px 1fr',
        alignItems: 'center',
        padding: '0 64px',
        gap: 32,
      }}>
        {/* Left card: 1st place */}
        <AchievementCard
          a={ACHIEVEMENTS[0]}
          align="right"
          rotate={-2}
          isHovered={hovered === 0}
          onHover={(v) => setHovered(v ? 0 : null)}
        />

        <div /> {/* center spacer for medal */}

        {/* Right card: 2nd place */}
        <AchievementCard
          a={ACHIEVEMENTS[1]}
          align="left"
          rotate={2}
          isHovered={hovered === 1}
          onHover={(v) => setHovered(v ? 1 : null)}
        />
      </div>

      {/* Bottom strip - quote */}
      <div style={{
        position: 'absolute',
        bottom: 32, left: 64, right: 64,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      }}>
        <div style={{
          fontFamily: 'Bodoni Moda, serif',
          fontStyle: 'italic',
          fontWeight: 900,
          fontSize: 'clamp(24px, 3vw, 42px)',
          maxWidth: 600,
          textWrap: 'balance',
          lineHeight: 1.05,
        }}>
          "Build, break, build <span style={{ color: 'var(--red)' }}>better.</span>"
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 11, opacity: 0.5 }}>
            TOTAL · 02 PODIUMS
          </div>
          <div className="mono" style={{ fontSize: 11, opacity: 0.5 }}>
            REWARD · ₹1,00,000+
          </div>
        </div>
      </div>
    </div>
  );
}

function AchievementCard({ a, align, rotate, isHovered, onHover }) {
  return (
    <div
      data-magnet
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        justifySelf: align === 'right' ? 'flex-end' : 'flex-start',
        width: 380,
        position: 'relative',
        transformStyle: 'preserve-3d',
        transform: `rotate(${isHovered ? 0 : rotate}deg) translateY(${isHovered ? -8 : 0}px) translateZ(${isHovered ? 40 : 0}px)`,
        transition: 'transform 0.4s cubic-bezier(.7,0,.3,1)',
        cursor: 'pointer',
      }}
    >
      {/* Behind shadow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: a.color,
        transform: 'translate(12px, 12px)',
        zIndex: 0,
      }} />

      {/* Main card */}
      <div style={{
        position: 'relative',
        background: 'var(--cream)',
        border: '3px solid var(--ink)',
        padding: 28,
        zIndex: 1,
      }}>
        {/* Place badge */}
        <div style={{
          position: 'absolute',
          top: -24, left: -24,
          width: 80, height: 80,
          background: a.color,
          border: '3px solid var(--ink)',
          color: a.color === 'var(--ochre)' ? 'var(--ink)' : 'var(--cream)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Bodoni Moda, serif',
          fontStyle: 'italic',
          fontWeight: 900,
          fontSize: 32,
          transform: 'rotate(-8deg)',
          boxShadow: '4px 4px 0 var(--ink)',
        }}>
          {a.place}
        </div>

        <div className="label" style={{ marginTop: 12, color: a.color }}>· PLACE ·</div>
        <div className="display" style={{
          fontSize: 24,
          marginTop: 12,
          marginBottom: 8,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          {a.title}
        </div>
        <div className="mono" style={{ fontSize: 11, opacity: 0.6, marginBottom: 16 }}>
          {a.org}
        </div>

        <div style={{
          padding: '12px 16px',
          background: 'var(--ink)',
          color: 'var(--ochre)',
          fontFamily: 'Bodoni Moda, serif',
          fontStyle: 'italic',
          fontWeight: 900,
          fontSize: 28,
          marginBottom: 16,
        }}>
          {a.prize}
        </div>

        <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
          {a.desc}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {a.tags.map(t => (
            <span key={t} className="mono" style={{
              fontSize: 9,
              padding: '3px 6px',
              border: '1px solid var(--ink)',
              fontWeight: 700,
            }}>{t}</span>
          ))}
        </div>

        {/* Corner triangle */}
        <div style={{
          position: 'absolute',
          top: 0, right: 0,
          width: 0, height: 0,
          borderTop: `40px solid ${a.color}`,
          borderLeft: '40px solid transparent',
        }} />
      </div>
    </div>
  );
}

window.AchievementsPage = AchievementsPage;

