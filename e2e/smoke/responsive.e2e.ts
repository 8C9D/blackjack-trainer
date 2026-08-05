import { expect, test } from '../fixtures/app.fixture';
import { DESKTOP, PHONE } from '../fixtures/viewports';

// The flagship browser-only property: the `.kcap` keyboard-hint chips are
// `display: inline-flex` normally and `display: none` under the 600px media
// query (styles.scss). jsdom does not apply CSS media queries, so no unit test
// can cover this — it is exactly what E2E is here to guard.
test.describe('responsive key-cap hints', () => {
  test('key hints are visible at desktop width', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await expect(page.locator('.kcap').first()).toBeVisible();
  });

  test('key hints collapse below the 600px breakpoint', async ({ page }) => {
    await page.setViewportSize(PHONE);
    // Every key cap is display:none on a touch-width viewport.
    const caps = page.locator('.kcap');
    // `count()` does not auto-wait, so it has to be preceded by something that
    // does: on a cold, contended run the home screen has not rendered its caps
    // yet and a bare count reads 0, passing the loop below vacuously.
    await expect(caps.first()).toBeAttached();
    const count = await caps.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(caps.nth(i)).toBeHidden();
    }
  });
});

// The chart's cells became tap targets when they learned to start a round, so
// they owe a minimum size — and a fixed table layout is the one thing a unit
// test cannot measure.
test.describe('chart cells as tap targets', () => {
  test('every cell clears 24px on a phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/chart');

    const cells = page.locator('.chart__cell--button');
    await expect(cells.first()).toBeVisible();
    const boxes = await cells.evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    expect(boxes.length).toBeGreaterThan(100);
    expect(Math.min(...boxes.map((b) => b.h))).toBeGreaterThanOrEqual(24);
    expect(Math.min(...boxes.map((b) => b.w))).toBeGreaterThanOrEqual(24);
  });

  // Ten columns fitting without a sideways scroll is the reason the chart spells
  // surrender 'R' at all; the wider cells must not have cost that.
  test('and the grid still fits without scrolling sideways', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/chart');
    await expect(page.locator('.chart__cell--button').first()).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});

// The Settings screen styles its checkbox rows, but that rule is scoped to its
// own component and stopped at the counting fieldset's boundary — so the two
// showdown toggles flowed inline as text and the second label wrapped under the
// first checkbox. Only a real browser lays that out, so only E2E can see it.
test.describe('settings checkbox rows', () => {
  // The showdown toggles only exist for a live shoe, which the true-count mode
  // opens on.
  async function openShowdownSettings(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/settings');
    // Exactly, or it also matches the Deviations section's "Random true count"
    // and "Manual true count".
    await page.getByRole('radio', { name: 'True count', exact: true }).check();
    await expect(page.locator('.settings__check').first()).toBeVisible();
  }

  test('each toggle takes a line of its own on a phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openShowdownSettings(page);

    const rows = await page.locator('.settings__check').evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].top).toBeGreaterThanOrEqual(rows[0].bottom);
  });

  test('and every box on the screen is the same size, big enough to hit', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openShowdownSettings(page);

    const boxes = await page
      .locator('.settings input[type="checkbox"], .settings__group input[type="checkbox"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }),
      );
    // The three table/drill rules plus the two showdown toggles.
    expect(boxes.length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...boxes.map((b) => b.h))).toBeGreaterThanOrEqual(16);
    expect(new Set(boxes.map((b) => `${b.w}x${b.h}`)).size).toBe(1);
  });
});
