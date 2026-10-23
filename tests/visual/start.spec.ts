import {expect, test} from '@playwright/test';

test('start screen', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('start.png');
});
