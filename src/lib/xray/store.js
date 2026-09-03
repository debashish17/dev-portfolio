// Framework-agnostic x-ray state. It lives outside React on purpose: toggling
// x-ray must never re-render App, because App re-renders every mounted page and
// that would add a spurious "+1" to the very render counters the HUD displays.
// Components subscribe through useSyncExternalStore (see components/xray/hooks.js).

const subs = new Set();
const notify = () => { for (const fn of subs) fn(); };
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

// ---------- UI state (primitives only, so snapshots are referentially stable) ----------
// hud: null = "auto" (expanded on desktop, collapsed on mobile) until the user toggles it.
let ui = { on: false, hud: null };
// Local-only audit trail of who flipped the mode (read via window.__xray.lastChange).
const DEBUG = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
let lastChange = null;
const record = (on, via) => {
  if (!DEBUG) return;
  lastChange = { on, via, at: Math.round(performance.now()), stack: (new Error().stack || '').split('\n').slice(2, 6).map((s) => s.trim()) };
};
export const uiStore = {
  get: () => ui,
  toggle: () => { ui = { ...ui, on: !ui.on }; record(ui.on, 'toggle'); notify(); },
  setOn: (on) => { if (ui.on !== on) { ui = { ...ui, on }; record(on, 'setOn'); notify(); } },
  setHud: (hud) => { if (ui.hud !== hud) { ui = { ...ui, hud }; notify(); } },
  get lastChange() { return lastChange; },
};

// ---------- Page registry: at most one page is mounted at a time ----------
// id -> ref whose .current is the page's latest entry (see useXRayRegister).
const pages = new Map();
let version = 0;
export const pageRegistry = {
  register(id, ref) {
    pages.set(id, ref);
    version++; notify();
    return () => {
      if (pages.get(id) === ref) { pages.delete(id); version++; notify(); }
    };
  },
  touch() { version++; notify(); },
  version: () => version,
  currentId() { const k = pages.keys().next().value; return k ?? null; },
  current() { const first = pages.values().next().value; return first ? first.current : null; },
  size: () => pages.size,
};

// ---------- Render counts: name -> Set<ref> (two <LiveClock/>s sum) ----------
const counts = new Map();
export const renderCounts = {
  register(name, ref) {
    let set = counts.get(name);
    if (!set) { set = new Set(); counts.set(name, set); }
    set.add(ref);
    return () => { set.delete(ref); if (!set.size) counts.delete(name); };
  },
  get(name) {
    const set = counts.get(name);
    if (!set) return 0;
    let s = 0; for (const r of set) s += r.current;
    return s;
  },
  snapshot() {
    const out = {};
    for (const [name, set] of counts) { let s = 0; for (const r of set) s += r.current; out[name] = s; }
    return out;
  },
  names: () => [...counts.keys()],
};

// Local-only handle for the verification checklist (`window.__xray.subs.size === 0` when off).
if (typeof window !== 'undefined' && (import.meta.hot || DEBUG)) {
  window.__xray = { uiStore, pageRegistry, renderCounts, subs };
}
