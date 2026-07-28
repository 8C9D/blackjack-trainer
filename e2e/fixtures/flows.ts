import { expect, type Page } from '@playwright/test';

// Multi-step walks shared by more than one spec. The post-count showdown is the
// deepest screen in the app — reaching it means configuring Settings, running a
// counting rep, and taking the offered showdown — so the walk lives here rather
// than being copied into every spec that needs to get there.

// Shrink the counting drill to a fast live-shoe true-count rep, and pick how
// many boxes the post-count showdown deals to.
export async function configureCounting(page: Page, spots: string, betting = false): Promise<void> {
  await page.goto('/settings');
  await page.getByLabel('Number of cards').fill('3');
  await page.getByLabel('Time between cards (ms)').fill('100');
  await page
    .getByRole('radiogroup', { name: 'Drill mode' })
    .getByRole('radio', { name: 'True count', exact: true })
    .check();
  await page.getByLabel('Showdown hands').selectOption(spots);
  if (betting) await page.getByLabel('Bet sizing (bankroll)').check();
}

// Run one live-shoe true-count rep, ending on the feedback screen where the
// showdown is offered. The answers need not be correct — this is flow, not math.
// A `seed` pins the app's randomness (the shoe's shuffle included) via the
// `?seed=` hook, so a spec can rely on the exact cards the showdown will deal.
export async function runCountingRound(page: Page, seed?: number): Promise<void> {
  await page.goto(
    seed === undefined ? '/drill/card-counting' : `/drill/card-counting?seed=${seed}`,
  );
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
// taking one, and a bust ends one early. With betting on, a dealer ace pauses
// the round on the insurance decision first — decline it, since these walks
// assert flow, not the side bet. The loop's exit is the round's own terminal
// state — the deal-another control — rather than a click timeout, which under
// parallel workers can expire on a slow render and leave a box unplayed.
export async function standEveryBox(page: Page): Promise<void> {
  const noInsurance = page.getByRole('button', { name: 'No insurance' });
  const stand = page
    .getByRole('group', { name: 'Player actions' })
    .getByRole('button', { name: /Stand/ });
  const resolved = page.getByRole('button', { name: /Deal another/ });
  for (let i = 0; i < 12; i++) {
    if (await resolved.isVisible()) return;
    if (await noInsurance.isVisible()) {
      await noInsurance.click({ timeout: 5000 }).catch(() => undefined);
      continue;
    }
    // The stand that resolves the round detaches the button mid-click. That is
    // the loop finishing rather than a failure, so swallow it and let the next
    // pass read the phase from the deal-another control.
    await stand.click({ timeout: 5000 }).catch(() => undefined);
  }
}
