import { expect, test } from '../fixtures/app.fixture';
import { configureCounting, runCountingRound, standEveryBox } from '../fixtures/flows';

// The post-count showdown hangs off the end of a live-shoe true-count round, so
// every spec walks the real path: configure in Settings, run a counting round,
// then take the offered showdown. Cards come from the live shoe, so these specs
// assert structure and flow — never which hand wins, which the unit specs own.
test.describe('post-count showdown', () => {
  const configure = configureCounting;

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
    // Pin a non-natural opening (Q+8, 9+A vs dealer 3+8). An unseeded shoe can
    // legitimately deal a dealer blackjack and resolve both boxes before any
    // player action, which would make this action-order test probabilistic.
    await runCountingRound(page, 1);
    await page.getByRole('button', { name: 'Play 2 hands vs the dealer' }).click();

    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await standEveryBox(page);

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

  // Bet sizing: the round opens on a bet and settles against a persisted
  // bankroll. Which hands win is the shoe's business, so these assert the flow
  // and that the chip figure moves — never a particular result.
  test('a bet is placed before the deal and settled against the bankroll', async ({ page }) => {
    await configureCounting(page, '1', true);
    await runCountingRound(page);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

    // Nothing is dealt until a bet is placed.
    const bets = page.getByRole('group', { name: 'Bet size' });
    await expect(bets).toBeVisible();
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeHidden();
    await expect(page.locator('.showdown__bankroll')).toContainText('500');

    await bets.getByRole('button', { name: '12', exact: true }).click();
    await page.getByRole('button', { name: /^Deal/ }).click();

    // The hand is on the felt with its stake shown.
    await expect(page.getByRole('region', { name: 'Your hand' })).toBeVisible();
    await expect(page.locator('.showdown__stake').first()).toHaveText('12');

    await standEveryBox(page);
    await expect(page.getByRole('button', { name: /Deal another hand/ })).toBeVisible();
    // 12 at risk: the bankroll settled to a win, a loss, or a push.
    await expect(page.locator('.showdown__bankroll')).toContainText(/500|512|488|518/);

    // The next round returns to the bet rather than dealing straight on.
    await page.getByRole('button', { name: /Deal another hand/ }).click();
    await expect(page.getByRole('group', { name: 'Bet size' })).toBeVisible();
  });

  // The bet-spread drill asks for a number in the abstract; this is the table
  // where the chips go out, and a flat bet through a rich shoe used to pass
  // without comment. The ladder is the player's own spread, so the bet the count
  // calls for is always one the table can take.
  test('the bet is offered as the spread and graded against the count', async ({ page }) => {
    await configureCounting(page, '1', true);
    await runCountingRound(page);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

    // The rungs are the default 1-2-4-8-12 spread, not a generic chip tray.
    const bets = page.getByRole('group', { name: 'Bet size' });
    await expect(bets.getByRole('button')).toHaveText(['1', '2', '4', '8', '12']);

    // A fresh shoe is a flat count, where the spread calls for one unit.
    await bets.getByRole('button', { name: '12', exact: true }).click();
    await page.getByRole('button', { name: /^Deal/ }).click();

    const coach = page.locator('.showdown__coach');
    await expect(coach).toContainText('1 unit was the bet');
    await expect(coach).toContainText('TC ≤ +1');
    await expect(coach).toHaveClass(/showdown__coach--wrong/);
  });

  // Insurance rides on a dealer ace, so these walks pin the shuffle with the
  // `?seed=` hook: under these exact settings (1 box, betting, 3-card rep),
  // seed 14 deals an ace over a dealer natural and seed 41 an ace over a safe
  // hole card. If the offer assertion itself ever fails, the dealing order or
  // settings changed and the seeds need re-probing.
  test('insurance pays 2:1 into a seeded dealer natural', async ({ page }) => {
    await configureCounting(page, '1', true);
    await runCountingRound(page, 14);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();
    await page.getByRole('button', { name: '8', exact: true }).click();
    await page.getByRole('button', { name: /^Deal/ }).click();

    // The round pauses on the decision before the hole card turns.
    await expect(page.getByRole('group', { name: 'Insurance' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeHidden();

    await page.getByRole('button', { name: 'Take insurance' }).click();
    await expect(page.locator('.showdown__note[role=status]')).toHaveText(
      /Insurance paid 2:1\s*\+8/,
    );
    // The dealer natural ended the box at once; the 2:1 covers the lost bet.
    await expect(page.locator('.showdown__verdict')).toHaveText(/blackjack/);
    await expect(page.locator('.showdown__bankroll')).toContainText('wagered 12');
  });

  test('insurance is forfeited into a seeded safe hole card', async ({ page }) => {
    await configureCounting(page, '1', true);
    await runCountingRound(page, 41);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();
    await page.getByRole('button', { name: '8', exact: true }).click();
    await page.getByRole('button', { name: /^Deal/ }).click();

    await page.getByRole('button', { name: 'Take insurance' }).click();
    // No dealer natural: the premium is gone and the hand plays on.
    await expect(page.locator('.showdown__note[role=status]')).toHaveText(/Insurance lost\s*−4/);
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await expect(page.locator('.showdown__bankroll')).toContainText('496');
  });

  // Insurance is the one decision at this table that is purely about the count,
  // and the showdown hangs off the drill that just practised it. At the top of
  // an untouched shoe the count is nowhere near the index, so taking it is a
  // misplay — whether or not the bet happens to win.
  test('insurance is graded against the count, not against whether it won', async ({ page }) => {
    await configureCounting(page, '1', true);
    // Seed 14 deals a dealer ace over a natural: the insurance bet wins.
    await runCountingRound(page, 14);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();
    await page.getByRole('button', { name: '8', exact: true }).click();
    await page.getByRole('button', { name: /^Deal/ }).click();

    await page.getByRole('button', { name: 'Take insurance' }).click();

    const coach = page.locator('.showdown__coach');
    await expect(coach).toContainText('Declining was the play');
    await expect(coach).toContainText('insurance index of +3');
    await expect(coach).toHaveClass(/showdown__coach--wrong/);
    // The bet still paid; the call was still wrong.
    await expect(page.locator('.showdown__note[role=status]')).toContainText('Insurance paid 2:1');
    // The round also over-bets the spread at a flat count, which is its own
    // misplay line; this test is about the insurance one.
    await expect(
      page.locator('.showdown__misplay-list li').filter({ hasText: 'Insurance' }),
    ).toHaveCount(1);
  });

  // A misplay at the table is a basic-strategy miss on that hand. It has to
  // outlive the round: the point of naming it is that the trainee practises it
  // next, which is what the weak-spot list is for.
  test('a misplay at the table becomes a weak spot on Progress', async ({ page }) => {
    await configure(page, '1');
    // Seed 2 deals a hand where hitting is a misplay.
    await runCountingRound(page, 2);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();
    await page
      .getByRole('group', { name: 'Player actions' })
      .getByRole('button', { name: /Hit/ })
      .click();

    await expect(page.locator('.showdown__coach')).toHaveClass(/showdown__coach--wrong/);

    await page.goto('/progress');
    const spots = page.getByRole('region', { name: 'Basic Strategy weak spots' });
    await expect(spots).toBeVisible();
    // The hand is whatever the seed dealt; that it was filed at all is the point.
    await expect(spots.locator('li').first()).toContainText('missed 1 of 1');
  });

  // The showdown is the one place a live count meets an actual hand, so the play
  // is graded against the deviation chart laid over basic strategy. Seed 15
  // deals a hard 16 vs a king off the top of an untouched shoe, where the true count is
  // 0 — which is exactly the index for that cell, and the opposite of what basic
  // strategy alone says.
  test('the count decides the play, and the verdict names the index', async ({ page }) => {
    await configure(page, '1');
    await runCountingRound(page, 85);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

    await page
      .getByRole('group', { name: 'Player actions' })
      .getByRole('button', { name: /Stand/ })
      .click();

    // Basic strategy alone hits 16 vs 10; the index stands it, and says so.
    const coach = page.locator('.showdown__coach');
    await expect(coach).toContainText('Correct.');
    await expect(coach).toContainText('0 or higher');
    await expect(coach).toContainText('Basic strategy alone would hit');
    await expect(coach).not.toHaveClass(/showdown__coach--wrong/);
  });

  test('an index miss becomes a Deviations weak spot, not a basic-strategy one', async ({
    page,
  }) => {
    await configure(page, '1');
    await runCountingRound(page, 85);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

    await page
      .getByRole('group', { name: 'Player actions' })
      .getByRole('button', { name: /Hit/ })
      .click();

    await expect(page.locator('.showdown__coach')).toHaveClass(/showdown__coach--wrong/);

    await page.goto('/progress');
    const deviations = page.getByRole('region', { name: 'Deviations weak spots' });
    await expect(deviations).toBeVisible();
    await expect(deviations.locator('li').first()).toContainText('16 vs 10');
    await expect(page.getByRole('region', { name: 'Basic Strategy weak spots' })).toBeHidden();
  });

  test('a hand can be surrendered for an immediate loss', async ({ page }) => {
    await configureCounting(page, '1');
    await page.getByLabel('Late Surrender').check();
    // Seed 1 opens Q+3 vs dealer 9+8: no natural can skip the first decision,
    // so the surrender assertion never needs a probabilistic deal-again loop.
    await runCountingRound(page, 1);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();

    const surrender = page
      .getByRole('group', { name: 'Player actions' })
      .getByRole('button', { name: /Surrender/ });
    const dealAnother = page.getByRole('button', { name: /Deal another hand/ });

    await surrender.click();
    await expect(page.locator('.showdown__verdict')).toHaveText('Surrendered.');
    await expect(dealAnother).toBeVisible();
  });

  test('betting stays off unless Settings asks for it', async ({ page }) => {
    await configureCounting(page, '1');
    // Seed 1 opens Q+3 vs dealer 9+8, guaranteeing a player turn so this test
    // can distinguish "no betting phase" from an auto-resolved natural.
    await runCountingRound(page, 1);
    await page.getByRole('button', { name: 'Play a hand vs the dealer' }).click();
    // Straight to the turn, with no chip figure anywhere.
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Bet size' })).toBeHidden();
    await expect(page.locator('.showdown__bankroll')).toHaveCount(0);
  });
});
