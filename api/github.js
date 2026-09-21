// GET /api/github — a year of contribution counts for the landing page.
//
// GitHub has no REST endpoint for the contribution calendar; it only exists in
// the GraphQL API, and that requires a token even for public data. So the
// token lives here, never in the bundle, and the answer is cached in Upstash.
//
// Cache policy: fresh for 6 h, but kept for 4 days. Past 6 h we try GitHub and
// fall back to the stale copy if it fails — a slightly old graph is always
// better than an empty one, because a blank calendar reads as "inactive",
// which is the opposite of what this section exists to say.

import { env, json } from './_guard.js';
import { toVercel } from './_web.js';
import { getJson, setJson, redisConfigured } from './_redis.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

export default toVercel(handler);

const LOGIN = () => env('GITHUB_LOGIN') || 'debashish17';
const CACHE_KEY = 'gh:contrib:v1';
const FRESH_MS = 6 * 60 * 60 * 1000;
const KEEP_SECONDS = 4 * 24 * 60 * 60;
const UPSTREAM_TIMEOUT_MS = 9000;

const QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{
          firstDay
          contributionDays{ date weekday contributionCount }
        }
      }
    }
  }
}`;

async function handler(request) {
  if (request.method !== 'GET') return json(405, { error: 'GET only' });

  let cached = null;
  if (redisConfigured()) {
    try { cached = await getJson(CACHE_KEY); } catch { /* cache is optional */ }
  }
  if (cached && Date.now() - (cached.fetchedAt || 0) < FRESH_MS) return ok(cached);

  const token = env('GITHUB_TOKEN');
  if (!token) return cached ? ok(cached) : json(503, { error: 'github not configured' });

  try {
    const fresh = await fetchCalendar(LOGIN(), token);
    if (redisConfigured()) {
      try { await setJson(CACHE_KEY, fresh, KEEP_SECONDS); } catch { /* non-fatal */ }
    }
    return ok(fresh);
  } catch (err) {
    if (cached) return ok(cached);                       // stale beats empty
    return json(502, { error: 'github unavailable' });
  }
}

// Let the CDN hold it too, and serve stale while revalidating behind the scenes.
function ok(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

async function fetchCalendar(login, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'dibyadebashish.com',
      },
      body: JSON.stringify({ query: QUERY, variables: { login } }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`github ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0]?.message || 'graphql error');

  const cal = body?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error('unexpected shape');

  // Compact wire format: one array of 7 counts per week, weekday-indexed
  // (0 = Sunday), with null where the calendar's first and last weeks are
  // partial. Counts only — dates are derivable from firstDay on the client.
  const weeks = cal.weeks.map((w) => {
    const days = new Array(7).fill(null);
    for (const d of w.contributionDays) days[d.weekday] = d.contributionCount;
    return days;
  });

  const first = cal.weeks[0]?.firstDay || null;
  const lastWeek = cal.weeks[cal.weeks.length - 1];
  const last = lastWeek?.contributionDays?.[lastWeek.contributionDays.length - 1]?.date || null;

  return {
    total: cal.totalContributions,
    weeks,
    from: first,
    to: last,
    fetchedAt: Date.now(),
  };
}
