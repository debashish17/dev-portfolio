import { useEffect, useRef, useSyncExternalStore } from 'react';
import { subscribe, uiStore, pageRegistry } from '../../lib/xray/store.js';
import { useRenderCount } from '../../lib/xray/render-count.js';

// A page publishes the MotionValues it already owns — one call, before its return.
// The entry sits in a ref refreshed every render (no re-register, no deps list);
// registration happens once per mount and is StrictMode-idempotent. A change of
// `variant` (about's isMobile flip) bumps the registry version so the overlay
// re-reads the entry; ordinary page re-renders do not notify anyone.
export function useXRayRegister(id, entry) {
  const ref = useRef(entry);
  ref.current = entry;
  useEffect(() => pageRegistry.register(id, ref), [id]);

  const prevVariant = useRef(entry?.variant);
  useEffect(() => {
    if (prevVariant.current !== entry?.variant) {
      prevVariant.current = entry?.variant;
      pageRegistry.touch();
    }
  });

  useRenderCount(id);
}

export const useXRayUi = () => useSyncExternalStore(subscribe, uiStore.get);

export function useXRayEntry() {
  useSyncExternalStore(subscribe, pageRegistry.version);
  return pageRegistry.current();
}
