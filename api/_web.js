// Runs a Web-standard handler `(Request) => Response` under either calling
// convention:
//   - Bun's dev server (src/index.ts) calls it with a Request — passed straight through.
//   - Vercel's Node.js runtime invokes a default export as `(req, res)` with Node's
//     IncomingMessage/ServerResponse and ignores the return value. Without this
//     adapter the returned Response is dropped and the invocation hangs until the
//     30 s runtime timeout (observed as a 504 on /api/chat in production).
// Streaming bodies (the chat reply) are piped chunk-by-chunk into `res`.
import { Readable } from 'node:stream';

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function toRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else headers.set(k, v);
  }
  return readBody(req).then((body) => new Request(new URL(req.url, `${proto}://${host}`), { method: req.method, headers, body }));
}

async function sendResponse(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (!response.body) { res.end(); return; }
  await new Promise((resolve, reject) => {
    const src = Readable.fromWeb(response.body);
    src.on('error', reject);
    res.on('error', reject);
    res.on('finish', resolve);
    src.pipe(res);
  });
}

export function toVercel(handler) {
  return async function adapted(reqOrRequest, res) {
    if (!res || typeof res.end !== 'function') return handler(reqOrRequest); // Web signature
    try {
      const response = await handler(await toRequest(reqOrRequest));
      await sendResponse(response, res);
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ error: 'Something broke on my side — email me at ddev54081@gmail.com.' }));
      console.error('api handler failed:', err);
    }
  };
}
