import {expect, test} from '@playwright/test';

// A 4×4 PNG: red top-left pixel, the rest blue.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAGUlEQVR4nGP4z8DAwMDAwMDAwMDAwMBAAQAAP5wC/mEJ1y0AAAAASUVORK5CYII=',
  'base64',
);

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '1 SEX F',
  '1 OBJE @O1@',
  '2 CROP',
  '3 LEFT 1',
  '3 TOP 1',
  '3 WIDTH 2',
  '3 HEIGHT 2',
  '1 FAMS @F1@',
  '0 @I2@ INDI',
  '1 NAME Пётр /Тестов/',
  '1 SEX M',
  '1 OBJE @O2@',
  '1 FAMS @F1@',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '0 @O1@ OBJE',
  '1 FILE https://images.example.test/anna.png',
  '2 FORM image/png',
  '0 @O2@ OBJE',
  '1 FILE https://images.example.test/missing.png',
  '2 FORM image/png',
  '0 TRLR',
  '',
].join('\n');

test('people with a photo show it on the chart, cropped, or their initials', async ({
  page,
}) => {
  await page.route('https://images.example.test/anna.png', (route) =>
    route.fulfill({contentType: 'image/png', body: PNG}),
  );
  await page.route('https://images.example.test/missing.png', (route) =>
    route.fulfill({status: 404, body: ''}),
  );
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'photos.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  const anna = page.locator('.gv-person', {hasText: 'Анна Тестова'});
  const petr = page.locator('.gv-person', {hasText: 'Пётр Тестов'});
  await expect(anna.locator('.gv-photo image')).toHaveAttribute(
    'href',
    'https://images.example.test/anna.png',
  );
  // CROP in image pixels becomes the view box of the portrait.
  await expect(anna.locator('.gv-photo-frame')).toHaveAttribute(
    'viewBox',
    '1 1 2 2',
  );
  await expect(anna.locator('.gv-photo-ring')).toHaveClass(/gv-F/);
  // The image failed: the initials stay.
  await expect(petr.locator('.gv-photo-frame')).toHaveCount(0);
  await expect(petr.locator('.gv-initials')).toHaveText('ПТ');
  // The portrait is decorative; the name is the label.
  await expect(anna).toHaveAccessibleName(/^Анна Тестова/);
});

test('remote photos are not loaded when linked images are switched off', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('https://images.example.test/**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({contentType: 'image/png', body: PNG});
  });
  await page.goto('/');
  await page.getByRole('button', {name: 'Настройки'}).click();
  await page.getByText('Загружать изображения по ссылкам из файла').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('file-input').setInputFiles({
    name: 'photos.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  await expect(page.locator('.gv-person').first()).toBeVisible();
  await expect(page.locator('.gv-photo')).toHaveCount(0);
  expect(requests).toEqual([]);
});
