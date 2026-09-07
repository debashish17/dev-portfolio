// Browser side of /api/studio. One anonymous id per browser (for one-like-per-
// poster and "MINE"); the server pairs it with an IP rate limit.

const UID_KEY = 'studio.uid';

export function uid() {
  try {
    let v = localStorage.getItem(UID_KEY);
    if (!v) {
      v = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(UID_KEY, v);
    }
    return v;
  } catch { return 'anon'; }
}

async function call(op, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v != null && v !== ''))).toString() : '';
  const res = await fetch(`/api/studio/${op}${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-studio-uid': uid() },
    body: body ? JSON.stringify({ ...body, uid: uid() }) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const studioApi = {
  health: () => call('health'),
  wall: (period = 'week', page = 0) => call('wall', { query: { period, page: page || undefined, uid: uid() } }),
  poster: (id) => call('poster', { query: { id, uid: uid() } }),
  doc: (id) => call('doc', { query: { id } }),
  publish: (payload) => call('publish', { method: 'POST', body: payload }),
  card: (id, card) => call('card', { method: 'POST', body: { id, card } }),
  thumb: (id, thumb) => call('thumb', { method: 'POST', body: { id, thumb } }),
  like: (id) => call('like', { method: 'POST', body: { id } }),
  report: (id) => call('report', { method: 'POST', body: { id } }),
};

export const posterUrl = (id) => `${location.origin}/p/${id}`;

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
