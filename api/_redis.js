// SERVER-SIDE ONLY. Upstash Redis over its REST pipeline — no SDK, one fetch
// per batch. Returns null-configured cleanly so callers can degrade.
import { redisUrl, redisToken } from './_guard.js';

export const redisConfigured = () => Boolean(redisUrl() && redisToken());

// redis(['SET', k, v], ['GET', k]) → [result, result]. Throws on a transport
// error or on the first command error; callers decide whether that is fatal.
export async function redis(...cmds) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) throw new Error('redis not configured');
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds.map((c) => c.map((x) => (typeof x === 'string' ? x : String(x))))),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = await res.json();
  if (!Array.isArray(out)) throw new Error('redis shape');
  return out.map((o) => {
    if (o && o.error) throw new Error(`redis: ${o.error}`);
    return o?.result ?? null;
  });
}

export const r1 = async (...cmd) => (await redis(cmd))[0];

// JSON helpers — records are stored as strings.
export const getJson = async (key) => { const s = await r1('GET', key); if (!s) return null; try { return JSON.parse(s); } catch { return null; } };
export const setJson = (key, value, ttlSeconds) => (ttlSeconds ? r1('SET', key, JSON.stringify(value), 'EX', ttlSeconds) : r1('SET', key, JSON.stringify(value)));
export async function mgetJson(keys) {
  if (!keys.length) return [];
  const rows = await r1('MGET', ...keys);
  return (rows || []).map((s) => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } });
}
