import {expect, test, type Page} from '@playwright/test';

// One 1×1 PNG pixel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Remote images are off by default; these tests turn them on first. */
async function allowRemoteImages(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'gedview.settings',
      JSON.stringify({loadRemoteMedia: true}),
    ),
  );
}

const GED = (url: string) =>
  [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 7.0',
    '0 @I1@ INDI',
    '1 NAME Анна /Тестова/',
    '1 BIRT',
    '2 DATE 3 DEC 1961',
    '1 OBJE @O1@',
    '0 @O1@ OBJE',
    `1 FILE ${url}`,
    '2 FORM image/jpeg',
    '0 TRLR',
    '',
  ].join('\n');

async function openWithRemoteImage(page: Page, url: string) {
  await allowRemoteImages(page);
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'remote.ged',
      mimeType: 'text/plain',
      buffer: Buffer.from(GED(url)),
    });
  await expect(page.getByRole('heading', {name: 'Анна Тестова'})).toBeVisible();
  await page.getByRole('button', {name: 'Все сведения'}).click();
}

test.describe('media linked from the file', () => {
  test('a remote image is shown without a referrer', async ({page}) => {
    let referer: string | undefined = 'unset';
    await page.route('https://images.example.test/**', (route) => {
      referer = route.request().headers()['referer'];
      return route.fulfill({contentType: 'image/png', body: PNG});
    });
    await openWithRemoteImage(
      page,
      'https://images.example.test/photos/%D0%90%D0%BD%D0%BD%D0%B0.jpg',
    );
    const img = page.locator('img.media__thumb');
    await expect(img).toBeVisible();
    await expect(img).toHaveJSProperty('naturalWidth', 1);
    expect(referer).toBeUndefined();
    // The decoded file name is shown, not the whole URL.
    await expect(page.getByText('Анна.jpg')).toBeVisible();
    await expect(page.getByRole('link', {name: /Открыть/})).toHaveAttribute(
      'href',
      /^https:\/\/images\.example\.test\//,
    );
  });

  test('a failing remote image shows a fallback and a link', async ({page}) => {
    await page.route('https://images.example.test/**', (route) =>
      route.fulfill({status: 401, body: ''}),
    );
    await openWithRemoteImage(page, 'https://images.example.test/private.jpg');
    await expect(page.getByText('не загрузилось')).toBeVisible();
    await expect(page.getByRole('link', {name: /Открыть/})).toBeVisible();
  });

  test('remote loading is off by default', async ({page}) => {
    const requests: string[] = [];
    await page.route('https://images.example.test/**', (route) => {
      requests.push(route.request().url());
      return route.fulfill({contentType: 'image/png', body: PNG});
    });
    await page.goto('/');
    await page.getByRole('button', {name: 'Настройки'}).click();
    const toggle = page.getByRole('checkbox', {
      name: 'Загружать изображения по ссылкам из файла',
    });
    await expect(toggle).not.toBeChecked();
    // The hint says why.
    await expect(toggle).toHaveAccessibleDescription(/IP-адрес/);
    await page.keyboard.press('Escape');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({
        name: 'remote.ged',
        mimeType: 'text/plain',
        buffer: Buffer.from(GED('https://images.example.test/a.jpg')),
      });
    await page.getByRole('button', {name: 'Все сведения'}).click();
    await expect(page.getByText('по ссылке, загрузка выключена')).toBeVisible();
    expect(requests).toEqual([]);
  });

  test('a person with only a birth date has no dangling dash', async ({
    page,
  }) => {
    await page.route('https://images.example.test/**', (route) =>
      route.fulfill({contentType: 'image/png', body: PNG}),
    );
    await openWithRemoteImage(page, 'https://images.example.test/a.jpg');
    await expect(page.getByText(/^3\sдекабря\s1961$/).first()).toBeVisible();
    await expect(page.getByText(/1961\s*[—–]\s*$/)).toHaveCount(0);
  });
});
