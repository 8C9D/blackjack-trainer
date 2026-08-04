import { expect, test, type Page } from '@playwright/test';

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
  // The dev server serves an unregistered worker, so the suite's default local
  // run has nothing to test. Skipped, never silently passed.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const registered = await page
      .waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
        timeout: 15_000,
      })
      .then(() => true)
      .catch(() => false);
    test.skip(!registered, 'No service worker: run with E2E_SERVER=dist against a built app.');
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
});
