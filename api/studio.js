// /api/studio/<op> — the Studio's one function: publish, screen, likes, the wall.
//
//   GET  health            what is connected (redis, blob, screen)
//   GET  wall?period=      week | all | archive (&page=) | latest | mine → THE TEN + contenders
//   GET  poster?id=        one poster + the caller's like state + rank
//   GET  doc?id=           layer JSON, for REMIX
//   GET  png?id=&kind=     poster/card bytes when no Blob store is connected
//   POST publish           { doc, png, originals[], remixOf } → screen → store
//   POST card              { id, card } owner uploads the rendered share card
//   POST thumb             { id, thumb } owner or admin attaches a 240 px grid thumbnail
//   POST like              { id } toggle, one per poster per browser id
//   POST report            { id } two reports hide a poster until the owner looks
//   GET  rescreen          cron: re-run the screen over held posters (Bearer CRON_SECRET)
//   GET  admin?key=        recent posters · POST delete { id, key }
//
// Storage: Upstash Redis (records, sorted sets, counters) + Vercel Blob (PNGs,
// JSON). Without Redis the route answers 503 and the studio stays export-only.
import { randomBytes } from 'node:crypto';
import { env, json, originAllowed, clientIp, incr, withinDailyBudget } from './_guard.js';
import { toVercel } from './_web.js';
import { redis, r1, getJson, setJson, mgetJson, redisConfigured } from './_redis.js';
import { putBlob, delBlobs, blobConfigured, decodeDataUrl } from './_blob.js';
import { screenImages } from './_screen.js';
import { validateDoc, needsScreen } from '../src/studio/doc.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };
export default toVercel(handler);

const LIKE_PER_MIN = 30;
const PUBLISH_PER_MIN = 3;
const READ_PER_MIN = 120;
const PUBLISH_PER_DAY = 300;                                   // global
const SCREEN_PER_DAY = Number(env('STUDIO_SCREEN_PER_DAY')) || 80; // reserve the rest of the free tier for the chat
const PNG_MAX = 560_000;    // data URL chars — a 480×640 four-ink PNG with grain is ~80–350 KB
const CARD_MAX = 760_000;
const THUMB_MAX = 200_000;
const ORIG_MAX = 260_000;
const LATEST_KEEP = 60;
const ARCHIVE_PAGE = 24;
const HIDE_AT_REPORTS = 2;

const ERR = {
  method: 'Wrong door.',
  origin: 'The studio only publishes from my own site.',
  rate: 'Easy — one poster at a time.',
  off: 'The wall is not connected yet. Export the PNG — it is yours either way.',
  daily: 'The wall has taken all the posters it can today. Export the PNG and come back tomorrow.',
  invalid: 'That poster did not read back as a poster.',
  png: 'The poster image did not arrive intact.',
  missing: 'No such poster.',
  owner: 'That is not your poster.',
  auth: 'No.',
};

// ------------------------------------------------------------------ time
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}
export function nextMonday(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + (8 - day));
  return t.toISOString();
}

// ------------------------------------------------------------------ keys
const K = {
  seq: 'studio:seq',
  rec: (id) => `studio:p:${id}`,
  doc: (id) => `studio:doc:${id}`,
  bytes: (id, kind) => `studio:${kind}:${id}`,
  week: (w) => `studio:wall:${w}`,
  all: 'studio:all',
  latest: 'studio:latest',
  archive: 'studio:archive',   // every live poster, scored by publish time
  held: 'studio:held',
  mine: (uid) => `studio:mine:${uid}`,
  likes: (id) => `studio:likes:${id}`,
  reports: (id) => `studio:reports:${id}`,
  posters: (w) => `studio:count:${w}:posters`,
  wlikes: (w) => `studio:count:${w}:likes`,
};

const newId = () => randomBytes(5).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase().padEnd(6, 'x');
const str = (v, max = 64) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const safeUid = (v) => (str(v, 80).replace(/[^a-z0-9-]/gi, '') || 'anon');

