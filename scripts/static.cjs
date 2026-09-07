// Minimal static server for dist/ with the SPA fallback Vercel applies in
// production (everything that is not a file → index.html). For local e2e runs.
//
//   node scripts/static.cjs [port] [dir]
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2]) || 8899;
const root = path.resolve(process.argv[3] || 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.map': 'application/json', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  // Only extension-less paths fall back to the SPA shell; a missing asset (or
  // Vercel's analytics script on localhost) must 404, never parse as HTML.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = urlPath.startsWith('/api/') || urlPath.startsWith('/_vercel/') || path.extname(urlPath) ? null : path.join(root, 'index.html');
  if (!file) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"no api on the static server"}'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`static ${root} at http://localhost:${port}/`)); // dual-stack: "localhost" may resolve to ::1
