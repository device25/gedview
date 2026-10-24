import {expect, test} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @S1@ SOUR',
  '1 TITL Рассказ бабушки',
  '0 @S2@ SOUR',
  '1 TITL Метрическая книга',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '1 NOTE Со слов бабушки: жили на хуторе.',
  '2 SOUR @S1@',
  '3 PAGE запись 2019 года',
  '1 BIRT',
  '2 DATE 1912',
  '2 NOTE Крестили дома.',
  '3 SOUR @S2@',
  '0 TRLR',
  '',
].join('\n');

test('a note’s own sources are numbered and listed with the others', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'notes.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  const card = page.getByRole('complementary');
  await expect(card).toContainText('2 источника');

  await card.getByRole('button', {name: 'Все сведения'}).click();
  const dialog = page.getByRole('dialog', {name: /Анна Тестова/});
  const sources = dialog.getByRole('region', {name: 'Источники'});
  await expect(sources.locator('li')).toHaveCount(2);
  await expect(sources).toContainText('Рассказ бабушки');
  await expect(sources).toContainText('запись 2019 года');
  await expect(sources).toContainText('Метрическая книга');

  // The event's note and the person's note each link to their source.
  const notes = dialog.getByRole('region', {name: 'Заметки'});
  const link = notes.getByRole('link', {name: /^\[\d+\]$/});
  await expect(link).toHaveCount(1);
  await link.click();
  await expect(
    sources.locator('li', {hasText: 'Рассказ бабушки'}),
  ).toBeFocused();
  await expect(
    dialog.locator('.event', {hasText: 'Крестили дома'}).getByRole('link', {
      name: /^\[\d+\]$/,
    }),
  ).toHaveCount(1);
  await expectNoAxeViolations(page);
});
