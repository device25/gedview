import {expect, test} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '1 LANG ru',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '1 RESI',
  '2 DATE 2023',
  '2 PLAC Белград, Сербия',
  '3 TRAN Belgrade, Serbia',
  '4 LANG en',
  '3 EXID 1234',
  '4 TYPE https://settlements.example.test/places',
  '3 NOTE Район Земун: жили у реки.',
  '0 TRLR',
  '',
].join('\n');

async function open(page: import('@playwright/test').Page, lang: string) {
  await page.addInitScript(
    (l) => localStorage.setItem('gedview.lang', l),
    lang,
  );
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'places.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  await expect(page.getByRole('complementary')).toContainText('Анна');
}

test('a place: in the UI language, with its note and link in the full card', async ({
  page,
}) => {
  await open(page, 'ru');
  const card = page.getByRole('complementary');
  await expect(card).toContainText('Белград, Сербия');
  await card.getByRole('button', {name: 'Все сведения'}).click();
  const dialog = page.getByRole('dialog', {name: /Анна Тестова/});
  const event = dialog.locator('.event', {hasText: 'Белград'});
  await expect(event).toContainText('Район Земун: жили у реки.');
  await expect(event).toContainText('settlements.example.test 1234');
  await expectNoAxeViolations(page);
});

test('in English the place is the file’s English name', async ({page}) => {
  await open(page, 'en');
  await expect(page.getByRole('complementary')).toContainText(
    'Belgrade, Serbia',
  );
});
