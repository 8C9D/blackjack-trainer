import { expect, test } from '../fixtures/app.fixture';

// Whole-flow routing: the real lazy-route → page bootstrap chain, per-route
// titles, and the redirect table — none of which the jsdom unit layer exercises.
test.describe('navigation & routing', () => {
  test('home is the Open moment with the right title', async ({ page }) => {
    await expect(page).toHaveTitle(/^Blackjack Trainer$/);
    await expect(page.getByRole('button', { name: /Continue/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Card Counting/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Deviations/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Settings/ })).toBeVisible();
  });

  test('the primary action resumes Basic Strategy (the default last trainer)', async ({ page }) => {
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/drill\/basic-strategy$/);
    await expect(page).toHaveTitle(/Basic Strategy/);
  });

  test('the other-trainer cards route to their drills', async ({ page }) => {
    await page.getByRole('button', { name: /Card Counting/ }).click();
    await expect(page).toHaveURL(/\/drill\/card-counting$/);
    await expect(page).toHaveTitle(/Card Counting/);

    await page.goto('/');
    await page.getByRole('button', { name: /Deviations/ }).click();
    await expect(page).toHaveURL(/\/drill\/deviations$/);
    await expect(page).toHaveTitle(/Deviations/);
  });

  test('Settings opens from the home button', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/ }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page).toHaveTitle(/Settings/);
  });

  test('the strategy chart opens from home and comes back', async ({ page }) => {
    await page.getByRole('button', { name: /Chart/ }).click();
    await expect(page).toHaveURL(/\/chart$/);
    await expect(page).toHaveTitle(/Chart/);
    // Every chart key has a row, and the grid follows the active rule set.
    await expect(page.getByRole('rowheader', { name: '16', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('the count tab prints the tags the counting drill grades against', async ({ page }) => {
    await page.getByRole('button', { name: /Chart/ }).click();
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    // The default system, and its tags as a published table prints them.
    await expect(page.getByRole('columnheader', { name: '2–6' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '10–A' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Count', exact: true })).toBeVisible();
    await expect(page.getByText('A full deck of these tags sums to 0')).toBeVisible();

    // The tab is in the URL, so it survives a reload and can be linked to.
    await expect(page).toHaveURL(/\/chart\?tab=count$/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Count', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // Settings picks among 58 counting systems and prints the tags of none of
  // them; the chart's count tab is where they are.
  test('the system picker links to the tags of the system it just chose', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'See what each card is worth' }).click();
    await expect(page).toHaveURL(/\/chart\?tab=count$/);
    await expect(page.getByText('What each card is worth')).toBeVisible();
  });

  test('the counting drill links to them too, from the screen that names the system', async ({
    page,
  }) => {
    await page.goto('/drill/card-counting');
    await page.getByRole('link', { name: 'See what each card is worth' }).click();
    await expect(page).toHaveURL(/\/chart\?tab=count$/);
    await expect(page.getByText('What each card is worth')).toBeVisible();
  });

  test('progress opens from home and counts a practised hand', async ({ page }) => {
    // One graded hand, so the week strip and the trainer table have something
    // real in them rather than the empty state.
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('button', { name: 'Hit' }).click();
    await page.goto('/progress');

    await expect(page).toHaveTitle(/Progress/);
    await expect(page.getByRole('rowheader', { name: 'Basic Strategy' })).toBeVisible();
    await expect(page.getByText(/hand all time/)).toContainText('1 hand all time');
    // The decision was timed too. Which figure it reports is a wall-clock
    // question a browser test cannot pin, so this asserts only that the app
    // measured the hand rather than what it took.
    await expect(page.getByText(/s a hand this week/)).toBeVisible();
  });

  test('pre-Flow trainer URLs redirect into the flow', async ({ page }) => {
    await page.goto('/card-counting');
    await expect(page).toHaveURL(/\/drill\/card-counting$/);

    await page.goto('/basic-strategy');
    await expect(page).toHaveURL(/\/drill\/basic-strategy$/);
  });

  test('an unknown route redirects to home', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(/^Blackjack Trainer$/);
  });

  test('the PWA manifest is linked and carries installable icons', async ({ page }) => {
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href).toBeTruthy();
    const manifest = await (await page.request.get(href!)).json();
    expect(manifest.display).toBe('standalone');
    const maskable = manifest.icons.filter((i: { purpose?: string }) =>
      i.purpose?.includes('maskable'),
    );
    expect(maskable.map((i: { sizes: string }) => i.sizes).sort()).toEqual(['192x192', '512x512']);
    // The icon files actually resolve (the CI static server 404s missing assets).
    const responses = await Promise.all(
      maskable.map((icon: { src: string }) => page.request.get(icon.src)),
    );
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });

  test('keyboard shortcuts navigate from home', async ({ page }) => {
    // The home button being visible means Angular has bootstrapped and its
    // window:keydown listener is attached before we press a key.
    const ready = () => expect(page.getByRole('button', { name: /Continue/ })).toBeVisible();

    await ready();
    // Enter resumes the last trainer (Basic Strategy by default).
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/drill\/basic-strategy$/);

    await page.goto('/');
    await ready();
    // "2" opens the first other-trainer card (Card Counting).
    await page.keyboard.press('2');
    await expect(page).toHaveURL(/\/drill\/card-counting$/);

    await page.goto('/');
    await ready();
    // "," opens Settings.
    await page.keyboard.press(',');
    await expect(page).toHaveURL(/\/settings$/);

    await page.goto('/');
    await ready();
    // "c" opens the strategy chart.
    await page.keyboard.press('c');
    await expect(page).toHaveURL(/\/chart$/);

    await page.goto('/');
    await ready();
    // "p" opens Progress.
    await page.keyboard.press('p');
    await expect(page).toHaveURL(/\/progress$/);
  });
});
