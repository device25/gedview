import {expect, test} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @R1@ REPO',
  '1 NAME Центральный государственный архив',
  '1 ADDR ул. Профсоюзная, 82',
  '2 CITY Москва',
  '1 WWW https://archives.example.test',
  '0 @S1@ SOUR',
  '1 TITL Фотоархив семьи',
  '1 REPO @R1@',
  '0 @O1@ OBJE',
  '1 FILE https://images.example.test/1.jpg',
  '2 FORM image/jpeg',
  '2 TITL Свадьба',
  '1 NOTE На обороте: «Мама и папа».',
  '1 SOUR @S1@',
  '2 PAGE альбом 2',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '1 OBJE @O1@',
  '0 TRLR',
  '',
].join('\n');

test('an archive’s address and site; a file’s note and source', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'repo.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(GED),
  });
  await page
    .getByRole('complementary')
    .getByRole('button', {name: 'Все сведения'})
    .click();
  const dialog = page.getByRole('dialog', {name: /Анна Тестова/});
  const media = dialog.getByRole('region', {name: 'Медиа'});
  await expect(media).toContainText('На обороте: «Мама и папа».');
  await expect(media.getByRole('link', {name: /^\[\d+\]$/})).toHaveCount(1);
  await expect(dialog.getByRole('region', {name: 'Источники'})).toContainText(
    'альбом 2',
  );
  await page.keyboard.press('Escape');

  await page.getByRole('button', {name: 'Источники'}).click();
  const list = page.getByRole('list', {name: 'Источники'});
  await list.getByText('Фотоархив семьи').click();
  await expect(list).toContainText('Адрес: ул. Профсоюзная, 82, Москва');
  await expect(
    list.getByRole('link', {name: /archives\.example\.test/}),
  ).toHaveAttribute('href', /^https:\/\/archives\.example\.test\/?$/);
  await expectNoAxeViolations(page);
});
