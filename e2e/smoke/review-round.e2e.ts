import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/app.fixture';

// The adaptive loop end to end: a miss becomes a queued weakness, the next round
// opens on it, the Done screen offers it as an action, and taking it deals that
// exact hand again. The unit layer covers the selection math; only a browser
// covers the whole chain (localStorage → Done screen → the next round's deal).
test.describe('review rounds', () => {
  // The drill's question line, normalized: "Hard 16 vs 10", "Soft 18 vs 9",
  // "8,8 vs 10".
  async function questionLine(page: Page): Promise<string> {
    const line = await page.locator('.drill__question').innerText();
    return line.replace(/\s+/g, ' ').trim();
  }

  // The chart shorthand the weakness card shows for the same hand. The two
  // notations agree on hard totals and pairs but not on soft ones — the question
  // line computes the total ("Soft 18 vs 9") where the chart names the kicker
  // ("A,7 vs 9") — so a test comparing the card against the line has to convert.
  function chartLabel(question: string): string {
    const soft = /^Soft (\d+) vs (.+)$/.exec(question);
    if (soft) return `A,${Number(soft[1]) - 11} vs ${soft[2]}`;
    return question.replace(/^Hard /, '');
  }

  // Drill until one hand grades as a miss, and return its question line. Standing is
  // wrong on most hands, so this lands quickly; stopping at the *first* miss is
  // what makes the weak spot unambiguous — every earlier hand was answered
  // correctly, so exactly one scenario carries a miss.
  async function drillUntilAMiss(page: Page): Promise<string> {
    const progress = page.getByRole('progressbar');
    const stand = page.getByRole('button', { name: 'Stand' });
    for (let i = 0; i < 15; i++) {
      // The counter increments the instant a hand is graded, so waiting for it
      // proves the keypress registered — and only then is the action grid
      // reliably locked, which makes "unlocked again" a trustworthy signal that
      // the next hand is on screen. Reading the question line off the grid state
      // alone races with the render of the answer just given.
      await expect(progress).toHaveAttribute('aria-valuenow', String(i));
      const hand = await questionLine(page);
      await page.keyboard.press('s');
      await expect(progress).toHaveAttribute('aria-valuenow', String(i + 1));
      const wasMiss = (await page.locator('.drill__rule').count()) > 0;
      // Any key leaves the miss pause; an unbound key is a no-op after a
      // correct answer, which auto-advances on its own.
      await page.keyboard.press('ArrowRight');
      if (wasMiss) return hand;
      await expect(stand).toBeEnabled();
    }
    throw new Error('standing graded correct 15 times running — the drill is not dealing variety');
  }

  // A one-hand daily goal makes the *next* round end after a single answer,
  // which is what lets a smoke test reach the Done screen at all.
  async function setDailyGoalToOne(page: Page): Promise<void> {
    await page.goto('/settings');
    const goal = page.getByLabel('Hands per day');
    await goal.fill('1');
    await goal.dispatchEvent('change');
  }

  // Reach a Done screen that has a queued weakness, and report which hand it is.
  async function reachDoneWithAWeakness(page: Page): Promise<string> {
    await page.goto('/drill/basic-strategy');
    const weakHand = await drillUntilAMiss(page);

    await setDailyGoalToOne(page);
    await page.goto('/drill/basic-strategy');

    // The round opens on the weak spot — the promise the Done screen makes.
    await expect(page.locator('.drill__question')).toContainText(weakHand);
    await page.keyboard.press('s');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.done')).toBeVisible();
    return weakHand;
  }

  test('the Done screen queues the missed hand and can drill it now', async ({ page }) => {
    const weakHand = await reachDoneWithAWeakness(page);

    const review = page.locator('.done__next');
    await expect(review).toBeVisible();
    await expect(review).toContainText('Drill my misses');
    await expect(review).toContainText(chartLabel(weakHand));
    await expect(review).toContainText('this week');

    await review.click();
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await expect(page.locator('.drill__question')).toContainText(weakHand);
  });

  test('R starts the review round from the keyboard', async ({ page }) => {
    const weakHand = await reachDoneWithAWeakness(page);
    await page.keyboard.press('r');
    await expect(page.locator('.done')).toHaveCount(0);
    await expect(page.locator('.drill__question')).toContainText(weakHand);
  });

  // Progress names the same weaknesses the Done screen does, and until now was
  // the one place naming them did nothing.
  test('Progress can start the review round it lists', async ({ page }) => {
    await page.goto('/drill/basic-strategy');
    const weakHand = await drillUntilAMiss(page);

    await page.goto('/progress');
    const card = page.locator('.progress__card', { hasText: 'Basic Strategy — this week' });
    await expect(card).toContainText(chartLabel(weakHand));
    await card.getByRole('button', { name: 'Drill these misses' }).click();

    await expect(page).toHaveURL(/\/drill\/basic-strategy\?review=1$/);
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    expect(await questionLine(page)).toBe(weakHand);

    // The second hand is what separates a review round from an ordinary one:
    // an ordinary round only weights toward the weak list.
    await page.keyboard.press('s');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    expect(await questionLine(page)).toBe(weakHand);
  });

  test('a review round keeps dealing the weak spot, not just the first hand', async ({ page }) => {
    await page.goto('/drill/basic-strategy');
    const weakHand = await drillUntilAMiss(page);

    await setDailyGoalToOne(page);
    await page.goto('/drill/basic-strategy');
    // Keys go to a window listener the drill attaches on render, so pressing one
    // before the grid exists is silently dropped — and then no session ever ends.
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await page.keyboard.press('s');
    await page.keyboard.press('ArrowRight');
    await page.locator('.done__next').click();

    // Answering correctly three times clears the spot, so check the two hands
    // before that can happen — both must be the weak spot, however the RNG falls.
    for (let i = 0; i < 2; i++) {
      await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
      expect(await questionLine(page)).toBe(weakHand);
      await page.keyboard.press('s');
      await page.keyboard.press('ArrowRight');
      // A one-hand goal ends the round after each answer; take the review again.
      await expect(page.locator('.done')).toBeVisible();
      await page.locator('.done__next').click();
    }
  });
});
