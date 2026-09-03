// SERVER-SIDE ONLY. Shared request gates for every /api route.
// The `_` prefix keeps Vercel from exposing this as an endpoint.
//
// Both /api/chat and /api/contact face the same hostile internet, so the
// origin allowlist, IP extraction and rate limiting live here once.

// ------------------------------------------------------------ env sanitising
// .env files saved as UTF-8-BOM otherwise poison auth headers.
export function env(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return '';
  return raw.replace(/^﻿+/, '').trim().replace(/^["']|["']$/g, '').trim();
}

// Where visitors are told to go when something breaks. Overridable so the
// address lives in one place instead of being hardcoded across routes.
export const contactEmail = () => env('CONTACT_EMAIL') || 'ddev54081@gmail.com';

// ----------------------------------------------------------- origin allowlist
// Exact hosts + your own preview slugs. NEVER bare vercel.app — that would
// admit every attacker with a free account.
const ORIGIN_ALLOW = [
  /^https:\/\/(www\.)?dibyadebashish\.com$/,
  /^https:\/\/debashish17-dev-portfolio[a-z0-9-]*\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

export function originAllowed(origin) {
  if (!origin) return true; // curl / same-origin fetch without Origin — still rate-limited
  return ORIGIN_ALLOW.some((re) => re.test(origin));
}

// ------------------------------------------------------------------ client IP
// x-real-ip is platform-set and not forgeable. For x-forwarded-for take the
// LAST hop — the first is client-controlled.
export function clientIp(headers) {
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const hops = fwd.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return 'unknown';
}

// ---------------------------------------------------------------- rate limits
// In-memory: correct on a warm instance, resets on cold start. Upstash Redis
// (if configured) makes it durable and shared across instances. Any Redis
// error silently falls back to memory — limits must never take the site down.
const memCounters = new Map();

function memIncr(key, ttlMs) {
  const now = Date.now();
  for (const [k, v] of memCounters) if (v.expires <= now) memCounters.delete(k);
  const hit = memCounters.get(key);
  if (hit && hit.expires > now) { hit.n += 1; return hit.n; }
  memCounters.set(key, { n: 1, expires: now + ttlMs });
  return 1;
}

async function redisIncr(key, ttlSeconds) {
  const url = env('UPSTASH_REDIS_REST_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(ttlSeconds)]]),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = await res.json();
  const n = Number(out?.[0]?.result);
  if (!Number.isFinite(n)) throw new Error('redis shape');
  return n;
}

export async function incr(key, ttlSeconds) {
  try {
    const n = await redisIncr(key, ttlSeconds);
    if (n !== null) return n;
  } catch { /* fall through to memory */ }
  return memIncr(key, ttlSeconds * 1000);
}

// True when durable limits are actually active — useful for /api health output.
export const hasDurableLimits = () =>
  Boolean(env('UPSTASH_REDIS_REST_URL') && env('UPSTASH_REDIS_REST_TOKEN'));

// ------------------------------------------------------------------ responses
export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// Runs the gates every route shares. Returns a Response to send, or null to
// continue. `perMinute` and `perDay` are the caller's own budgets.
export async function guard(request, { scope, perMinute, perDay, errors }) {
  if (request.method !== 'POST') return json(405, { error: errors.method });
  if (!originAllowed(request.headers.get('origin'))) return json(403, { error: errors.origin });

  const ip = clientIp(request.headers);
  const minute = Math.floor(Date.now() / 60000);
  if ((await incr(`rl:${scope}:${ip}:${minute}`, 120)) > perMinute) {
    return json(429, { error: errors.rate });
  }
  return null;
}

// Counted separately, and only AFTER validation, so junk can't drain the day.
export async function withinDailyBudget(scope, perDay) {
  const day = new Date().toISOString().slice(0, 10);
  return (await incr(`budget:${scope}:${day}`, 172800)) <= perDay;
}
