import { expect, test, type Page } from '@playwright/test';

import { SERVES_DIST } from '../fixtures/lane';

// 52 faces plus the face-down back.
const CARD_COUNT = 53;

async function cachedCards(page: Page): Promise<number> {
  return page.evaluate(async () => {
    let cached = 0;
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      cached += (await cache.keys()).filter((r) => r.url.includes('/cards/')).length;
    }
    return cached;
  });
}

// The one claim no unit test can check: that an installed app still works with
// the network gone. It needs the real service worker, which only a production
// build registers (`provideServiceWorker({ enabled: !isDevMode() })`), and a
// real context switched offline.
//
// What it caught: the card art sat in a `lazy` asset group, so a fresh install
// cached none of it. Install, fly, open a drill — the shell loaded, the drill
// ran, and every card was a blank rectangle with its alt text spilling out. The
// hand could not be read, which is the whole of what the app shows.
test.describe('offline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const registered = await page
      .waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
        timeout: 15_000,
      })
      .then(() => true)
      .catch(() => false);
    // What "no worker took control" means depends on the lane, and the two
    // readings are opposites.
    //
    // In the dist lane it means the production bundle shipped without the worker
    // its offline claim depends on — the defect this suite exists to report, not
    // a reason to stand down. Deciding it from runtime state made that
    // indistinguishable from the benign case: delete `ngsw-worker.js` from the
    // built bundle and the whole offline claim skipped itself, green, at
    // `109 passed, 2 skipped`, with nothing comparing that count to 111.
    //
    // In the serve lane it usually means the dev server, which registers none at
    // all (`provideServiceWorker({ enabled: !isDevMode() })`) — nothing to test.
    // But that lane reuses whatever already holds the port, and pointing it at a
    // built bundle does register a worker, so the skip stays conditional on the
    // worker rather than on the lane. Making it lane-conditional silently
    // dropped that case from `2 passed` to `2 skipped`.
    if (SERVES_DIST) {
      expect(
        registered,
        'no service worker took control of the page: the built bundle must ship and register ngsw-worker.js',
      ).toBe(true);
    } else {
      test.skip(!registered, 'No service worker on this lane: nothing to test.');
    }
    // Controlling the page is not the same as having finished installing: the
    // Angular worker activates first and goes on prefetching afterwards. Cut
    // the network at that moment and a lazy route chunk is simply missing, so
    // both tests below wait for the install to actually settle.
    await expect.poll(() => cachedCards(page), { timeout: 60_000 }).toBe(CARD_COUNT);
  });

  test('installing caches every card, so a drill deals a readable hand offline', async ({
    page,
    context,
  }) => {
    // A deck's worth of art, prefetched at install rather than as each card
    // first happens to be dealt — asserted in the beforeEach above.
    await context.setOffline(true);
    await page.goto('/drill/basic-strategy?seed=3');

    // Rendered, not merely requested: a broken image is `complete` too, and
    // reports a natural width of 0.
    const cards = page.locator('img[src^="cards/"]');
    await expect(cards.first()).toBeVisible();
    const widths = await cards.evaluateAll((imgs) =>
      imgs.map((img) => (img as HTMLImageElement).naturalWidth),
    );
    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) expect(width).toBeGreaterThan(0);
  });

  test('the shell itself still routes offline', async ({ page, context }) => {
    await context.setOffline(true);
    await page.goto('/chart');
    await expect(page.getByRole('heading', { name: 'Chart', level: 1 })).toBeVisible();
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  });

  test('the two legal pages the App Store links to serve offline', async ({ page, context }) => {
    // The pages ship in the build (angular.json copies them beside the app from
    // ios/AppStore) and sit in the worker's prefetched app group, so an
    // installed copy can show its privacy policy with the network gone (P2-5).
    // The beforeEach poll proves the cards group settled, not the app group, so
    // wait for both pages to be cached before cutting the network.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            let cached = 0;
            for (const key of await caches.keys()) {
              const cache = await caches.open(key);
              const urls = (await cache.keys()).map((request) => request.url);
              cached += urls.filter((url) => /\/(privacy|support)\.html$/.test(url)).length;
            }
            return cached;
          }),
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(2);

    await context.setOffline(true);
    for (const path of ['/privacy.html', '/support.html'] as const) {
      const response = await page.goto(path);
      expect(response?.ok(), `${path} offline answered ${response?.status()}`).toBe(true);
    }
    await expect(page.getByRole('heading', { name: 'Support', level: 1 })).toBeVisible();
  });
});
