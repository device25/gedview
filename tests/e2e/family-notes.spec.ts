import {expect, test} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @S1@ SOUR',
  '1 TITL Письма деда',
  '0 @I1@ INDI',
  '1 NAME Иван /Тестов/',
  '1 SEX M',
  '1 FAMS @F1@',
  '0 @I2@ INDI',
  '1 NAME Анна /Тестова/',
  '1 SEX F',
  '1 FAMS @F1@',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 NOTE Познакомились на заводе в 1910 году.',
  '1 SOUR @S1@',
  '2 PAGE письмо от 3 мая',
  '0 TRLR',
  '',
].join('\n');

test('a family’s notes and sources are shown under the spouse', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'family.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  await page
    .getByRole('complementary')
    .getByRole('button', {name: 'Все сведения'})
    .click();
  const dialog = page.getByRole('dialog', {name: /Иван Тестов/});
  const family = dialog.getByRole('region', {name: 'Семья'});
  await expect(family).toContainText('О семье');
  await expect(family).toContainText('Познакомились на заводе в 1910 году.');
  await family.getByRole('link', {name: /^\[\d+\]$/}).click();
  const sources = dialog.getByRole('region', {name: 'Источники'});
  await expect(sources.locator('li', {hasText: 'Письма деда'})).toBeFocused();
  await expect(sources).toContainText('письмо от 3 мая');
  await expectNoAxeViolations(page);
});
