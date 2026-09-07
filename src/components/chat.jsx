import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRoute, LogoMark } from './primitives.jsx';
import { requestProject } from '../lib/site-bus.js';

// D.D.B — the site's resident AI.
// Streams plain text from /api/chat. The API key lives only in that function.
//
// Control tokens (§6): the model may append ONE [[open:...]] / [[do:...]] to a
// reply. We strip it from the bubble and act on it — but only after checking it
// against the allowlist BELOW. Model output is untrusted; the server's list and
// this one are duplicated on purpose.

const TOKEN_RE = /\[\[\s*(open|do):\s*([a-z0-9:_-]+?)\s*\]\]/gi;
const PARTIAL_TOKEN_RE = /\[\[[^\]]*$/;

const PAGE_TOKENS = {
  home: 'home',
  about: 'about',
  work: 'work',
  honours: 'achievements',
  contact: 'contact',
  studio: 'studio',
};

// Every project lives on the Work page.
const PROJECT_TOKENS = new Set(['llm-vul', 'sitesmith', 'flux', 'ttsched', 'riverside']);

const LINK_TOKENS = {
  github: 'https://github.com/debashish17',
  linkedin: 'https://www.linkedin.com/in/debashish1729/',
};

const DO_TOKENS = new Set(['confetti']);

// A prompt-injected reply could contain any URL, so only these become clickable.
// Everything else renders as inert text. This is the anti-phishing boundary.
const ALLOWED_HOSTS = new Set([
  'github.com', 'www.linkedin.com', 'instagram.com', 'www.instagram.com',
  'dibyadebashish.com', 'www.dibyadebashish.com', 'tt-scheduler.vercel.app',
  'pulse-api-l1xa.onrender.com', 'megoforex.com', 'www.megoforex.com',
  'rbpfinivis.com', 'www.rbpfinivis.com',
]);

export function isAllowedUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return false;
  // Only this account's repos — not all of github.com.
  if (host === 'github.com' && !/^\/debashish17(\/|$)/i.test(u.pathname)) return false;
  return true;
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/g;

// Renders text with allowlisted URLs as anchors, everything else as plain text.
function Rich({ text }) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    let trail = '';
    const t = url.match(/[.,;:!?)\]]+$/); // don't swallow sentence punctuation
    if (t) { trail = t[0]; url = url.slice(0, -trail.length); }
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(isAllowedUrl(url)
      ? <a key={m.index} href={url} target="_blank" rel="noopener noreferrer" className="ddb-link">{url.replace(/^https:\/\//, '').replace(/\/$/, '')}</a>
      : url);
    if (trail) out.push(trail);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

const GREETING =
  "I'm D.D.B — Dibya's side of this site that actually talks back. Ask me about the work, the stack, or what I'm building at RBP Finivis. Or make something: there is a poster studio here.";

const CHIPS = [
  'What have you built?',
  'Can I make something here?',
  "What are you working on now?",
  'Are you open to work?',
];

// One nudge towards the Studio, once per browser, and only after the visitor
// has shown some curiosity (a second section, or a while on the first). Never
// while they are already there, never twice, gone on its own after a moment.
const NUDGE_KEY = 'ddb.nudge.studio.v1';
const NUDGE_TEXT = "Read enough? There is a Studio on this site — press a photo into four inks, compose a poster, hang it on the wall. Takes two minutes.";
const NUDGE_AFTER_MS = 45000;

const TRACE = ['UNDERSTANDING', 'SEARCHING KNOWLEDGE', 'COMPOSING'];

export const stripTokens = (text) =>
  text.replace(TOKEN_RE, '').replace(/\s+([.,!?])/g, '$1').trim();

// Pure allowlist resolver. Anything not matched here returns null and the token
// is inert — which is the whole defence against a prompt-injected [[open:...]].
export function resolveToken(kind, target) {
  const key = String(target || '').toLowerCase();
  if (String(kind).toLowerCase() === 'do') {
    return DO_TOKENS.has(key) ? { type: 'do', name: key } : null;
  }
  const [group, name] = key.split(':');
  if (group === 'page' && Object.hasOwn(PAGE_TOKENS, name)) return { type: 'page', route: PAGE_TOKENS[name] };
  if (group === 'project' && PROJECT_TOKENS.has(name)) return { type: 'project', route: 'work', id: name };
  if (group === 'link' && Object.hasOwn(LINK_TOKENS, name)) return { type: 'link', url: LINK_TOKENS[name] };
  return null;
}

// While a chunk is mid-token the visitor would otherwise see "[[open:proj…".
export const displayText = (text, streaming) => {
  const clean = stripTokens(text);
  return streaming ? clean.replace(PARTIAL_TOKEN_RE, '').trimEnd() : clean;
};

function burstConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#D62828', '#E8A33D', '#1A1714', '#F2EAD3'];
  const shapes = ['circle', 'bar', 'tri'];
  const frag = document.createDocumentFragment();
  const nodes = [];

  for (let i = 0; i < 28; i++) {
    const el = document.createElement('i');
    const shape = shapes[i % shapes.length];
    const size = 8 + Math.random() * 14;
    el.style.cssText = `position:fixed;z-index:400;pointer-events:none;left:${
      50 + (Math.random() - 0.5) * 40
    }vw;top:60vh;width:${size}px;height:${shape === 'bar' ? size / 3 : size}px;background:${
      colors[i % colors.length]
    };${shape === 'circle' ? 'border-radius:50%;' : ''}${
      shape === 'tri' ? 'clip-path:polygon(50% 0,100% 100%,0 100%);' : ''
    }`;
    frag.appendChild(el);
    nodes.push(el);
  }
  document.body.appendChild(frag);

  nodes.forEach((el) => {
    const anim = el.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${(Math.random() - 0.5) * 500}px, ${
            -200 - Math.random() * 260
          }px) rotate(${(Math.random() - 0.5) * 900}deg)`,
          opacity: 1,
          offset: 0.45,
        },
        {
          transform: `translate(${(Math.random() - 0.5) * 700}px, 60vh) rotate(${
            (Math.random() - 0.5) * 1400
          }deg)`,
          opacity: 0,
        },
      ],
      { duration: 1900 + Math.random() * 900, easing: 'cubic-bezier(.2,.6,.35,1)' },
    );
    anim.onfinish = () => el.remove();
  });
}

export default function Chat() {
  const { route, go } = useRoute();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ role: 'model', text: GREETING }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [trace, setTrace] = useState(0);
  const [unread, setUnread] = useState(false);
  const [nudge, setNudge] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const streamingRef = useRef(false);
  const nudgedRef = useRef(false);
  const firstRouteRef = useRef(route);

  const openStudio = useCallback(() => {
    setNudge(false);
    try { localStorage.setItem('studio.visited', '1'); } catch { /* private mode */ }
    go('studio');
  }, [go]);

  // The nudge: fires once when the visitor moves to a second section, or after
  // 45 s on the first — whichever comes first — unless they have been to the
  // studio (now or before) or have been nudged before.
  useEffect(() => {
    let done = false;
    try { done = localStorage.getItem(NUDGE_KEY) === '1' || localStorage.getItem('studio.visited') === '1'; } catch { done = true; }
    if (done || nudgedRef.current || route === 'studio') return undefined;
    const fire = () => {
      if (nudgedRef.current) return;
      nudgedRef.current = true;
      try { localStorage.setItem(NUDGE_KEY, '1'); } catch { /* private mode */ }
      setMsgs((prev) => [...prev, { role: 'model', text: NUDGE_TEXT, action: { label: 'OPEN THE STUDIO →', run: 'studio' } }]);
      if (!open) { setUnread(true); setNudge(true); }
    };
    if (route !== firstRouteRef.current) { fire(); return undefined; }
    const t = setTimeout(fire, NUDGE_AFTER_MS);
    return () => clearTimeout(t);
  }, [route, open]);

  // The floating nudge card leaves on its own; the message stays in the log.
  useEffect(() => {
    if (!nudge) return undefined;
    const t = setTimeout(() => setNudge(false), 9000);
    return () => clearTimeout(t);
  }, [nudge]);

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Honest thinking trace while we wait for the first token.
  useEffect(() => {
    if (!typing) { setTrace(0); return; }
    const id = setInterval(() => setTrace((t) => Math.min(t + 1, TRACE.length - 1)), 900);
    return () => clearInterval(id);
  }, [typing]);

  // Act on a control token — validated here, against our own list.
  const runToken = useCallback((kind, target) => {
    const action = resolveToken(kind, target);
    if (!action) return; // not on the allowlist: do nothing. That is the point.
    if (action.type === 'do') burstConfetti();
    else if (action.type === 'page') setTimeout(() => go(action.route), 450);
    else if (action.type === 'link') window.open(action.url, '_blank', 'noopener,noreferrer');
    else if (action.type === 'project') {
      // Park the id first, then navigate — Work reads it as it mounts.
      requestProject(action.id);
      setTimeout(() => go(action.route), 450);
    }
  }, [go]);

  const send = useCallback(async (raw) => {
    const message = (raw ?? '').trim();
    if (!message || streamingRef.current) return;

    streamingRef.current = true;
    setInput('');
    setTyping(true);

    const history = msgs
      .filter((m) => m.role === 'user' || m.role === 'model')
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text }));

    setMsgs((prev) => [...prev, { role: 'user', text: message }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setMsgs((prev) => [...prev, { role: 'sys', text: body.error || 'Something broke on my end.' }]);
        return;
      }

      setMsgs((prev) => [...prev, { role: 'model', text: '', streaming: true }]);
      setTyping(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMsgs((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'model', text: acc, streaming: true };
          return next;
        });
      }

      setMsgs((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'model', text: acc };
        return next;
      });

      // Dispatch tokens only once the reply is whole.
      const found = [...acc.matchAll(TOKEN_RE)];
      if (found.length) runToken(found[0][1], found[0][2]);
    } catch {
      setMsgs((prev) => [
        ...prev,
        { role: 'sys', text: 'Looks like I am offline — email me instead: ddev54081@gmail.com' },
      ]);
    } finally {
      streamingRef.current = false;
      setTyping(false);
      if (!open) setUnread(true);
    }
  }, [msgs, open, runToken]);

  const showChips = msgs.length === 1 && !typing;

  return (
    <>
      <button
        className={`ddb-launcher clickable ${open ? 'is-open' : ''}`}
        onClick={() => { setOpen((o) => !o); setUnread(false); }}
        aria-label={open ? 'Close chat' : 'Ask D.D.B'}
        aria-expanded={open}
        data-magnet
      >
        <span className="ddb-launcher-ring" aria-hidden="true" />
        {open ? <span className="ddb-launcher-x">×</span> : <LogoMark size={30} />}
        {unread && !open && <span className="ddb-launcher-dot" aria-hidden="true" />}
      </button>

      {nudge && !open && (
        <div className="ddb-nudge" role="status">
          <button type="button" className="ddb-nudge-x" onClick={() => setNudge(false)} aria-label="Dismiss">×</button>
          <span className="mono ddb-tag">D.D.B</span>
          <p>{NUDGE_TEXT}</p>
          <button type="button" className="ddb-nudge-go mono clickable" onClick={openStudio} data-magnet>OPEN THE STUDIO →</button>
        </div>
      )}

      <div className={`ddb-panel ${open ? 'open' : ''}`} role="dialog" aria-label="Chat with D.D.B">
        <header className="ddb-head">
          <div className="ddb-head-id">
            <span className="ddb-live" aria-hidden="true" />
            <span className="display">D.D.B</span>
            <span className="mono ddb-head-sub">RESIDENT AI</span>
          </div>
          <button className="ddb-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </header>

        <div className="ddb-log" ref={scrollRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`ddb-row ddb-row-${m.role}`}>
              {m.role === 'sys' ? (
                <div className="mono ddb-sys">{m.text}</div>
              ) : (
                <div className={`ddb-bubble ddb-bubble-${m.role}`}>
                  {m.role === 'model' && <span className="mono ddb-tag">D.D.B</span>}
                  <Rich text={displayText(m.text, m.streaming) || (m.streaming ? '' : m.text)} />
                  {m.streaming && <span className="ddb-caret" aria-hidden="true" />}
                  {m.action && <button type="button" className="ddb-action mono clickable" onClick={() => { setOpen(false); openStudio(); }}>{m.action.label}</button>}
                </div>
              )}
            </div>
          ))}

          {typing && (
            <div className="ddb-row ddb-row-model">
              <div className="mono ddb-trace">
                {TRACE.map((t, i) => (
                  <span key={t} className={i <= trace ? 'on' : ''}>
                    {t}{i < TRACE.length - 1 ? ' → ' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showChips && (
            <div className="ddb-chips">
              {CHIPS.map((c) => (
                <button key={c} className="ddb-chip mono clickable" onClick={() => send(c)}>{c}</button>
              ))}
            </div>
          )}
        </div>

        <form
          className="ddb-input"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me about the work…"
            maxLength={600}
            disabled={typing || streamingRef.current}
            aria-label="Message"
          />
          <button type="submit" disabled={!input.trim() || typing} aria-label="Send">SEND</button>
        </form>
      </div>
    </>
  );
}