// Public shape — never the owner's id.
function pub(rec, uid) {
  if (!rec) return null;
  const { uid: owner, docUrl, ...rest } = rec;
  return { ...rest, mine: Boolean(uid) && owner === uid };
}

// ------------------------------------------------------------------ gates
async function gate(request, { scope, perMinute }) {
  if (!originAllowed(request.headers.get('origin'))) return json(403, { error: ERR.origin });
  const ip = clientIp(request.headers);
  const minute = Math.floor(Date.now() / 60000);
  if ((await incr(`rl:studio-${scope}:${ip}:${minute}`, 120)) > perMinute) return json(429, { error: ERR.rate });
  return null;
}

async function readBody(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 3_000_000) return null;
  try { return await request.json(); } catch { return null; }
}

// ------------------------------------------------------------------ handler
async function handler(request) {
  const url = new URL(request.url);
  const op = url.searchParams.get('op') || url.pathname.replace(/^\/api\/studio\/?/, '').split('/')[0] || 'health';
  const uid = safeUid(request.headers.get('x-studio-uid') || url.searchParams.get('uid'));

  if (op === 'health') return json(200, { redis: redisConfigured(), blob: blobConfigured(), screen: Boolean(env('GEMINI_API_KEY')), week: isoWeek(), resetsAt: nextMonday() });
  if (!redisConfigured()) return op === 'wall' ? json(200, { configured: false, top: [], latest: [] }) : json(503, { error: ERR.off });

  try {
    switch (op) {
      case 'wall': return await wall(request, url, uid);
      case 'poster': return await poster(request, url, uid);
      case 'doc': return await doc(request, url);
      case 'png': return await png(url);
      case 'publish': return await publish(request, uid);
      case 'card': return await card(request, uid);
      case 'thumb': return await thumb(request, url, uid);
      case 'like': return await like(request, uid);
      case 'report': return await report(request, uid);
      case 'rescreen': return await rescreen(request, url);
      case 'admin': return await admin(request, url);
      case 'delete': return await remove(request);
      default: return json(404, { error: ERR.missing });
    }
  } catch (e) {
    console.error(`[studio:${op}]`, e?.message || e);
    return json(502, { error: 'The wall did not answer. Try again in a moment.' });
  }
}

// ------------------------------------------------------------------ reads
// Records + this visitor's like flags for a list of ids, in ONE pipeline.
async function enrich(ids, uid) {
  const clean = ids.filter(Boolean);
  if (!clean.length) return [];
  const withLikes = uid && uid !== 'anon';
  const out = await redis(['MGET', ...clean.map(K.rec)], ...(withLikes ? clean.map((id) => ['SISMEMBER', K.likes(id), uid]) : []));
  const recs = (out[0] || []).map((s) => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } });
  return recs.map((r, i) => (r ? { ...pub(r, uid), liked: withLikes ? Boolean(Number(out[1 + i])) : false } : null)).filter(Boolean);
}

