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

// Shrink the counting drill to a fast KO key-count rep. The Settings walk is
// shared by the drill and a11y specs so the control labels live in one place.
export async function configureKeyCount(page: Page): Promise<void> {
  await page.goto('/settings');
  await page.getByLabel('Number of cards').fill('3');
  await page.getByLabel('Time between cards (ms)').fill('100');
  await page.getByLabel('Counting system').selectOption('ko');
  await page
    .getByRole('radiogroup', { name: 'Drill mode' })
    .getByRole('radio', { name: 'Key count', exact: true })
    .check();
}

// Shrink the counting drill to a fast live-shoe bet-spread rep. Same Settings
// walk as the true count it is built on, plus the mode radio that reveals the
// spread editor.
export async function configureBetSpread(page: Page): Promise<void> {
  await page.goto('/settings');
  await page.getByLabel('Number of cards').fill('3');
  await page.getByLabel('Time between cards (ms)').fill('100');
  await page
    .getByRole('radiogroup', { name: 'Drill mode' })
    .getByRole('radio', { name: 'Bet spread', exact: true })
    .check();
}

// Run one live-shoe true-count rep, ending on the feedback screen where the
// showdown is offered. The answers need not be correct — this is flow, not math.
// A `seed` pins the app's randomness (the shoe's shuffle included) via the
// `?seed=` hook, so a spec can rely on the exact cards the showdown will deal.
// `cards` is how many the drill will stream before it asks anything, which the
// caller sets in Settings and this helper otherwise has no way to know.
export async function runCountingRound(page: Page, seed?: number, cards = 3): Promise<void> {
  await page.goto(
    seed === undefined ? '/drill/card-counting' : `/drill/card-counting?seed=${seed}`,
  );
  await page.getByRole('button', { name: /Start counting/ }).click();

  // Nothing is asked until every card has streamed, and the stream is as long as
  // the caller made it: `cards` at the 100 ms minimum interval the configure
  // helpers set. Playwright's fixed 5 s default does not know that. Measured
  // under the full parallel suite on two machines-worth of runs, the 26-card
  // caller spends 2.68-3.08 s of it just streaming — so the old fixed budget was
  // 1.6-1.9x the stream, and one full-suite run in 30 exceeded the whole budget
  // and failed here. This raises the ceiling rather than removing it: the same
  // caller now has 2.5-2.8x. It is still not the same move as raising a timeout
  // to hide a race — the form is not racing anything, it arrives on a schedule
  // the test itself set, and the budget now scales with that schedule.
  const estimate = page.getByLabel('How many decks remain?');
  await expect(estimate).toBeVisible({ timeout: 5_000 + cards * 100 });
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
