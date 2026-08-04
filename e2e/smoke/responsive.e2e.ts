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
