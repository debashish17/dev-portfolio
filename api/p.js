// GET /p/:id → the share page for one poster.
//
// Crawlers (LinkedIn, X, WhatsApp, Slack, Discord) read the Open Graph tags
// from this HTML and never run scripts, so they see the poster's share card.
// Humans are forwarded at once to the app at /studio?p=:id, which renders the
// poster with LIKE and REMIX. One tiny function instead of server-rendering
// the whole SPA.
import { env } from './_guard.js';
import { toVercel } from './_web.js';
import { getJson, redisConfigured } from './_redis.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };
export default toVercel(handler);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function handler(request) {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || url.pathname.split('/').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  // _web.js already folds x-forwarded-proto/host into request.url on Vercel;
  // under Bun the URL is the real one. SITE_ORIGIN pins it if ever needed.
  const base = env('SITE_ORIGIN') || url.origin;
  const target = `${base}/studio${id ? `?p=${id}` : ''}`;

  let rec = null;
  if (id && redisConfigured()) { try { rec = await getJson(`studio:p:${id}`); } catch { rec = null; } }
  if (!rec || !['live', 'held'].includes(rec.status)) {
    return new Response(null, { status: 302, headers: { Location: `${base}/studio?wall`, 'Cache-Control': 'no-store' } });
  }

  const image = (rec.card || rec.png || '').startsWith('http') ? (rec.card || rec.png) : `${base}${rec.card || rec.png}`;
  const title = `Poster № ${rec.number} · made in the Studio`;
  const desc = `A visitor composed this in the site's own language — four inks, an 80 px grid, springs on every drag. ${rec.likes} like${rec.likes === 1 ? '' : 's'}. Like it, or remix it into your own.`;
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Dibya Debashish Bhoi · Folio 2026">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${base}/p/${id}`)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="${rec.card ? 1200 : 600}">
<meta property="og:image:height" content="${rec.card ? 630 : 800}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="canonical" href="${esc(`${base}/p/${id}`)}">
<style>html,body{margin:0;background:#F2EAD3;color:#1A1714;font:14px/1.5 Archivo,"Helvetica Neue",Arial,sans-serif}main{max-width:520px;margin:10vh auto;padding:0 24px}img{width:100%;border:3px solid #1A1714;box-shadow:10px 10px 0 #D62828}a{color:#D62828}</style>
</head><body>
<main><p>Opening poster № ${rec.number}… <a href="${esc(target)}">Continue</a></p><img src="${esc(rec.png.startsWith('http') ? rec.png : `${base}${rec.png}`)}" alt="${esc(title)}" width="480" height="640"></main>
<script>location.replace(${JSON.stringify(target)})</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
}
