import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRoute, useMouseParallax, useScrollProgress, easeOut, clamp, remap, LogoMark, Circle, Bar, Triangle, Wedge, Ring, Halftone, LiveClock, SectionMarker } from '../components/primitives.jsx';
// CONTACT PAGE
// Big propaganda-style "TRANSMIT" panel with form + contact details

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handle = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return mobile;
}

export default function ContactPage() {
  const isMobile = useIsMobile();
  const mouse = useMouseParallax(isMobile ? 0 : 5);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setStatus('sending');
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: '67f9b1b1-2b66-44d0-84fd-269897717e5e',
          name: form.name,
          email: form.email,
          message: form.message,
          subject: `Portfolio message from ${form.name}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('sent');
        setTimeout(() => {
          setStatus('idle');
          setForm({ name: '', email: '', message: '' });
        }, 4000);
      } else {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="paper-bg" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div className="grid-overlay" />

      {/* Header */}
      <div style={{ position: 'absolute', top: 32, left: 64, zIndex: 5 }}>
        <div className="label" style={{ color: 'var(--red)' }}>FOLIO № V · TRANSMIT</div>
      </div>

      {/* Background giant ring */}
      <div style={{
        position: 'absolute',
        right: -300, top: -200,
        width: 800, height: 800,
        border: '3px solid var(--ink)',
        borderRadius: '50%',
        opacity: 0.1,
        transform: `translate(${mouse.x * 4}px, ${mouse.y * 4}px)`,
      }} />
      <div style={{
        position: 'absolute',
        left: -120, bottom: -120,
        width: 380, height: 380,
        background: 'var(--red)',
        borderRadius: '50%',
        opacity: 0.12,
      }} />

      {/* Big background type */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        textAlign: 'center',
      }}>
        <div className="display" style={{
          fontSize: 'clamp(140px, 20vw, 320px)',
          color: 'var(--ink)',
          letterSpacing: '-0.06em',
          lineHeight: 0.85,
          opacity: 0.06,
        }}>
          TRANSMIT
        </div>
      </div>

      {/* Two column layout */}
      <div className="contact-grid" style={{
        position: 'absolute',
        top: 100, bottom: 80, left: 64, right: 64,
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr',
        gap: 64,
        alignItems: 'center',
      }}>
        {/* LEFT: contact details */}
        <div style={{ position: 'relative' }}>
          <div className="display" style={{
            fontSize: 'clamp(60px, 8vw, 120px)',
            color: 'var(--ink)',
            letterSpacing: '-0.04em',
            lineHeight: 0.85,
            marginBottom: 24,
          }}>
            LET'S<br />
            <span style={{ color: 'var(--red)' }}>BUILD.</span>
          </div>

          <div style={{
            fontSize: 17,
            lineHeight: 1.5,
            maxWidth: 480,
            marginBottom: 32,
            textWrap: 'pretty',
          }}>
            Open to internships, full-time roles, and collaboration on AI &
            full-stack projects. Pen the message — or reach out direct.
          </div>

          {/* Contact rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
            <ContactRow label="EMAIL" value="ddev54081@gmail.com" href="mailto:ddev54081@gmail.com" />

            <ContactRow label="GITHUB" value="@debashish17" href="https://github.com/debashish17" />
            <ContactRow label="LINKEDIN" value="Dibya Debashish Bhoi" href="https://www.linkedin.com/in/debashish1729/" />
            <ContactRow label="INSTAGRAM" value="@debashish_1719" href="https://instagram.com/debashish_1719" />
          </div>
        </div>

        {/* RIGHT: transmission card */}
        <div style={{
          position: 'relative',
          transform: `translate(${mouse.x * -2}px, ${mouse.y * -2}px)`,
        }}>
          {/* Behind shadow */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--red)',
            transform: 'translate(14px, 14px)',
          }} />
          <div style={{
            position: 'relative',
            background: 'var(--ink)',
            color: 'var(--cream)',
            padding: 40,
            border: '3px solid var(--ink)',
          }}>
            {/* Corner block */}
            <div style={{
              position: 'absolute',
              top: 0, right: 0,
              width: 0, height: 0,
              borderTop: '60px solid var(--ochre)',
              borderLeft: '60px solid transparent',
            }} />

            <div className="label" style={{ color: 'var(--ochre)', marginBottom: 8 }}>· TRANSMISSION FORM ·</div>
            <div className="display" style={{ fontSize: 36, marginBottom: 24, letterSpacing: '-0.02em' }}>
              SEND<span style={{ color: 'var(--red)' }}>.</span>
            </div>

            {status === 'sent' ? (
              <div style={{
                padding: '40px 0',
                textAlign: 'center',
              }}>
                <div style={{
                  width: 80, height: 80,
                  margin: '0 auto 20px',
                  background: 'var(--red)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 40,
                  animation: 'pulseScale 0.8s ease-out',
                }}>
                  ✓
                </div>
                <div className="display" style={{ fontSize: 24, color: 'var(--ochre)' }}>
                  TRANSMITTED.
                </div>
                <div className="mono" style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>
                  RECEIPT NO. {Math.floor(Math.random() * 9000 + 1000)}-XX
                </div>
                <style>{`
                  @keyframes pulseScale {
                    0% { transform: scale(0); }
                    60% { transform: scale(1.15); }
                    100% { transform: scale(1); }
                  }
                `}</style>
              </div>
            ) : (
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field
                  label="DESIGNATION"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  placeholder="Your name"
                />
                <Field
                  label="SIGNAL"
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v })}
                  placeholder="Your email"
                  type="email"
                />
                <FieldArea
                  label="MESSAGE"
                  value={form.message}
                  onChange={(v) => setForm({ ...form, message: v })}
                  placeholder="What are we building?"
                />
                {status === 'error' && (
                  <div className="mono" style={{ fontSize: 11, color: 'var(--red)', letterSpacing: '0.1em' }}>
                    TRANSMISSION FAILED · TRY AGAIN
                  </div>
                )}
                <button type="submit" disabled={status === 'sending'} style={{
                  marginTop: 8,
                  padding: '16px 24px',
                  background: status === 'sending' ? 'var(--ochre)' : 'var(--red)',
                  color: 'var(--cream)',
                  border: '2px solid var(--cream)',
                  cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                  fontFamily: 'Archivo, sans-serif',
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.2s',
                }} className="clickable" data-magnet>
                  <span>{status === 'sending' ? 'TRANSMITTING...' : 'TRANSMIT'}</span>
                  <span>{status === 'sending' ? '···' : '→'}</span>
                </button>
              </form>
            )}

            <div style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid rgba(242,234,211,0.15)',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <div className="mono" style={{ fontSize: 10, opacity: 0.6 }}>
                CHANNEL · DIRECT
              </div>
              <div className="mono" style={{ fontSize: 10, opacity: 0.6 }}>
                <LiveClock />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactRow({ label, value, href }) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag
      href={href}
      target={href && href.startsWith('http') ? '_blank' : undefined}
      data-magnet={href ? '' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr 24px',
        alignItems: 'center',
        gap: 16,
        padding: '14px 0',
        borderBottom: '1px solid rgba(10,10,10,0.15)',
        textDecoration: 'none',
        color: 'var(--ink)',
        cursor: href ? 'pointer' : 'default',
        transition: 'transform 0.2s, color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (href) {
          e.currentTarget.style.transform = 'translateX(8px)';
          e.currentTarget.style.color = 'var(--red)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.color = '';
      }}
    >
      <div className="label" style={{ color: 'var(--red)' }}>{label}</div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
        fontWeight: 600,
      }}>{value}</div>
      {href && <div style={{ fontWeight: 800 }}>↗</div>}
    </Tag>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <div className="label" style={{ color: 'var(--ochre)', marginBottom: 6 }}>{label}</div>
      <input
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          borderBottom: '2px solid var(--cream)',
          color: 'var(--cream)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 14,
          outline: 'none',
        }}
      />
    </div>
  );
}

function FieldArea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="label" style={{ color: 'var(--ochre)', marginBottom: 6 }}>{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          borderBottom: '2px solid var(--cream)',
          color: 'var(--cream)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 14,
          outline: 'none',
          resize: 'none',
        }}
      />
    </div>
  );
}

window.ContactPage = ContactPage;

