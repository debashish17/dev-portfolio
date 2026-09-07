// One-off: adds every existing live poster to the `studio:archive` sorted set
// (score = publish time), which the ARCHIVE tab pages through. Safe to re-run:
// ZADD NX never moves a poster that is already there.
//
//   node scripts/studio-backfill-archive.cjs [--env .env.local]
const fs = require('fs');
const path = require('path');

const envFile = (process.argv.find((a) => a.startsWith('--env=')) || '--env=.env.local').slice(6);
const env = Object.fromEntries(fs.readFileSync(path.resolve(envFile), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const URL = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
if (!URL || !TOKEN) { console.error('no Redis credentials in', envFile); process.exit(1); }

async function redis(...cmds) {
  const res = await fetch(`${URL}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).map((o) => { if (o.error) throw new Error(o.error); return o.result; });
}

(async () => {
  let cursor = '0', keys = [];
  do {
    const [[next, batch]] = await redis(['SCAN', cursor, 'MATCH', 'studio:p:*', 'COUNT', '500']);
    cursor = String(next); keys.push(...batch);
  } while (cursor !== '0');
  if (!keys.length) { console.log('no posters'); return; }
  const recs = (await redis(['MGET', ...keys]))[0].map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  const live = recs.filter((r) => r.status === 'live');
  if (live.length) await redis(...live.map((r) => ['ZADD', 'studio:archive', 'NX', String(Date.parse(r.at) || Date.now()), r.id]));
  const [total] = await redis(['ZCARD', 'studio:archive']);
  console.log(`records ${recs.length} · live ${live.length} · archive now holds ${total}`);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
