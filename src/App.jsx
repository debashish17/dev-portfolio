import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RouteContext, useRoute, CustomCursor, LogoMark, LiveClock } from './components/primitives.jsx';
import Loader from './components/loader.jsx';
import HomePage from './pages/page-home.jsx';
import AboutPage from './pages/page-about.jsx';
import WorkPage from './pages/page-work.jsx';
import AchievementsPage from './pages/page-achievements.jsx';
import ContactPage from './pages/page-contact.jsx';

// MAIN APP - router, navigation, page transitions

function App() {
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState('home');
  const [transitioning, setTransitioning] = useState(false);
  const [pendingRoute, setPendingRoute] = useState(null);

  const go = useCallback((next) => {
    if (next === route || transitioning) return;
    setTransitioning(true);
    setPendingRoute(next);
    setTimeout(() => {
      setRoute(next);
      window.scrollTo(0, 0);
    }, 500);
    setTimeout(() => {
      setTransitioning(false);
      setPendingRoute(null);
    }, 1100);
  }, [route, transitioning]);

  return (
    <RouteContext.Provider value={{ route, go }}>
      {loading && <Loader onDone={() => setLoading(false)} />}

      <CustomCursor />

      {/* Nav */}
      <Nav route={route} go={go} />

      {/* Stage */}
      <div className="stage">
        <PageRenderer route={route} />
      </div>

      {/* Page transition curtain */}
      {transitioning && <TransitionCurtain pendingRoute={pendingRoute} />}
    </RouteContext.Provider>
  );
}

const ROUTES = [
  { id: 'home', no: '01', label: 'INDEX' },
  { id: 'about', no: '02', label: 'ABOUT' },
  { id: 'work', no: '03', label: 'WORK' },
  { id: 'achievements', no: '04', label: 'HONOURS' },
  { id: 'contact', no: '05', label: 'TRANSMIT' },
];

function Nav({ route, go }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const navigate = React.useCallback((id) => {
    setDrawerOpen(false);
    go(id);
  }, [go]);

  // Close drawer on outside scroll/click
  React.useEffect(() => {
    if (!drawerOpen) return;
    const close = () => setDrawerOpen(false);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return () => window.removeEventListener('keydown', close);
  }, [drawerOpen]);

  return (
    <>
      <div className="nav-rail">
        <div className="nav-mark clickable" onClick={() => navigate('home')} data-magnet>
          <LogoMark size={32} />
          <div>
            <div className="display" style={{ fontSize: 14, lineHeight: 1 }}>D.D.B</div>
            <div className="mono" style={{ fontSize: 8, opacity: 0.6, letterSpacing: '0.2em' }}>FOLIO 2026</div>
          </div>
        </div>

        {/* Desktop nav items */}
        <div className="nav-items">
          {ROUTES.map(r => (
            <div
              key={r.id}
              className={`nav-item clickable ${route === r.id ? 'active' : ''}`}
              onClick={() => navigate(r.id)}
              data-magnet
            >
              <span className="nav-item-num">{r.no}</span>
              <span style={{
                fontFamily: 'Archivo, sans-serif',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                fontSize: 11,
              }}>{r.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="mono nav-clock-location" style={{ fontSize: 10, opacity: 0.6 }}>SUNDERGARH · IN</div>
          <LiveClock />
          {/* Hamburger button — only visible on mobile (CSS toggles display) */}
          <button
            className={`nav-hamburger ${drawerOpen ? 'open' : ''}`}
            onClick={() => setDrawerOpen(o => !o)}
            aria-label="Toggle navigation"
            aria-expanded={drawerOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`nav-drawer ${drawerOpen ? 'open' : ''}`} role="navigation" aria-label="Mobile navigation">
        {ROUTES.map(r => (
          <div
            key={r.id}
            className={`nav-drawer-item ${route === r.id ? 'active' : ''}`}
            onClick={() => navigate(r.id)}
          >
            <span className="nav-item-num mono" style={{ fontSize: 11, opacity: 0.6 }}>{r.no}</span>
            <span style={{
              fontFamily: 'Archivo, sans-serif',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontSize: 14,
            }}>{r.label}</span>
          </div>
        ))}
      </div>

      {/* Backdrop */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: '56px 0 0 0',
            zIndex: 140,
            background: 'rgba(10,10,10,0.4)',
          }}
        />
      )}
    </>
  );
}

function PageRenderer({ route }) {
  switch (route) {
    case 'home': return <HomePage />;
    case 'about': return <AboutPage />;
    case 'work': return <WorkPage />;
    case 'achievements': return <AchievementsPage />;
    case 'contact': return <ContactPage />;
    default: return <HomePage />;
  }
}

// Cinematic page-transition: red/black/cream bars sweep diagonally
function TransitionCurtain({ pendingRoute }) {
  const label = ROUTES.find(r => r.id === pendingRoute)?.label || '';
  const num = ROUTES.find(r => r.id === pendingRoute)?.no || '';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 500,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {/* Three sweeping bars */}
      {[
        { c: 'var(--ink)', delay: 0, h: '40%', t: 0 },
        { c: 'var(--red)', delay: 0.08, h: '30%', t: '40%' },
        { c: 'var(--cream)', delay: 0.16, h: '30%', t: '70%' },
      ].map((b, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: b.t,
          left: 0,
          width: '100%',
          height: b.h,
          background: b.c,
          animation: `curtainSweep 1.1s cubic-bezier(.7,0,.3,1) ${b.delay}s forwards`,
          transform: 'translateX(-100%)',
        }} />
      ))}

      {/* Center label */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        animation: 'curtainLabel 1.1s ease-in-out forwards',
        opacity: 0,
        textAlign: 'center',
      }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ochre)', letterSpacing: '0.3em' }}>
          № {num}
        </div>
        <div className="display" style={{
          fontSize: 'clamp(60px, 10vw, 140px)',
          color: 'var(--cream)',
          letterSpacing: '-0.04em',
          mixBlendMode: 'difference',
        }}>
          {label}<span style={{ color: 'var(--red)' }}>.</span>
        </div>
      </div>

      {/* Spinning shape */}
      <div style={{
        position: 'absolute',
        top: '20%', right: '15%',
        width: 80, height: 80,
        background: 'var(--ochre)',
        borderRadius: '50%',
        animation: 'curtainShape 1.1s ease-in-out forwards',
        opacity: 0,
      }} />

      <style>{`
        @keyframes curtainSweep {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        @keyframes curtainLabel {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          40%, 60% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes curtainShape {
          0% { opacity: 0; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(180deg); }
          100% { opacity: 0; transform: scale(0.5) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export { App };

