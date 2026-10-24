import {expect, test} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @R1@ REPO',
  '1 NAME Центральный государственный архив города Москвы',
  '0 @S1@ SOUR',
  '1 TITL Метрическая книга Покровской церкви',
  '1 AUTH Покровская церковь',
  '1 PUBL рукопись',
  '1 REPO @R1@',
  '2 CALN Ф. 203. Оп. 745. Д. 12',
  '1 NOTE Книга за 1889–1895 годы, есть пропуски.',
  '0 @S2@ SOUR',
  '1 TITL Рассказ бабушки',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '1 BIRT',
  '2 DATE 1889',
  '2 SOUR @S1@',
  '3 PAGE л. 15',
  '0 TRLR',
  '',
].join('\n');

test('a source shows its author, publication and where it is kept', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'sources.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  await page
    .getByRole('complementary')
    .getByRole('button', {name: 'Все сведения'})
    .click();
  const sources = page
    .getByRole('dialog', {name: /Анна Тестова/})
    .getByRole('region', {name: 'Источники'});
  await expect(sources).toContainText('Покровская церковь · рукопись');
  await expect(sources).toContainText(
    'Хранится: Центральный государственный архив города Москвы, шифр Ф. 203. Оп. 745. Д. 12',
  );
  await expect(sources).toContainText('л. 15');
  await page.keyboard.press('Escape');

  // The panel: a source with details opens; one without stays a line.
  await page.getByRole('button', {name: 'Источники'}).click();
  const list = page.getByRole('list', {name: 'Источники'});
  await expect(list.locator('details')).toHaveCount(1);
  await list.getByText('Метрическая книга Покровской церкви').click();
  await expect(list).toContainText('Книга за 1889–1895 годы, есть пропуски.');
  await expect(list).toContainText('шифр Ф. 203. Оп. 745. Д. 12');
  await expectNoAxeViolations(page);
});
