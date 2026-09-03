// One-expression builders for the value descriptors a page registers with
// useXRayRegister. Shape: { mv, kind, label?, range?, unit?, spring?, window?, source? }
//   kind drives how the HUD formats the row:
//   'progress'  master scroll clock (0–1) — gets velocity, settled flag, spring config
//   'spring'    a sprung value with a declared range and its spring config
//   'seg'       a seg() sub-window on the master progress, 0–1
//   'transform' a composed transform string (shown verbatim, truncated)
//   'raw'       anything else with a declared range
export const xv = {
  progress: (mv, spring, extra = {}) => ({ mv, kind: 'progress', range: [0, 1], spring, ...extra }),
  spring: (mv, spring, range, unit = '', label) => ({ mv, kind: 'spring', spring, range, unit, label }),
  seg: (mv, window, label) => ({ mv, kind: 'seg', range: [0, 1], window, label }),
  transform: (mv, label) => ({ mv, kind: 'transform', label }),
  raw: (mv, range, unit = '', label) => ({ mv, kind: 'raw', range, unit, label }),
};
