import {expect, test, type Page} from '@playwright/test';
import {expectNoAxeViolations, openDemo} from './helpers';

const fill = (page: Page, id: string) =>
  page
    .locator(`g.gv-person[data-id="${id}"] rect.gv-card`)
    .first()
    .evaluate((el) => getComputedStyle(el).fill);

async function chooseCardColour(page: Page, option: string) {
  await page.getByRole('button', {name: 'Настройки'}).click();
  const dialog = page.getByRole('dialog', {name: 'Настройки'});
  await dialog.getByRole('button', {name: /Цвет карточек/}).click();
  await page.getByRole('option', {name: option}).click();
  await page.keyboard.press('Escape');
  // Focus went back to «Настройки», whose tooltip opens on focus: move
  // focus and the pointer to the chart.
  await page.mouse.move(700, 20);
  await page.locator('svg.gv-svg').focus();
  await expect(page.locator('.tip__label')).toHaveCount(0);
}

test.describe('cards coloured by decade of birth', () => {
  test('off by default: every card is plain', async ({page}) => {
    await openDemo(page);
    expect(await fill(page, 'I1')).toBe(await fill(page, 'I3'));
    await expect(page.locator('.legend__decades')).toHaveCount(0);
  });

  test('on: cards of different decades differ, the legend explains, it persists', async ({
    page,
  }) => {
    await openDemo(page);
    const plain = await fill(page, 'I1');
    await chooseCardColour(page, 'По десятилетию рождения');
    // Иван Петрович (1889) and Николай Иванович (1913).
    await expect.poll(() => fill(page, 'I1')).not.toBe(plain);
    expect(await fill(page, 'I1')).not.toBe(await fill(page, 'I3'));
    await expect(page.locator('.legend')).toContainText(
      /Цвет карточки — десятилетие рождения, от \d{4}-х до \d{4}-х; белые — год неизвестен/,
    );
    await expectNoAxeViolations(page);

    await page.reload();
    await expect.poll(() => fill(page, 'I1')).not.toBe(plain);

    await chooseCardColour(page, 'Без цвета');
    await expect.poll(() => fill(page, 'I1')).toBe(plain);
  });
});
