import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/app.fixture';
import {
  configureCounting,
  configureKeyCount,
  runCountingRound,
  standEveryBox,
} from '../fixtures/flows';

// Structural accessibility guards. These are the checks that regress silently
// when markup moves: the landmark a screen-reader user skips to, the single
// page heading, labelled controls, and readable text in both themes. Contrast
// is computed here rather than eyeballed, so a palette edit that drops a pair
// under WCAG AA fails the build.

const ROUTES = [
  '/',
  '/settings',
  '/chart',
  '/drill/basic-strategy',
  '/drill/deviations',
  '/drill/card-counting',
] as const;

// Every text node's rendered color against its nearest opaque background,
// returning only the pairs that miss WCAG AA (4.5:1, or 3:1 for large text).
async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const parse = (str: string) => {
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,/]/).map((v) => parseFloat(v.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    type Rgb = { r: number; g: number; b: number; a: number };
    const luminance = (c: Rgb) =>
      0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
    const ratio = (fg: Rgb, bg: Rgb) => {
      const a = luminance(fg);
      const b = luminance(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    // Flatten a translucent foreground onto its backdrop before measuring.
    const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb => ({
      r: alpha * fg.r + (1 - alpha) * bg.r,
      g: alpha * fg.g + (1 - alpha) * bg.g,
      b: alpha * fg.b + (1 - alpha) * bg.b,
      a: 1,
    });
    const backdrop = (el: Element): Rgb => {
      let node: Element | null = el;
      while (node && node !== document.documentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0.95) return bg;
        node = node.parentElement;
      }
      return (
        parse(getComputedStyle(document.documentElement).backgroundColor) ?? {
          r: 255,
          g: 255,
          b: 255,
          a: 1,
        }
      );
    };

    const failures: { text: string; cls: string; ratio: number; need: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .join('');
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const alpha = parseFloat(cs.opacity);
      if (alpha === 0) continue;
      // Visually-hidden helper text is exposed to assistive tech, not to eyes.
      if (el.classList.contains('sr-only')) continue;
      // WCAG 1.4.3 exempts text in inactive (disabled) controls from the
      // contrast minimums. Scoped to the controls themselves so prose inside a
      // disabled fieldset (notes, readouts) stays measured.
      if (el.closest('button:disabled, input:disabled, select:disabled, textarea:disabled'))
        continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = backdrop(el);
      const value = ratio(over(fg, bg, alpha * fg.a), bg);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      const need = large ? 3 : 4.5;
      if (value < need) {
        failures.push({
          text: own.slice(0, 40),
          cls: el.className.toString(),
          ratio: Math.round(value * 100) / 100,
          need,
        });
      }
    }
    return failures;
  });
}

