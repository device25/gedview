import {test} from '@playwright/test';
import {expectNoAxeViolations, openDemo, trackExternal} from './helpers';

test.describe('accessibility (axe)', () => {
  test('demo screen, light and dark', async ({page}) => {
    const external = trackExternal(page);
    await openDemo(page);
    await expectNoAxeViolations(page);
    await page.getByRole('button', {name: 'Сменить тему'}).click();
    await expectNoAxeViolations(page);
    test.expect(external).toEqual([]);
  });

  test('people flyout with search results', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Люди и поиск'}).click();
    await page.getByRole('searchbox').fill('соколов');
    await page.getByRole('option').first().waitFor();
    await expectNoAxeViolations(page, {popover: true});
  });

  test('settings and language flyouts', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Настройки'}).click();
    await page.getByRole('dialog', {name: 'Настройки'}).waitFor();
    await expectNoAxeViolations(page, {popover: true});
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Язык интерфейса'}).click();
    await page.getByRole('dialog', {name: 'Язык'}).waitFor();
    await expectNoAxeViolations(page, {popover: true});
  });

  test('full card, light and dark', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Все сведения'}).click();
    await page.getByRole('dialog', {name: 'Иван Петрович Соколов'}).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Сменить тему'}).click();
    await page.getByRole('button', {name: 'Все сведения'}).click();
    await page.getByRole('dialog', {name: 'Иван Петрович Соколов'}).waitFor();
    await expectNoAxeViolations(page);
  });
});

test.describe('accessibility on a phone', () => {
  test.use({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });

  test('start screen, demo screen, sheets and full card', async ({page}) => {
    await page.goto('/');
    await page.getByRole('heading', {level: 1, name: 'Gedview'}).waitFor();
    await expectNoAxeViolations(page);

    await openDemo(page);
    await expectNoAxeViolations(page);

    await page.getByRole('button', {name: 'Настройки'}).click();
    await page.getByRole('dialog', {name: 'Настройки'}).waitFor();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');

    await page.getByRole('button', {name: 'Все сведения'}).click();
    await page.getByRole('dialog', {name: 'Иван Петрович Соколов'}).waitFor();
    await expectNoAxeViolations(page);
  });
});
