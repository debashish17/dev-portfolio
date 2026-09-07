// Wipes every Studio poster: all `studio:*` keys in the Redis store and every
// blob under `studio/`. Rate-limit and budget keys are left alone.
//
//   node scripts/studio-reset.cjs --yes [--env .env.local]
//
// Reads the store credentials from the env file Vercel wrote (never prints
// them). Use it to clear test posters before launch, or to start a season
// over. Nothing else on the site touches these keys.
const fs = require('fs');
const path = require('path');

if (!process.argv.includes('--yes')) { console.error('This deletes every poster. Re-run with --yes.'); process.exit(2); }
const envFile = (process.argv.find((a) => a.startsWith('--env=')) || '--env=.env.local').slice(6);
const env = Object.fromEntries(fs.readFileSync(path.resolve(envFile), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const URL = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
const BLOB = env.BLOB_READ_WRITE_TOKEN;
if (!URL || !TOKEN) { console.error('no Redis credentials in', envFile); process.exit(1); }

async function redis(...cmds) {
  const res = await fetch(`${URL}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).map((o) => { if (o.error) throw new Error(o.error); return o.result; });
}

(async () => {
  let cursor = '0', keys = [];
  do {
    const [[next, batch]] = await redis(['SCAN', cursor, 'MATCH', 'studio:*', 'COUNT', '500']);
    cursor = String(next); keys.push(...batch);
  } while (cursor !== '0');
  if (keys.length) { for (let i = 0; i < keys.length; i += 200) await redis(['DEL', ...keys.slice(i, i + 200)]); }
  console.log(`redis: deleted ${keys.length} studio:* key(s)`);

  if (BLOB) {
    const { list, del } = await import('@vercel/blob');
    let deleted = 0, c;
    do {
      const page = await list({ prefix: 'studio/', cursor: c, limit: 500, token: BLOB });
      if (page.blobs.length) { await del(page.blobs.map((b) => b.url), { token: BLOB }); deleted += page.blobs.length; }
      c = page.hasMore ? page.cursor : null;
    } while (c);
    console.log(`blob: deleted ${deleted} file(s) under studio/`);
  } else console.log('blob: no token in env file, skipped');
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
