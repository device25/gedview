import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';

test('app starts and has no accessibility violations', async ({page}) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.hostname !== 'localhost') external.push(req.url());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();

  const results = await new AxeBuilder({page}).analyze();
  expect(results.violations).toEqual([]);
  // Gedview makes no third-party requests on its own.
  expect(external).toEqual([]);
});
