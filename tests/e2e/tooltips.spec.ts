import {expect, test} from '@playwright/test';
import {expectNoAxeViolations, moveMouseTo, openDemo} from './helpers';

test.describe('tooltips', () => {
  test('rail items show their name on hover, with shortcuts', async ({
    page,
  }) => {
    await openDemo(page);
    await moveMouseTo(
      page,
      page.getByRole('button', {name: 'Люди и поиск', exact: true}),
    );
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('Люди и поиск');
    await expect(tip).toContainText('/');
    await moveMouseTo(
      page,
      page.getByRole('button', {name: 'Источники', exact: true}),
    );
    await expect(page.getByRole('tooltip')).toContainText('Источники');
  });

  test('tooltips appear on keyboard focus and close on Esc', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Источники', exact: true}).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tooltip')).toContainText('Источники');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('the theme button says what it will do', async ({page}) => {
    await openDemo(page);
    const btn = page.getByRole('button', {name: 'Включить тёмную тему'});
    await moveMouseTo(page, btn);
    await expect(page.getByRole('tooltip')).toContainText(
      'Включить тёмную тему',
    );
    await btn.click();
    await expect(
      page.getByRole('button', {name: 'Включить светлую тему'}),
    ).toBeVisible();
  });

  test('a visible tooltip keeps the page accessible', async ({page}) => {
    await openDemo(page);
    await moveMouseTo(
      page,
      page.getByRole('button', {name: 'Источники', exact: true}),
    );
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expectNoAxeViolations(page, {popover: true});
  });
});
