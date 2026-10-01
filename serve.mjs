// Tiny static server for previewing the built site: node serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, 'site');
const PORT = +(process.argv[2] || process.env.PORT || 4321);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const resolve = urlPath => {
  let p = decodeURIComponent(urlPath.split('?')[0]).replace(/\/+$/, '') || '/';
  const candidates = [path.join(ROOT, p), path.join(ROOT, p, 'index.html'), path.join(ROOT, p + '.html')];
  for (const c of candidates) {
    if (!c.startsWith(ROOT)) continue;
    try { if (fs.statSync(c).isFile()) return c; } catch {}
  }
  return null;
};

http.createServer((req, res) => {
  const file = resolve(req.url);
  const send = (status, f) => {
    res.writeHead(status, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  };
  if (file) return send(200, file);
  send(404, path.join(ROOT, '404.html'));
}).listen(PORT, () => console.log(`Kingsdown School preview: http://localhost:${PORT}`));
