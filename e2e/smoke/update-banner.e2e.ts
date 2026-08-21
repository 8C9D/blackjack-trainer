import { createHash } from 'node:crypto';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { SERVES_DIST } from '../fixtures/lane';

// The update offer, raised for real (finding K5). The banner's service and its
// unit tests always existed, but until this spec no gate had ever driven the
// real ngsw worker through a VERSION_READY: that takes two builds of the app,
// one installed and one arriving, which no single-bundle lane can produce. The
// first time the banner was seen at all was by hand against the deployed site,
// between two Pages deploys, three days after 1.0 shipped.
//
// This spec manufactures the two-build situation from the one bundle the dist
// lane just built: copy the bundle twice, give the second copy a one-line
// index.html change, and restate that file's hash in its ngsw.json - which is
// exactly what a rebuild would have produced, since every other file is
// content-hashed and unchanged. A private server swaps its root from the first
// copy to the second while the worker is installed, the page reloads, the
// worker's own update check finds the new manifest, and the banner must appear.
//
// Dist-lane only: the copies are of `dist/`, and the serve lane may be running
// against a dev server with no worker and no dist at this commit.

// Resolved from the working directory (the repo root, where Playwright runs)
// rather than import.meta: the runner compiles specs as CommonJS.
const DIST = join(process.cwd(), 'dist/blackjack-trainer/browser');

const MIME: Record<string, string> = {
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

// A static server whose root can be swapped mid-test - the one thing
// tools/serve-dist.mjs cannot do, since it pins its root and caches the shell
// at startup. Everything is read per-request so a swap takes effect on the
// next fetch, and the query string is dropped because the worker cache-busts
// its manifest requests (`/ngsw.json?ngsw-cache-bust=...`).
function serveSwappable(state: { root: string }): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (req, res) => {
    let path: string;
    try {
      path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname));
    } catch {
      res.writeHead(404).end();
      return;
    }
    const ext = extname(path);
    try {
      const body = await readFile(join(state.root, ext === '' ? 'index.html' : path));
      res.writeHead(200, {
        'content-type': MIME[ext === '' ? '.html' : ext] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('no port assigned');
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function installSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 30_000,
  });
  // Controlling the page is not the same as having finished installing (the
  // offline spec records why); an update arriving mid-install is not the
  // situation under test. Settled means the prefetched card art is all there.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          let cached = 0;
          for (const key of await caches.keys()) {
            const cache = await caches.open(key);
            cached += (await cache.keys()).filter((r) => r.url.includes('/cards/')).length;
          }
          return cached;
        }),
      { timeout: 60_000 },
    )
    .toBe(53);
}

test.describe('update banner', () => {
  test.skip(
    !SERVES_DIST,
    'The two-version harness copies dist/; only the dist lane just built it.',
  );

  test('a new deployed version raises the offer, and its reload serves the new version', async ({
    page,
  }) => {
    // Two "deploys" from one build. The probe meta is the observable difference
    // - the reloaded page either carries it or the update did not land.
    const v1 = test.info().outputPath('v1');
    const v2 = test.info().outputPath('v2');
    await cp(DIST, v1, { recursive: true });
    await cp(DIST, v2, { recursive: true });

    const index = join(v2, 'index.html');
    const marked = (await readFile(index, 'utf8')).replace(
      '</head>',
      '<meta name="e2e-update-probe" content="v2"></head>',
    );
    await writeFile(index, marked);
    const manifestPath = join(v2, 'ngsw.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      hashTable: Record<string, string>;
    };
    manifest.hashTable['/index.html'] = createHash('sha1')
      .update(Buffer.from(marked))
      .digest('hex');
    await writeFile(manifestPath, JSON.stringify(manifest));

    const state = { root: v1 };
    const { server, origin } = await serveSwappable(state);
    try {
      await page.goto(`${origin}/`);
      await installSettled(page);
      await expect(page.locator('meta[name="e2e-update-probe"]')).toHaveCount(0);

      // Deploy the second version and come back to the app, the way a trainee
      // re-opens the site after a release: the worker serves the installed
      // version, checks the manifest in the background, finds the new one, and
      // offers it without being asked.
      state.root = v2;
      await page.reload();
      const banner = page.getByRole('complementary', { name: 'App update available' });
      await expect(banner).toBeVisible({ timeout: 60_000 });
      await expect(banner.getByText('Update ready')).toBeVisible();
      await expect(banner.getByRole('button', { name: 'Later' })).toBeVisible();

      // The offer's own reload must land the new version, not merely reload.
      await banner.getByRole('button', { name: 'Reload', exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('meta[name="e2e-update-probe"]')?.getAttribute('content') === 'v2',
        undefined,
        { timeout: 30_000 },
      );
      await expect(page.getByRole('complementary', { name: 'App update available' })).toHaveCount(
        0,
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