// Two Redis round trips: [rate-limit + ids + counts] then [records + likes].
// The wall is read on every tab switch, so latency here is what visitors feel.
async function wall(request, url, uid) {
  if (!originAllowed(request.headers.get('origin'))) return json(403, { error: ERR.origin });
  const period = ['week', 'all', 'archive', 'latest', 'mine'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'week';
  const page = Math.max(0, Math.min(500, Number(url.searchParams.get('page')) || 0));
  const week = isoWeek();
  const rlKey = `rl:studio-read:${clientIp(request.headers)}:${Math.floor(Date.now() / 60000)}`;
  const listCmd = period === 'week' ? ['ZREVRANGE', K.week(week), 0, 9]
    : period === 'all' ? ['ZREVRANGE', K.all, 0, 9]
    : period === 'archive' ? ['ZREVRANGE', K.archive, page * ARCHIVE_PAGE, page * ARCHIVE_PAGE + ARCHIVE_PAGE - 1]
    : period === 'latest' ? ['LRANGE', K.latest, 0, 23]
    : ['LRANGE', K.mine(uid), 0, 23];
  const [hits, , topIds, latestIds, posters, likes, total] = await redis(
    ['INCR', rlKey], ['EXPIRE', rlKey, 120], listCmd,
    ['LRANGE', K.latest, 0, 5], ['GET', K.posters(week)], ['GET', K.wlikes(week)], ['ZCARD', K.archive],
  );
  if (Number(hits) > READ_PER_MIN) return json(429, { error: ERR.rate });
  const ids = topIds || [];
  const latestList = period === 'week' ? (latestIds || []).filter((id) => !ids.includes(id)) : [];
  const rows = await enrich([...ids, ...latestList], uid);
  const byId = new Map(rows.map((p) => [p.id, p]));
  const top = ids.map((id) => byId.get(id)).filter((p) => p && (p.status === 'live' || period === 'mine'));
  const latest = latestList.map((id) => byId.get(id)).filter((p) => p && (p.status === 'live' || p.status === 'held'));
  const all = Number(total) || 0;
  return json(200, {
    configured: true, period, week, resetsAt: nextMonday(), top, latest,
    page, hasMore: period === 'archive' && (page + 1) * ARCHIVE_PAGE < all,
    counts: { posters: Number(posters) || 0, likes: Number(likes) || 0, all },
  });
}

async function poster(request, url, uid) {
  const blocked = await gate(request, { scope: 'read', perMinute: READ_PER_MIN });
  if (blocked) return blocked;
  const id = str(url.searchParams.get('id'), 16).toLowerCase();
  const rec = await getJson(K.rec(id));
  if (!rec || rec.status === 'removed' || rec.status === 'rejected') return json(404, { error: ERR.missing });
  if (rec.status === 'hidden' && rec.uid !== uid) return json(404, { error: ERR.missing });
  const [liked, rank, tenth] = await redis(['SISMEMBER', K.likes(id), uid], ['ZREVRANK', K.week(rec.week), id], ['ZREVRANGE', K.week(rec.week), 9, 9, 'WITHSCORES']);
  const out = { ...pub(rec, uid), liked: Boolean(Number(liked)), rank: rank == null ? null : Number(rank) + 1 };
  if (out.rank && out.rank > 10 && Array.isArray(tenth) && tenth.length === 2) out.toTen = Math.max(1, Number(tenth[1]) - rec.likes + 1);
  return json(200, { poster: out });
}

async function doc(request, url) {
  const blocked = await gate(request, { scope: 'read', perMinute: READ_PER_MIN });
  if (blocked) return blocked;
  const id = str(url.searchParams.get('id'), 16).toLowerCase();
  const rec = await getJson(K.rec(id));
  if (!rec || !['live', 'held'].includes(rec.status)) return json(404, { error: ERR.missing });
  let d = null;
  if (rec.docUrl) { try { d = await (await fetch(rec.docUrl)).json(); } catch { d = null; } }
  if (!d) d = await getJson(K.doc(id));
  if (!d) return json(404, { error: ERR.missing });
  r1('HINCRBY', 'studio:remixes', id, 1).catch(() => {});
  return json(200, { id, doc: d });
}

async function png(url) {
  const id = str(url.searchParams.get('id'), 16).toLowerCase();
  const kind = ['card', 'thumb'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'png';
  const b64 = await r1('GET', K.bytes(id, kind));
  if (!b64) return new Response('not found', { status: 404 });
  return new Response(Buffer.from(b64, 'base64'), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}

// ------------------------------------------------------------------ publish
async function storeBytes(id, kind, decoded, absoluteBase) {
  if (blobConfigured()) return putBlob(`studio/${id}/${kind}.png`, decoded.buffer, 'image/png');
  await r1('SET', K.bytes(id, kind), decoded.base64);
  return `${absoluteBase}/api/studio/png?id=${id}&kind=${kind}`;
}

async function publish(request, uid) {
  if (request.method !== 'POST') return json(405, { error: ERR.method });
  const blocked = await gate(request, { scope: 'publish', perMinute: PUBLISH_PER_MIN });
  if (blocked) return blocked;
  const body = await readBody(request);
  if (!body) return json(400, { error: ERR.invalid });

  const v = validateDoc(body.doc);
  if (v.error) return json(400, { error: `${ERR.invalid} (${v.error})` });
  const pngIn = typeof body.png === 'string' && body.png.length <= PNG_MAX ? decodeDataUrl(body.png, ['image/png']) : null;
  if (!pngIn) return json(400, { error: ERR.png });
  const thumbIn = typeof body.thumb === 'string' && body.thumb.length <= THUMB_MAX ? decodeDataUrl(body.thumb, ['image/png']) : null;
  const originals = (Array.isArray(body.originals) ? body.originals : []).slice(0, 2)
    .map((o) => (typeof o === 'string' && o.length <= ORIG_MAX ? decodeDataUrl(o, ['image/jpeg', 'image/png']) : null)).filter(Boolean);
  const remixOf = /^[a-z0-9]{4,12}$/i.test(body.remixOf || '') ? String(body.remixOf).toLowerCase() : null;

  if (!(await withinDailyBudget('studio-publish', PUBLISH_PER_DAY))) return json(429, { error: ERR.daily });

  // ---- the screen
  let status = 'live', screen = null;
  if (needsScreen(v.doc)) {
    const day = new Date().toISOString().slice(0, 10);
    const n = await incr(`budget:studio-screen:${day}`, 172800);
    if (n > SCREEN_PER_DAY) { status = 'held'; screen = { verdict: 'held', reason: 'daily screen budget' }; }
    else {
      screen = await screenImages([...originals, pngIn]);
      if (screen.verdict === 'reject') return json(200, { status: 'rejected', reason: 'The screen refused this one — nothing was published.' });
      status = screen.verdict === 'pass' ? 'live' : 'held';
    }
  }

  // ---- store
  const id = newId();
  const number = Number(await r1('INCR', K.seq));
  const week = isoWeek();
  const base = env('SITE_ORIGIN') || new URL(request.url).origin;
  const pngUrl = await storeBytes(id, 'png', pngIn, base);
  const thumbUrl = thumbIn ? await storeBytes(id, 'thumb', thumbIn, base) : null;
  let docUrl = null;
  if (blobConfigured()) docUrl = await putBlob(`studio/${id}/doc.json`, JSON.stringify(v.doc), 'application/json');
  else await setJson(K.doc(id), v.doc);

  const rec = {
    id, number, at: new Date().toISOString(), week, seed: v.doc.seed, layers: v.doc.layers.length, photos: v.photos,
    status, likes: 0, reports: 0, uid, png: pngUrl, thumb: thumbUrl, card: null, docUrl, remixOf,
    screen: screen ? { verdict: screen.verdict, model: screen.model || null, cached: Boolean(screen.cached) } : null,
  };
  const cmds = [['SET', K.rec(id), JSON.stringify(rec)], ['LPUSH', K.mine(uid), id], ['LTRIM', K.mine(uid), 0, 49]];
  if (status === 'live') cmds.push(...liveCmds(id, week));
  else cmds.push(['SADD', K.held, id]);
  await redis(...cmds);

  return json(200, { id, number, status, url: `/p/${id}`, png: pngUrl, week });
}

const liveCmds = (id, week) => [
  ['ZADD', K.week(week), 'NX', 0, id], ['ZADD', K.all, 'NX', 0, id], ['ZADD', K.archive, 'NX', Date.now(), id],
  ['LPUSH', K.latest, id], ['LTRIM', K.latest, 0, LATEST_KEEP - 1], ['INCR', K.posters(week)],
];

async function card(request, uid) {
  if (request.method !== 'POST') return json(405, { error: ERR.method });
  const blocked = await gate(request, { scope: 'publish', perMinute: PUBLISH_PER_MIN * 2 });
  if (blocked) return blocked;
  const body = await readBody(request);
  const id = str(body?.id, 16).toLowerCase();
  const rec = await getJson(K.rec(id));
  if (!rec) return json(404, { error: ERR.missing });
  if (rec.uid !== uid) return json(403, { error: ERR.owner });
  const img = typeof body.card === 'string' && body.card.length <= CARD_MAX ? decodeDataUrl(body.card, ['image/png']) : null;
  if (!img) return json(400, { error: ERR.png });
  const base = env('SITE_ORIGIN') || new URL(request.url).origin;
  // Versioned path: blobs are cached for a year at the edge, so re-attaching a
  // card must produce a new URL rather than overwrite the old one.
  const previous = rec.card;
  rec.card = await storeBytes(id, `card-${Date.now().toString(36)}`, img, base);
  await setJson(K.rec(id), rec);
  if (previous && previous.startsWith('http') && previous !== rec.card) await delBlobs([previous]);
  return json(200, { id, card: rec.card });
}

// The grid thumbnail, attachable after the fact (owner from the browser, or the
// admin key for backfills). Versioned path so a replacement is never cached stale.
async function thumb(request, url, uid) {
  if (request.method !== 'POST') return json(405, { error: ERR.method });
  const body = await readBody(request);
  const id = str(body?.id, 16).toLowerCase();
  const rec = await getJson(K.rec(id));
  if (!rec) return json(404, { error: ERR.missing });
  const asAdmin = authorised(request, new URL(`${url.origin}${url.pathname}?key=${encodeURIComponent(body?.key || '')}`));
  if (!asAdmin) {
    const blocked = await gate(request, { scope: 'publish', perMinute: PUBLISH_PER_MIN * 2 });
    if (blocked) return blocked;
    if (rec.uid !== uid) return json(403, { error: ERR.owner });
  }
  const img = typeof body.thumb === 'string' && body.thumb.length <= THUMB_MAX ? decodeDataUrl(body.thumb, ['image/png']) : null;
  if (!img) return json(400, { error: ERR.png });
  const base = env('SITE_ORIGIN') || new URL(request.url).origin;
  const previous = rec.thumb;
  rec.thumb = await storeBytes(id, `thumb-${Date.now().toString(36)}`, img, base);
  await setJson(K.rec(id), rec);
  if (previous && previous.startsWith('http') && previous !== rec.thumb) await delBlobs([previous]);
  return json(200, { id, thumb: rec.thumb });
}

// ------------------------------------------------------------------ likes & reports
async function like(request, uid) {
  if (request.method !== 'POST') return json(405, { error: ERR.method });
  const blocked = await gate(request, { scope: 'like', perMinute: LIKE_PER_MIN });
  if (blocked) return blocked;
  if (uid === 'anon') return json(400, { error: 'Likes need a browser that keeps storage.' });
  const body = await readBody(request);
  const id = str(body?.id, 16).toLowerCase();
  const rec = await getJson(K.rec(id));
  if (!rec || rec.status !== 'live') return json(404, { error: ERR.missing });
  const added = Number(await r1('SADD', K.likes(id), uid));
  const delta = added ? 1 : -1;
  if (!added) await r1('SREM', K.likes(id), uid);
  const cmds = [['ZINCRBY', K.week(rec.week), delta, id], ['ZINCRBY', K.all, delta, id]];
  if (rec.week === isoWeek()) cmds.push(['INCRBY', K.wlikes(rec.week), delta]);
  const [score] = await redis(...cmds);
  rec.likes = Math.max(0, Math.round(Number(score)));
  await setJson(K.rec(id), rec);
  return json(200, { id, likes: rec.likes, liked: Boolean(added) });
}

async function report(request, uid) {
  if (request.method !== 'POST') return json(405, { error: ERR.method });
  const blocked = await gate(request, { scope: 'like', perMinute: 10 });
  if (blocked) return blocked;
  const body = await readBody(request);
  const id = str(body?.id, 16).toLowerCase();
  const rec = await getJson(K.rec(id));
  if (!rec || rec.status !== 'live') return json(404, { error: ERR.missing });
  await r1('SADD', K.reports(id), `${uid}:${clientIp(request.headers)}`);
  rec.reports = Number(await r1('SCARD', K.reports(id)));
  let hidden = false;
  if (rec.reports >= HIDE_AT_REPORTS) { rec.status = 'hidden'; hidden = true; await redis(['ZREM', K.week(rec.week), id], ['ZREM', K.all, id], ['ZREM', K.archive, id], ['LREM', K.latest, 0, id]); }
  await setJson(K.rec(id), rec);
  return json(200, { id, reports: rec.reports, hidden });
}

// ------------------------------------------------------------------ owner & cron
function authorised(request, url) {
  const admin = env('STUDIO_ADMIN_KEY');
  const cron = env('CRON_SECRET');
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const key = url.searchParams.get('key') || '';
  return (admin && (key === admin || bearer === admin)) || (cron && bearer === cron);
}

async function rescreen(request, url) {
  if (!authorised(request, url)) return json(401, { error: ERR.auth });
  const ids = (await r1('SMEMBERS', K.held)) || [];
  const out = { checked: 0, live: 0, rejected: 0, held: 0 };
  for (const id of ids.slice(0, 40)) {
    const rec = await getJson(K.rec(id));
    if (!rec || rec.status !== 'held') { await r1('SREM', K.held, id); continue; }
    let bytes = null;
    try {
      if (rec.png.startsWith('http')) { const b = Buffer.from(await (await fetch(rec.png)).arrayBuffer()); bytes = { mime: 'image/png', base64: b.toString('base64') }; }
      else { const b64 = await r1('GET', K.bytes(id, 'png')); if (b64) bytes = { mime: 'image/png', base64: b64 }; }
    } catch { bytes = null; }
    if (!bytes) { out.held++; continue; }
    const v = await screenImages([bytes]);
    out.checked++;
    if (v.verdict === 'pass') { rec.status = 'live'; rec.screen = { verdict: 'pass', model: v.model || null, rescreened: true }; await redis(['SET', K.rec(id), JSON.stringify(rec)], ['SREM', K.held, id], ...liveCmds(id, rec.week)); out.live++; }
    else if (v.verdict === 'reject') { rec.status = 'rejected'; await redis(['SET', K.rec(id), JSON.stringify(rec)], ['SREM', K.held, id]); await delBlobs([rec.png, rec.thumb, rec.card, rec.docUrl].filter((u) => u && u.startsWith('http'))); out.rejected++; }
    else out.held++;
  }
  return json(200, out);
}

async function admin(request, url) {
  if (!authorised(request, url)) return json(401, { error: ERR.auth });
  const ids = (await r1('LRANGE', K.latest, 0, 39)) || [];
  const held = (await r1('SMEMBERS', K.held)) || [];
  const recs = await mgetJson([...new Set([...held, ...ids])].map(K.rec));
  return json(200, { week: isoWeek(), posters: recs.filter(Boolean).map((r) => ({ id: r.id, number: r.number, status: r.status, likes: r.likes, reports: r.reports, photos: r.photos, png: r.png, at: r.at })) });
}

async function remove(request) {
  if (request.method !== 'POST') return json(405, { error: ERR.method });
  const body = await readBody(request);
  const url = new URL(request.url);
  if (!authorised({ headers: request.headers }, new URL(`${url.origin}${url.pathname}?key=${encodeURIComponent(body?.key || '')}`))) return json(401, { error: ERR.auth });
  const id = str(body?.id, 16).toLowerCase();
  const rec = await getJson(K.rec(id));
  if (!rec) return json(404, { error: ERR.missing });
  rec.status = 'removed';
  await redis(['SET', K.rec(id), JSON.stringify(rec)], ['ZREM', K.week(rec.week), id], ['ZREM', K.all, id], ['ZREM', K.archive, id], ['LREM', K.latest, 0, id], ['SREM', K.held, id], ['DEL', K.doc(id), K.bytes(id, 'png'), K.bytes(id, 'card')]);
  await delBlobs([rec.png, rec.thumb, rec.card, rec.docUrl].filter((u) => u && u.startsWith('http')));
  return json(200, { id, status: 'removed' });
}
