// Tiny zero-dependency static server for local testing (npm run serve).
// Serves the repo root by default, or dist/ if it exists and --dist is passed.
// Mirrors the security headers configured for production (netlify.toml).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const useDist = process.argv.includes('--dist');
const BASE = join(ROOT, useDist ? 'dist' : '.');
const PORT = process.env.PORT || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; "
  + "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
  + "manifest-src 'self'; base-uri 'none'; object-src 'none'; "
  + "form-action 'none'; frame-ancestors 'none'";

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.includes('..')) { res.writeHead(400); return res.end('Bad request'); }
    if (path === '/' || path.endsWith('/')) path += 'index.html';

    let file = join(BASE, path);
    let body;
    try {
      const s = await stat(file);
      if (s.isDirectory()) file = join(file, 'index.html');
      body = await readFile(file);
    } catch {
      // SPA / share-link fallback: serve the app shell.
      file = join(BASE, 'index.html');
      body = await readFile(file);
    }

    const ext = extname(file);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (file.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end('Server error: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${useDist ? 'dist/' : 'repo root'} at http://localhost:${PORT}`);
});
