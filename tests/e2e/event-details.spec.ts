import {expect, test} from '@playwright/test';

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '1 CENS',
  '2 DATE 1926',
  '2 AGNC Центральное статистическое управление',
  '1 DEAT',
  '2 DATE 1942',
  '2 CAUS тиф',
  '1 BURI',
  '2 ADDR Введенское кладбище',
  '3 CONT участок 12',
  '2 AGNC Ритуал',
  '0 TRLR',
  '',
].join('\n');

test('events show their cause, agency and address', async ({page}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'events.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  const card = page.getByRole('complementary');
  // The cause of death is in the card itself.
  await expect(card).toContainText('Причина: тиф');

  await card.getByRole('button', {name: 'Все сведения'}).click();
  const dialog = page.getByRole('dialog', {name: /Анна Тестова/});
  await expect(dialog.locator('.event', {hasText: 'Перепись'})).toContainText(
    'Учреждение: Центральное статистическое управление',
  );
  const burial = dialog.locator('.event', {hasText: 'Погребение'});
  await expect(burial).toContainText('Адрес: Введенское кладбище, участок 12');
  await expect(burial).toContainText('Учреждение: Ритуал');
});
