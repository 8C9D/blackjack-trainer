import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/app.fixture';
import { configureKeyCount } from '../fixtures/flows';

// The counting drills are configured on the Settings screen (the drill page
// hosts no configuration), so each spec walks the real user path: shrink the
// drill in Settings, then run it. Answers are graded against a random stream,
// so specs assert the *flow* — stream → (estimate) → answer → feedback and the
// session counter advancing — never correctness, which the unit specs own.
test.describe('card counting drill', () => {
  // A 3-card stream at the 100ms floor keeps each run near-instant.
  async function shrinkDrill(page: Page): Promise<void> {
    await page.goto('/settings');
    await page.getByLabel('Number of cards').fill('3');
    await page.getByLabel('Time between cards (ms)').fill('100');
  }

  test('a running-count round: stream, answer, feedback, rep counted', async ({ page }) => {
    await shrinkDrill(page);
    await page.goto('/drill/card-counting');

    // Idle screen shows the default system with a start action.
    await expect(page.getByRole('heading', { name: 'Hi-Lo' })).toBeVisible();
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');

    await page.getByRole('button', { name: /Start counting/ }).click();

    // The stream ends in ~300ms and the answer form takes over.
    const answer = page.getByLabel('What is the running count?');
    await expect(answer).toBeVisible();
    await answer.fill('0');
    await page.getByRole('button', { name: /Submit/ }).click();

    // Feedback appears and the graded rep counts toward the session.
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
  });

  test('a live-shoe true-count round inserts the deck-estimate step', async ({ page }) => {
    await shrinkDrill(page);
    await page
      .getByRole('radiogroup', { name: 'Drill mode' })
      .getByRole('radio', { name: 'True count', exact: true })
      .check();

    await page.goto('/drill/card-counting');
    await page.getByRole('button', { name: /Start counting/ }).click();

    // Live shoe (the default source): decks estimate comes before the count.
    const estimate = page.getByLabel('How many decks remain?');
    await expect(estimate).toBeVisible();
    await estimate.fill('6');
    await page.getByRole('button', { name: /Submit estimate/ }).click();

    const answer = page.getByLabel('What is the true count?');
    await expect(answer).toBeVisible();
    await answer.fill('0');
    await page.getByRole('button', { name: /^Submit/ }).click();

    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  test('a KO key-count round asks for the count, then the advantage call', async ({ page }) => {
    await configureKeyCount(page);

    await page.goto('/drill/card-counting');
    await expect(page.getByRole('heading', { name: 'KO' })).toBeVisible();
    await page.getByRole('button', { name: /Start counting/ }).click();

    // No deck estimate: the count question comes straight after the stream.
    const answer = page.getByLabel('What is the running count?');
    await expect(answer).toBeVisible();
    await answer.fill('-20');
    await page.getByRole('button', { name: /Submit/ }).click();

    // The advantage call follows, and feedback cites the key count.
    await expect(page.getByText('Do you have the advantage?')).toBeVisible();
    await page.getByRole('button', { name: /^No/ }).click();

    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByText('Key count', { exact: true })).toBeVisible();
  });

  test('a bet-spread round asks for the count, then the bet, and shows the spread', async ({
    page,
  }) => {
    await shrinkDrill(page);
    await page
      .getByRole('radiogroup', { name: 'Drill mode' })
      .getByRole('radio', { name: 'Bet spread', exact: true })
      .check();
    // The spread is editable right there; widen the top band to prove the
    // drill grades against what Settings holds.
    const bands = page.getByRole('group', { name: 'Bet spread' }).getByRole('spinbutton');
    await bands.last().fill('20');

    await page.goto('/drill/card-counting');
    await page.getByRole('button', { name: /Start counting/ }).click();

    // Live shoe by default: estimate, then the true count, then the bet.
    const estimate = page.getByLabel('How many decks remain?');
    await expect(estimate).toBeVisible();
    await estimate.fill('6');
    await page.getByRole('button', { name: /Submit estimate/ }).click();

    const answer = page.getByLabel('What is the true count?');
    await expect(answer).toBeVisible();
    await answer.fill('0');
    await page.getByRole('button', { name: /^Submit/ }).click();

    const bet = page.getByLabel('How many units do you bet?');
    await expect(bet).toBeVisible();
    await bet.fill('1');
    await page.getByRole('button', { name: /^Submit/ }).click();

    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByText('Your spread says')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Your bet spread' })).toContainText('20 units');
  });

  test('Escape exits the idle drill back to home', async ({ page }) => {
    await page.goto('/drill/card-counting');
    await expect(page.getByRole('heading', { name: 'Hi-Lo' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
  });
});
