// Minimal static server for the production bundle, used by the Playwright
// webServer (playwright.config.ts) so E2E can run against the real build
// instead of `ng serve` — without adding a server dependency. Serves
// dist/blackjack-trainer/browser, falling back to index.html only for
// route-like (extensionless) paths so the SPA's client-side routes work while
// a missing asset still surfaces as a real 404, matching `ng serve` and real
// static hosts.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../dist/blackjack-trainer/browser', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4200);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const shell = await readFile(join(ROOT, 'index.html'));

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

createServer(async (req, res) => {
  let path;
  try {
    path = normalize(decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname));
    // normalize() collapses any ../ so the join below cannot escape ROOT.
  } catch {
    // A malformed percent-escape ('/%.js') makes decodeURIComponent throw. This
    // handler is async, so an escaping throw is an unhandled rejection, and Node
    // ends the process on those: one such request took the whole E2E server down
    // and every test after it failed as a connection error. Deliberately scoped
    // to the parse alone — widening it to the whole handler would turn any other
    // fault in here into a silent 404.
    notFound(res);
    return;
  }
  const ext = extname(path);
  if (ext === '') {
    // Extensionless → an SPA route ('/', '/drill/…'); serve the cached shell.
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(shell);
    return;
  }
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    notFound(res);
  }
}).listen(PORT, HOST, () => {
  console.log(`serving ${ROOT} at http://${HOST}:${PORT}`);
});
