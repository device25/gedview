import {expect, test} from '@playwright/test';

async function ready(page: import('@playwright/test').Page, path = '/?demo') {
  await page.goto(path);
  await expect(
    page.getByRole('heading', {level: 2, name: 'Иван Петрович Соколов'}),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // The chart is drawn (boxes, and the label on the disputed link).
  await expect(page.locator('g.gv-person').first()).toBeVisible();
  await expect(page.locator('.gv-pill')).toHaveCount(1);
}

test('demo screen, light', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await ready(page);
  await expect(page).toHaveScreenshot('demo-light.png');
});

test('demo screen, dark', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'});
  await ready(page);
  await expect(page).toHaveScreenshot('demo-dark.png');
});

test('full card', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await ready(page);
  await page.getByRole('button', {name: 'Все сведения'}).click();
  await expect(
    page.getByRole('dialog', {name: 'Иван Петрович Соколов'}),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('full-card.png');
});

test('full card, lower sections', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await ready(page);
  await page.getByRole('button', {name: 'Все сведения'}).click();
  const dialog = page.getByRole('dialog', {name: 'Иван Петрович Соколов'});
  await dialog.getByText('Служебные сведения').last().click();
  await dialog
    .getByRole('heading', {name: 'Внешние ссылки'})
    .scrollIntoViewIfNeeded();
  await page
    .locator('.drawer')
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page).toHaveScreenshot('full-card-bottom.png');
});

test.describe('phone', () => {
  test.use({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });

  test('demo screen on a phone', async ({page}) => {
    await page.emulateMedia({colorScheme: 'light'});
    await ready(page);
    await expect(page).toHaveScreenshot('demo-mobile.png');
  });
});

test('summary, light', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await page.goto('/?demo#mode=summary&id=I6');
  await expect(
    page.getByRole('heading', {name: 'Известные предки'}),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('summary-light.png', {fullPage: true});
});
