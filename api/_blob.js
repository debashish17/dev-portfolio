// SERVER-SIDE ONLY. Vercel Blob for poster PNGs, share cards and layer JSON.
// When no store is connected the studio route falls back to Redis-held bytes.
import { put, del } from '@vercel/blob';
import { env } from './_guard.js';

export const blobConfigured = () => Boolean(env('BLOB_READ_WRITE_TOKEN'));

export async function putBlob(pathname, body, contentType) {
  const { url } = await put(pathname, body, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    token: env('BLOB_READ_WRITE_TOKEN'),
  });
  return url;
}

export async function delBlobs(urls) {
  const list = urls.filter(Boolean);
  if (!list.length) return;
  try { await del(list, { token: env('BLOB_READ_WRITE_TOKEN') }); } catch (e) { console.error('[blob] delete failed:', e?.message); }
}

// data:image/png;base64,… → { buffer, mime }
export function decodeDataUrl(dataUrl, allowed = ['image/png', 'image/jpeg']) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m || !allowed.includes(m[1])) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64'), base64: m[2] };
}
