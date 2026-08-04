import { readFile, writeFile } from 'node:fs/promises';

import { expect, test } from '../fixtures/app.fixture';

// localStorage is the web build's only persistence, so the export/restore pair
// is the whole answer to a cleared browser or a second device. Only a real
// download and a real file pick prove it: the unit specs stub both.
test.describe('practice-data backup', () => {
  test('a backup restores the practice and settings it captured', async ({ page }) => {
    await page.goto('/settings');
    const goal = page.getByLabel('Hands per day');
    await goal.fill('42');
    await goal.blur();

    // Practise a hand so there is history in the backup, not just settings.
    await page.goto('/drill/basic-strategy');
    // The drill binds its key handler on render; a key sent before that is
    // silently dropped, so wait for the grid to exist first.
    await expect(page.getByRole('group', { name: 'Player actions' })).toBeVisible();
    await page.keyboard.press('s');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');

    await page.goto('/settings');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(
      /^blackjack-trainer-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const backupPath = (await download.path())!;
    await expect(page.getByRole('status')).toContainText(download.suggestedFilename());

    // The backup is a readable, self-describing file, not an opaque blob.
    const parsed = JSON.parse(await readFile(backupPath, 'utf8')) as {
      app: string;
      schema: number;
      data: Record<string, string>;
    };
    expect(parsed.app).toBe('blackjack-trainer');
    expect(parsed.schema).toBe(1);
    expect(Object.keys(parsed.data).every((k) => k.startsWith('blackjack-'))).toBe(true);

    // Now lose it all: a different goal and no practice history.
    await page.getByRole('button', { name: 'Reset practice data' }).click();
    await page.getByRole('button', { name: 'Reset everything' }).click();
    await goal.fill('7');
    await goal.blur();
    await page.reload();
    await expect(page.getByLabel('Hands per day')).toHaveValue('7');

    // Restoring reloads the page, because every store reads storage once at
    // construction — so wait for the settings screen to come back.
    await page.locator('input[type="file"]').setInputFiles(backupPath);
    await expect(page.getByLabel('Hands per day')).toHaveValue('42');

    // And the practice history came back with the settings, not just the goal.
    await page.goto('/');
    await expect(page.getByRole('progressbar', { name: '1 of 42 hands today' })).toBeVisible();
  });

  test('a file that is not a backup is refused, and changes nothing', async ({
    page,
  }, testInfo) => {
    await page.goto('/settings');
    const goal = page.getByLabel('Hands per day');
    await goal.fill('42');
    await goal.blur();

    const junk = testInfo.outputPath('not-a-backup.json');
    await writeFile(junk, '{"app":"some-other-app"}');
    await page.locator('input[type="file"]').setInputFiles(junk);

    await expect(page.getByRole('status')).toContainText('not written by this app');
    await page.reload();
    await expect(page.getByLabel('Hands per day')).toHaveValue('42');
  });
});
