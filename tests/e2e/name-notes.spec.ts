import {expect, test} from '@playwright/test';

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '1 SOUR familia-tools',
  '2 NAME Familia tools',
  '1 SUBM @U1@',
  '1 NOTE Дерево семьи Тестовых: кровные родственники и их супруги.',
  '0 @U1@ SUBM',
  '1 NAME Андрей Тестов',
  '0 @S1@ SOUR',
  '1 TITL Паспорт',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '2 NOTE Фамилию писала через «е» до 1950-х.',
  '2 SOUR @S1@',
  '0 TRLR',
  '',
].join('\n');

async function open(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'names.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  await expect(page.getByRole('complementary')).toContainText('Анна');
}

test('a name shows its note and its source', async ({page}) => {
  await open(page);
  await page
    .getByRole('complementary')
    .getByRole('button', {name: 'Все сведения'})
    .click();
  const names = page
    .getByRole('dialog', {name: /Анна Тестова/})
    .getByRole('region', {name: 'Имена'});
  await expect(names).toContainText('Фамилию писала через «е» до 1950-х.');
  await expect(names.getByRole('link', {name: /^\[\d+\]$/})).toHaveCount(1);
});

test('«Сводка» shows the file’s own note and who made it', async ({page}) => {
  await open(page);
  await page.getByRole('button', {name: 'Сводка'}).click();
  const about = page.getByRole('region', {name: 'О файле'});
  await expect(about).toContainText(
    'Дерево семьи Тестовых: кровные родственники и их супруги.',
  );
  await expect(about).toContainText(
    'Составитель: Андрей Тестов · Программа: Familia tools',
  );
});
