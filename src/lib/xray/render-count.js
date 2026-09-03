import { useRef, useEffect } from 'react';
import { renderCounts } from './store.js';

// Counts render-function invocations. The ref write during render is deliberate —
// it is the only way to count renders without causing one. It therefore includes
// StrictMode's dev double-invoke; the HUD labels that "(dev ×2)". Production React
// strips <Profiler> callbacks, which is why this isn't built on Profiler.
export function useRenderCount(name) {
  const ref = useRef(0);
  ref.current++;
  useEffect(() => renderCounts.register(name, ref), [name]);
  return ref;
}
