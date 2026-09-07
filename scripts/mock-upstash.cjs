// A throwaway Upstash-REST look-alike for local end-to-end runs of the Studio
// API — enough Redis for api/studio.js, in memory, over the same /pipeline
// shape. Not a Redis. Never deployed.
//
//   node scripts/mock-upstash.cjs [port]   → prints the URL to use as
//   UPSTASH_REDIS_REST_URL (any token works)
const http = require('http');

const S = new Map(); // key → { t: 'str'|'set'|'zset'|'list'|'hash', v }
const get = (k, t) => { const e = S.get(k); if (e && e.t !== t) throw new Error('WRONGTYPE'); return e?.v; };
const ensure = (k, t, mk) => { let e = S.get(k); if (!e) { e = { t, v: mk() }; S.set(k, e); } else if (e.t !== t) throw new Error('WRONGTYPE'); return e.v; };
const num = (v) => Number(v);

const CMD = {
  SET(k, v, ...opt) { S.set(k, { t: 'str', v: String(v) }); return 'OK'; },
  GET(k) { return get(k, 'str') ?? null; },
  MGET(...ks) { return ks.map((k) => { const e = S.get(k); return e && e.t === 'str' ? e.v : null; }); },
  DEL(...ks) { let n = 0; for (const k of ks) n += S.delete(k) ? 1 : 0; return n; },
  EXPIRE() { return 1; },
  INCR(k) { return CMD.INCRBY(k, 1); },
  INCRBY(k, by) { const cur = num(get(k, 'str') ?? 0) + num(by); S.set(k, { t: 'str', v: String(cur) }); return cur; },
  SADD(k, ...ms) { const s = ensure(k, 'set', () => new Set()); let n = 0; for (const m of ms) if (!s.has(m)) { s.add(m); n++; } return n; },
  SREM(k, ...ms) { const s = get(k, 'set'); if (!s) return 0; let n = 0; for (const m of ms) n += s.delete(m) ? 1 : 0; return n; },
  SISMEMBER(k, m) { const s = get(k, 'set'); return s && s.has(m) ? 1 : 0; },
  SCARD(k) { return get(k, 'set')?.size ?? 0; },
  SMEMBERS(k) { return [...(get(k, 'set') ?? [])]; },
  ZADD(k, ...args) {
    const z = ensure(k, 'zset', () => new Map());
    let nx = false; const rest = [];
    for (const a of args) { if (/^(NX|XX|GT|LT|CH)$/i.test(a)) { if (/^NX$/i.test(a)) nx = true; } else rest.push(a); }
    let n = 0;
    for (let i = 0; i < rest.length; i += 2) { const score = num(rest[i]), m = rest[i + 1]; if (nx && z.has(m)) continue; if (!z.has(m)) n++; z.set(m, score); }
    return n;
  },
  ZINCRBY(k, by, m) { const z = ensure(k, 'zset', () => new Map()); const v = (z.get(m) ?? 0) + num(by); z.set(m, v); return String(v); },
  ZREM(k, ...ms) { const z = get(k, 'zset'); if (!z) return 0; let n = 0; for (const m of ms) n += z.delete(m) ? 1 : 0; return n; },
  ZCARD(k) { return get(k, 'zset')?.size ?? 0; },
  ZREVRANGE(k, start, stop, ...opt) {
    const z = get(k, 'zset'); if (!z) return [];
    const sorted = [...z.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
    const s = num(start), e = num(stop); const slice = sorted.slice(s, e < 0 ? sorted.length + e + 1 : e + 1);
    return opt.some((o) => /^WITHSCORES$/i.test(o)) ? slice.flatMap(([m, sc]) => [m, String(sc)]) : slice.map(([m]) => m);
  },
  ZREVRANK(k, m) { const z = get(k, 'zset'); if (!z || !z.has(m)) return null; const sorted = [...z.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1)); return sorted.findIndex(([x]) => x === m); },
  LPUSH(k, ...vs) { const l = ensure(k, 'list', () => []); for (const v of vs) l.unshift(v); return l.length; },
  LTRIM(k, start, stop) { const l = get(k, 'list'); if (!l) return 'OK'; const s = num(start), e = num(stop); const kept = l.slice(s, e < 0 ? l.length + e + 1 : e + 1); l.length = 0; l.push(...kept); return 'OK'; },
  LRANGE(k, start, stop) { const l = get(k, 'list'); if (!l) return []; const s = num(start), e = num(stop); return l.slice(s, e < 0 ? l.length + e + 1 : e + 1); },
  LREM(k, count, v) { const l = get(k, 'list'); if (!l) return 0; let n = 0; for (let i = l.length - 1; i >= 0; i--) if (l[i] === v) { l.splice(i, 1); n++; } return n; },
  HINCRBY(k, f, by) { const h = ensure(k, 'hash', () => new Map()); const v = (num(h.get(f)) || 0) + num(by); h.set(f, String(v)); return v; },
};

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/pipeline')) { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let cmds;
    try { cmds = JSON.parse(body); } catch { res.writeHead(400); res.end('bad json'); return; }
    const out = cmds.map((c) => {
      const [name, ...args] = c;
      const fn = CMD[String(name).toUpperCase()];
      if (!fn) return { error: `ERR unknown command '${name}'` };
      try { return { result: fn(...args.map(String)) }; } catch (e) { return { error: e.message }; }
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

const port = Number(process.argv[2]) || 8790;
server.listen(port, '127.0.0.1', () => console.log(`mock upstash at http://127.0.0.1:${port}`));
