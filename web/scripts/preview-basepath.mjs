import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Local preview that serves the built public/ under a sub-path (default
// /JPComedy/), so we can verify the site works when GitHub Pages hosts it at
// https://<user>.github.io/JPComedy/ rather than at a domain root. All asset
// and data references are relative, so the same files work under any base.
const publicDir = process.env.JPCOMEDY_PUBLIC_DIR || 'public';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)), publicDir) + path.sep;
const base = (process.env.JPCOMEDY_BASE || '/JPComedy/').replace(/\/*$/, '/');
const port = Number(process.env.JPCOMEDY_PORT || 4190);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/' ) { res.writeHead(302, { Location: base }); res.end(); return; }
    if (!pathname.startsWith(base)) { res.writeHead(404); res.end('Not found (serve under ' + base + ')'); return; }
    let rel = pathname.slice(base.length);
    const target = path.resolve(root, '.' + '/' + (rel === '' ? 'index.html' : rel));
    if (!target.startsWith(root) || rel.split('/').some((p) => p.startsWith('.') && p !== '')) { res.writeHead(403); res.end('Forbidden'); return; }
    const info = await stat(target);
    if (!info.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(target));
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 404); res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Base-path preview: http://127.0.0.1:${port}${base}`));