test.describe('accessibility', () => {
  for (const route of ROUTES) {
    test(`${route} exposes one main landmark and one page heading`, async ({ page }) => {
      await page.goto(route);
      // Anchor on rendered content first — the count assertions do not wait.
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    });
  }

  test('every form control on Settings carries an accessible name', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, select, textarea, button'))
        .filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden';
        })
        .filter(
          (el) =>
            !el.getAttribute('aria-label') &&
            !el.getAttribute('aria-labelledby') &&
            !(el.id && document.querySelector(`label[for="${el.id}"]`)) &&
            !el.closest('label') &&
            !(el.tagName === 'BUTTON' && (el.textContent ?? '').trim()),
        )
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
    );
    expect(unnamed).toEqual([]);
  });

  test('dealt cards are described, not silent images', async ({ page }) => {
    await page.goto('/drill/basic-strategy');
    const cards = page.getByRole('img');
    await expect(cards.first()).toBeAttached();
    const alts = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('alt')));
    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) expect(alt?.trim()).toBeTruthy();
  });

  for (const scheme of ['dark', 'light'] as const) {
    test(`text meets WCAG AA in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.getByRole('main')).toBeVisible();
        const failures = await contrastFailures(page);
        expect(failures, `${route} (${scheme})`).toEqual([]);
      }
    });
  }

  // The route sweep above only measures each screen's opening state, so the
  // showdown — the screen with the most colour of its own (per-box verdicts in
  // win/lose/push, the round tally, the active-box highlight) — goes unmeasured.
  // Walk into it and measure both the turn and the resolved states.
  for (const scheme of ['dark', 'light'] as const) {
    test(`the showdown meets WCAG AA in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await configureCounting(page, '3');
      await runCountingRound(page);
      await page.getByRole('button', { name: 'Play 3 hands vs the dealer' }).click();

      const showdown = page.getByRole('region', { name: 'Showdown vs dealer' });
      await expect(showdown).toBeVisible();
      expect(await contrastFailures(page), `showdown player turn (${scheme})`).toEqual([]);

      await standEveryBox(page);
      await expect(page.getByRole('button', { name: /Deal another round/ })).toBeVisible();
      expect(await contrastFailures(page), `showdown resolved (${scheme})`).toEqual([]);
    });
  }

  // The walk above plays with betting off, so the chip surfaces — the bet
  // ladder, the bankroll line, the stake chips, the insurance decision and its
  // settled note, the per-hand payouts — are never measured by it. Seed 41
  // deals a dealer ace over a safe hole card under these settings, reaching
  // every one of those states deterministically.
  for (const scheme of ['dark', 'light'] as const) {
    test(`the betting and insurance surfaces meet WCAG AA in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await configureCounting(page, '1', true);
      await runCountingRound(page, 41);
      await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

      await expect(page.getByRole('group', { name: 'Bet size' })).toBeVisible();
      expect(await contrastFailures(page), `bet stage (${scheme})`).toEqual([]);

      await page.getByRole('button', { name: '10', exact: true }).click();
      await page.getByRole('button', { name: /^Deal/ }).click();
      await expect(page.getByRole('group', { name: 'Insurance' })).toBeVisible();
      expect(await contrastFailures(page), `insurance decision (${scheme})`).toEqual([]);

      await page.getByRole('button', { name: 'Take insurance' }).click();
      await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
      expect(await contrastFailures(page), `insurance settled (${scheme})`).toEqual([]);

      await standEveryBox(page);
      await expect(page.getByRole('button', { name: /Deal another hand/ })).toBeVisible();
      expect(await contrastFailures(page), `betting resolved (${scheme})`).toEqual([]);
    });
  }

  // The KO key-count drill adds two screens of its own — the advantage call and
  // a feedback panel with the threshold rationale lines — that the route sweep
  // never reaches. Walk into both and measure them.
  for (const scheme of ['dark', 'light'] as const) {
    test(`the key-count drill meets WCAG AA in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await configureKeyCount(page);

      await page.goto('/drill/card-counting');
      await page.getByRole('button', { name: /Start counting/ }).click();
      const answer = page.getByLabel('What is the running count?');
      await expect(answer).toBeVisible();
      // The answer form (shared with every counting mode) is also unmeasured by
      // the route sweep — its submit hint sits on the accent fill.
      expect(await contrastFailures(page), `count answer (${scheme})`).toEqual([]);
      await answer.fill('-17');
      await page.getByRole('button', { name: /Submit/ }).click();

      await expect(page.getByText('Do you have the advantage?')).toBeVisible();
      expect(await contrastFailures(page), `advantage call (${scheme})`).toEqual([]);

      await page.getByRole('button', { name: /^Yes/ }).click();
      await expect(page.getByText('Key count', { exact: true })).toBeVisible();
      expect(await contrastFailures(page), `key-count feedback (${scheme})`).toEqual([]);
    });
  }

  test('a drill is fully playable from the keyboard', async ({ page }) => {
    await page.goto('/drill/basic-strategy');
    // The key handler is attached on render; pressing earlier is dropped.
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');

    await page.keyboard.press('h');
    await expect(progress).toHaveAttribute('aria-valuenow', '1');

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
  });

  test('keyboard focus is always visible', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { width: cs.outlineWidth, style: cs.outlineStyle, tag: el.tagName };
    });
    expect(outline).not.toBeNull();
    expect(outline!.style).not.toBe('none');
    expect(parseFloat(outline!.width)).toBeGreaterThan(0);
  });
});
