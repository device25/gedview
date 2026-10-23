import {expect, test} from '@playwright/test';
import {expectNoAxeViolations, trackExternal} from './helpers';

test.describe('opening real files', () => {
  test('synthetic GEDCOM 7.0 family', async ({page}) => {
    const external = trackExternal(page);
    await page.goto('/');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles('tests/fixtures/synthetic/sokolovy.ged');
    await expect(page.getByText(/GEDCOM 7\.0/).first()).toBeVisible();
    await expect(
      page.getByRole('button', {name: /Иван Петрович Соколов/}).first(),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    expect(external).toEqual([]);
  });

  test('synthetic GEDCOM 5.5.1 family', async ({page}) => {
    await page.goto('/');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles('tests/fixtures/synthetic/sokolovy-551.ged');
    await expect(
      page.getByRole('button', {name: /Иван Петрович Соколов/}).first(),
    ).toBeVisible();
  });

  test('official maximal70.gdz', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles('tests/fixtures/gedcom70/maximal70.gdz');
    await expect(page.getByText(/GEDCOM 7\.0/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
