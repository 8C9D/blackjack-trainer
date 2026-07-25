import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/app.fixture';

// The post-count showdown hangs off the end of a live-shoe true-count round, so
// every spec walks the real path: configure in Settings, run a counting round,
// then take the offered showdown. Cards come from the live shoe, so these specs
// assert structure and flow — never which hand wins, which the unit specs own.
test.describe('post-count showdown', () => {
  // Shrink the counting drill and pick how many boxes the showdown deals to.
  async function configure(page: Page, spots: string): Promise<void> {
    await page.goto('/settings');
    await page.getByLabel('Number of cards').fill('3');
    await page.getByLabel('Time between cards (ms)').fill('100');
    await page
      .getByRole('radiogroup', { name: 'Drill mode' })
      .getByRole('radio', { name: 'True count', exact: true })
      .check();
    await page.getByLabel('Showdown hands').selectOption(spots);
  }

  // Run one live-shoe true-count rep, ending on the feedback screen where the
  // showdown is offered.
  async function runCountingRound(page: Page): Promise<void> {
    await page.goto('/drill/card-counting');
    await page.getByRole('button', { name: /Start counting/ }).click();

    const estimate = page.getByLabel('How many decks remain?');
    await expect(estimate).toBeVisible();
    await estimate.fill('6');
    await page.getByRole('button', { name: /Submit estimate/ }).click();

    const answer = page.getByLabel('What is the true count?');
    await expect(answer).toBeVisible();
    await answer.fill('0');
    await page.getByRole('button', { name: /^Submit/ }).click();
  }

  test('a single-box showdown deals one hand against the dealer', async ({ page }) => {
    await configure(page, '1');
    await runCountingRound(page);

    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

    const showdown = page.getByRole('region', { name: 'Showdown vs dealer' });
    await expect(showdown).toBeVisible();
    await expect(
      showdown.getByRole('heading', { name: 'Play a hand vs the dealer' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your hand' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dealer hand' })).toBeVisible();
  });

  test('three boxes each get their own hand against one dealer', async ({ page }) => {
    await configure(page, '3');
    await runCountingRound(page);

    await page.getByRole('button', { name: 'Play 3 hands vs the dealer' }).click();

    const showdown = page.getByRole('region', { name: 'Showdown vs dealer' });
    await expect(
      showdown.getByRole('heading', { name: 'Play 3 hands vs the dealer' }),
    ).toBeVisible();

    // One labelled region per box, plus exactly one dealer.
    for (const n of [1, 2, 3]) {
      await expect(page.getByRole('region', { name: `Your hand ${n}` })).toBeVisible();
    }
    await expect(page.getByRole('region', { name: 'Dealer hand' })).toHaveCount(1);
  });

  test('boxes are played in order and the round ends with a tally', async ({ page }) => {
    await configure(page, '2');
    await runCountingRound(page);
    await page.getByRole('button', { name: 'Play 2 hands vs the dealer' }).click();

    const actions = page.getByRole('group', { name: 'Player actions' });
    await expect(actions).toBeVisible();

    // Stand each box in turn until none is left to act on. The count is not
    // fixed: an opening natural settles its box without ever taking a turn, and
    // a bust ends one early. Checking visibility first would race the re-render
    // that follows the last stand, so the bounded click is the loop's exit.
    for (let i = 0; i < 4; i++) {
      try {
        await actions.getByRole('button', { name: /Stand/ }).click({ timeout: 2000 });
      } catch {
        break; // no box still owes a decision — the round has resolved
      }
    }

    // Every box carries its own verdict, and the round summarises them.
    const verdicts = page.locator('.showdown__verdict');
    await expect(verdicts.first()).toBeAttached();
    await expect(verdicts).toHaveCount(2);
    await expect(page.locator('.showdown__summary')).toHaveText(
      /\d+ (won|lost|pushed)(, \d+ (won|lost|pushed))*/,
    );
    await expect(page.getByRole('button', { name: /Deal another round/ })).toBeVisible();
  });

  test('returning to counting keeps the drill going', async ({ page }) => {
    await configure(page, '2');
    await runCountingRound(page);
    await page.getByRole('button', { name: 'Play 2 hands vs the dealer' }).click();

    await expect(page.getByRole('region', { name: 'Showdown vs dealer' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to counting' }).click();

    // Back on the count feedback, with the graded rep still counted.
    await expect(page.getByRole('region', { name: 'Showdown vs dealer' })).toBeHidden();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });
});
