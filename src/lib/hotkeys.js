import { useEffect, useRef } from 'react';

// True when a keystroke belongs to a text field — the chat input, the contact
// form — so a plain-letter shortcut never fires while someone is typing.
export const isEditable = (t) =>
  !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

// One stable window keydown listener per call. The handler lives in a ref that
// is refreshed every render, so callers never re-register and the cleanup
// always removes the exact function it added (the old Nav effect added an
// anonymous arrow and removed a different one, leaking a listener per open).
export function useHotkey(key, handler, { enabled = true, allowInEditable = false, allowModifiers = false } = {}) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const single = key.length === 1;
    const onKey = (e) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || typeof e.key !== 'string') return;
      const hit = single ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
      if (!hit) return;
      // Cmd/Ctrl+X must still cut; Alt combos belong to the OS.
      if (!allowModifiers && (e.ctrlKey || e.metaKey || e.altKey)) return;
      if (!allowInEditable && isEditable(e.target)) return;
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, enabled, allowInEditable, allowModifiers]);
}
