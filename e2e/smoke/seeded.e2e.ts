import { expect, test } from '../fixtures/app.fixture';

// What `?seed=` buys the suite: the hand the drill deals stops being a random
// draw, so a browser test can finally assert an *exact* outcome instead of only
// asserting that the flow advanced. Everything below is unreachable without it.
test.describe('seeded sessions', () => {
  // Reads the computed question line the drill renders ("Hard 16 vs 10").
  async function questionLine(page: import('@playwright/test').Page): Promise<string> {
    const text = await page.locator('.drill__question').innerText();
    return text.replace(/\s+/g, ' ').trim();
  }

  // Answer hand number `answered` (0-based) with Stand and land on the next one.
  //
  // Both waits are load-bearing. The counter increments the instant the answer
  // is graded, so waiting for it proves the keypress registered — and only then
  // is the action grid reliably locked, which makes "grid unlocked again" a
  // trustworthy signal that the *next* hand is on screen. Waiting on the grid
  // alone races: right after the keypress it is still showing as enabled, and a
  // question line read there belongs to the hand just answered.
  async function answerAndAdvance(
    page: import('@playwright/test').Page,
    answered: number,
  ): Promise<void> {
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', String(answered));
    await page.keyboard.press('s');
    await expect(progress).toHaveAttribute('aria-valuenow', String(answered + 1));
    // A miss pauses the loop until any key; a correct answer auto-advances on
    // its own. An unbound key is a no-op either way, so one press leaves the
    // graded state whichever way the hand went.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Stand' })).toBeEnabled();
  }

  test('the same seed deals the same first hand every time', async ({ page }) => {
    await page.goto('/drill/basic-strategy?seed=1234');
    const first = await questionLine(page);
    expect(first).not.toBe('');

    // A fresh navigation, same seed: byte-identical hand.
    await page.goto('/drill/basic-strategy?seed=1234');
    expect(await questionLine(page)).toBe(first);

    // A different seed has to move the deal, or the hook is doing nothing.
    await page.goto('/drill/basic-strategy?seed=99');
    expect(await questionLine(page)).not.toBe(first);
  });

  test('a seeded session replays hand for hand', async ({ page }) => {
    // Stand grades every initial two-card hand, so the same key sequence walks
    // the same path through the deal order.
    async function firstThreeHands(): Promise<string[]> {
      await page.goto('/drill/basic-strategy?seed=2026');
      const hands: string[] = [];
      for (let i = 0; i < 3; i++) {
        hands.push(await questionLine(page));
        await answerAndAdvance(page, i);
      }
      return hands;
    }

    const first = await firstThreeHands();
    // localStorage carries the practice history and miss tally across a reload,
    // and both feed the deal — so clear them to put the second run in the same
    // starting state as the first.
    await page.evaluate(() => localStorage.clear());
    expect(await firstThreeHands()).toEqual(first);
  });

  test('an unseeded visit is unaffected — different loads, different hands', async ({ page }) => {
    const hands = new Set<string>();
    for (let i = 0; i < 12; i++) {
      await page.goto('/drill/basic-strategy');
      hands.add(await questionLine(page));
      await page.evaluate(() => localStorage.clear());
    }
    // 12 unseeded loads landing on one single hand would mean the drill is
    // deterministic when it shouldn't be. (Collisions are expected; all-12
    // identical is not — the hand space is far too large.)
    expect(hands.size).toBeGreaterThan(1);
  });

  test('a malformed seed is ignored rather than breaking the drill', async ({ page }) => {
    await page.goto('/drill/basic-strategy?seed=not-a-number');
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    expect(await questionLine(page)).not.toBe('');
  });
});
