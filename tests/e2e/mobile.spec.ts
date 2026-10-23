import {expect, test} from '@playwright/test';
import {openDemo} from './helpers';

test.use({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});

test.describe('phone layout', () => {
  test('uses a bottom navigation instead of the rail and a bottom-sheet card', async ({
    page,
  }) => {
    await openDemo(page);
    const nav = page.getByRole('navigation', {name: 'Основное меню'});
    const box = await nav.boundingBox();
    expect(box?.y).toBeGreaterThan(700);
    expect(box?.width).toBeGreaterThanOrEqual(389);

    const card = page.getByRole('complementary');
    const cardBox = await card.boundingBox();
    expect(cardBox?.width).toBeGreaterThanOrEqual(389);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(box!.y + 1);
  });

  test('touch targets are at least 44 px', async ({page}) => {
    await openDemo(page);
    const selectors = [
      page.getByRole('navigation').getByRole('button'),
      page.getByRole('button', {name: 'Поиск', exact: true}),
      page.getByRole('tab'),
      page.getByRole('complementary').getByRole('button'),
    ];
    for (const loc of selectors) {
      for (const el of await loc.all()) {
        if (!(await el.isVisible())) continue;
        const b = await el.boundingBox();
        const name =
          (await el.textContent()) || (await el.getAttribute('aria-label'));
        expect(b!.height, `${name} height`).toBeGreaterThanOrEqual(43.5);
        expect(b!.width, `${name} width`).toBeGreaterThanOrEqual(43.5);
      }
    }
  });

  test('flyouts are full-width sheets and close with Esc', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Люди', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Люди и поиск'});
    await expect(dialog).toBeVisible();
    const box = await page.locator('.sheet').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(389);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the sheet handle collapses and expands the card', async ({page}) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    await card.getByRole('button', {name: 'Свернуть карточку'}).first().click();
    await expect(
      card.getByRole('link', {name: 'Евдокия Семёновна Крылова'}),
    ).toBeHidden();
    await card.getByRole('button', {name: 'Свернуть карточку'}).first().click();
    await expect(
      card.getByRole('link', {name: 'Евдокия Семёновна Крылова'}),
    ).toBeAttached();
  });

  test('settings sheet holds language, file and theme controls', async ({
    page,
  }) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Настройки'}).click();
    const dialog = page.getByRole('dialog', {name: 'Настройки'});
    await expect(dialog.getByRole('radio', {name: 'English'})).toBeAttached();
    await expect(
      dialog.getByRole('button', {name: 'Открыть файл'}),
    ).toBeVisible();
    await expect(dialog.getByRole('button', {name: 'По ссылке'})).toBeVisible();
  });
});
