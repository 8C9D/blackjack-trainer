import { expect, type Page } from '@playwright/test';

// Multi-step walks shared by more than one spec. The post-count showdown is the
// deepest screen in the app — reaching it means configuring Settings, running a
// counting rep, and taking the offered showdown — so the walk lives here rather
// than being copied into every spec that needs to get there.

// Shrink the counting drill to a fast live-shoe true-count rep, and pick how
// many boxes the post-count showdown deals to.
export async function configureCounting(page: Page, spots: string): Promise<void> {
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
// showdown is offered. The answers need not be correct — this is flow, not math.
export async function runCountingRound(page: Page): Promise<void> {
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

// Stand every box that still owes a decision, leaving the round resolved. The
// number of turns is not fixed: an opening natural settles its box without ever
// taking one, and a bust ends one early. Checking visibility first would race
// the re-render that follows the last stand, so the bounded click is the exit.
export async function standEveryBox(page: Page): Promise<void> {
  const actions = page.getByRole('group', { name: 'Player actions' });
  for (let i = 0; i < 8; i++) {
    try {
      await actions.getByRole('button', { name: /Stand/ }).click({ timeout: 2000 });
    } catch {
      return;
    }
  }
}
