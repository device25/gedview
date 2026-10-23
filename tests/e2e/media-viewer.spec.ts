import {expect, test, type Page} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

// A 4×4 PNG: red top-left pixel, the rest blue.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAGUlEQVR4nGP4z8DAwMDAwMDAwMDAwMBAAQAAP5wC/mEJ1y0AAAAASUVORK5CYII=',
  'base64',
);

const obje = (id: string, file: string, form: string, title: string) => [
  `0 @${id}@ OBJE`,
  `1 FILE ${file}`,
  `2 FORM ${form}`,
  `2 TITL ${title}`,
];

/** Анна has four linked photos, a PDF and a page: six files. */
const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '1 SEX F',
  ...['O1', 'O2', 'O3', 'O4', 'O5', 'O6'].map((o) => `1 OBJE @${o}@`),
  ...obje('O1', 'https://images.example.test/1.png', 'image/png', 'Портрет'),
  ...obje('O2', 'https://images.example.test/2.png', 'image/png', 'Свадьба'),
  ...obje('O3', 'https://photos.example.test/3.png', 'image/png', 'Дом'),
  ...obje('O4', 'https://images.example.test/4.png', 'image/png', 'Школа'),
  ...obje(
    'O5',
    'https://docs.example.test/5.pdf',
    'application/pdf',
    'Метрика',
  ),
  ...obje('O6', 'https://docs.example.test/6.html', 'text/html', 'Статья'),
  '0 TRLR',
  '',
].join('\n');

async function openAnna(page: Page, remote: boolean) {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('.example.test')) requests.push(r.url());
  });
  await page.route('https://*.example.test/**', (route) =>
    route.fulfill({contentType: 'image/png', body: PNG}),
  );
  if (remote) {
    await page.addInitScript(() =>
      localStorage.setItem(
        'gedview.settings',
        JSON.stringify({loadRemoteMedia: true}),
      ),
    );
  }
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'media.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  await expect(page.getByRole('complementary')).toContainText('Анна Тестова');
  return requests;
}

test.describe('media in the card', () => {
  test('linked images off: nothing is requested, the card says why and from where', async ({
    page,
  }) => {
    const requests = await openAnna(page, false);
    const card = page.getByRole('complementary');
    await expect(card.getByRole('button', {name: /^Фото:/})).toHaveCount(0);
    await expect(card).toContainText('Изображения по ссылкам не загружаются');
    await expect(card).toContainText(
      'Файлы будут загружаться с images.example.test, photos.example.test и docs.example.test',
    );
    expect(requests).toEqual([]);

    await card
      .getByRole('button', {name: 'Показывать изображения по ссылкам'})
      .click();
    await expect(
      card.getByRole('button', {name: 'Фото: Портрет. Открыть просмотр'}),
    ).toBeVisible();
  });

  test('the portrait and the strip open the viewer; arrows and buttons go through the files', async ({
    page,
  }) => {
    await openAnna(page, true);
    const card = page.getByRole('complementary');
    // Four in the strip, then «ещё 2».
    const strip = card.getByRole('region', {name: 'Медиа'});
    await expect(
      strip.getByRole('button', {name: /^Открыть просмотр/}),
    ).toHaveCount(4);
    await expect(strip.getByRole('button', {name: 'ещё 2'})).toBeVisible();

    await card
      .getByRole('button', {name: 'Фото: Портрет. Открыть просмотр'})
      .click();
    const viewer = page.getByRole('dialog', {name: 'Портрет'});
    await expect(viewer).toBeVisible();
    await expect(viewer).toContainText('1 из 6');
    await expect(viewer.getByRole('img', {name: 'Портрет'})).toBeVisible();
    await expectNoAxeViolations(page);

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', {name: 'Свадьба'})).toContainText(
      '2 из 6',
    );
    await page.getByRole('button', {name: 'Предыдущий файл'}).click();
    await page.getByRole('button', {name: 'Предыдущий файл'}).click();
    // From the first, back goes round to the last: the page.
    const last = page.getByRole('dialog', {name: 'Статья'});
    await expect(last).toContainText('6 из 6');
    await expect(last).toContainText('HTML');
    await expect(last).toContainText('Предпросмотра нет');
    await expect(
      last.getByRole('link', {name: /Открыть оригинал/}),
    ).toHaveAttribute('href', 'https://docs.example.test/6.html');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await strip.getByRole('button', {name: 'Открыть просмотр: Дом'}).click();
    await expect(page.getByRole('dialog', {name: 'Дом'})).toContainText(
      '3 из 6',
    );
    await page.getByRole('button', {name: 'Закрыть просмотр'}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('«ещё 2» opens the full card at its media, which open the viewer too', async ({
    page,
  }) => {
    await openAnna(page, true);
    await page
      .getByRole('complementary')
      .getByRole('button', {name: 'ещё 2'})
      .click();
    const full = page.getByRole('dialog', {name: /Анна Тестова/});
    const heading = full.getByRole('heading', {name: 'Медиа'});
    await expect(heading).toBeInViewport();
    // An image opens the viewer; a file without a picture has no button.
    await expect(
      full.getByRole('button', {name: 'Открыть просмотр: Метрика'}),
    ).toHaveCount(0);
    await full.getByRole('button', {name: 'Открыть просмотр: Школа'}).click();
    await expect(page.getByRole('dialog', {name: 'Школа'})).toContainText(
      '4 из 6',
    );
  });
});
