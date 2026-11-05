import {expect, test, type Page} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

// Илья (QUAY 3) → Пётр (no citation) + Мария (QUAY 1) → Анна (QUAY 2) → Олег
// (a citation without QUAY).
const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 7.0',
  '0 @S1@ SOUR',
  '1 TITL Метрическая книга',
  '0 @I1@ INDI',
  '1 NAME Анна /Тестова/',
  '1 FAMC @F1@',
  '1 FAMS @F2@',
  '1 BIRT',
  '2 SOUR @S1@',
  '3 QUAY 2',
  '0 @I2@ INDI',
  '1 NAME Пётр /Тестов/',
  '1 FAMC @F0@',
  '1 FAMS @F1@',
  '0 @I3@ INDI',
  '1 NAME Мария /Тестова/',
  '1 FAMS @F1@',
  '1 BIRT',
  '2 SOUR @S1@',
  '3 PAGE л. 2',
  '3 QUAY 1',
  '0 @I4@ INDI',
  '1 NAME Олег /Тестов/',
  '1 FAMC @F2@',
  '1 BIRT',
  '2 SOUR @S1@',
  '3 PAGE л. 4',
  '0 @I5@ INDI',
  '1 NAME Илья /Тестов/',
  '1 FAMS @F0@',
  '1 DEAT',
  '2 SOUR @S1@',
  '3 PAGE л. 5',
  '3 QUAY 3',
  '0 @F0@ FAM',
  '1 HUSB @I5@',
  '1 CHIL @I2@',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I3@',
  '1 CHIL @I1@',
  '0 @F2@ FAM',
  '1 WIFE @I1@',
  '1 CHIL @I4@',
  '0 TRLR',
  '',
].join('\n');

const box = (page: Page, id: string) =>
  page.locator(`g.gv-person[data-id="${id}"]`);

async function setThreshold(page: Page, label: string) {
  await page.getByRole('button', {name: 'Настройки'}).click();
  await page
    .getByRole('button', {name: /Люди на схеме: надёжность не ниже/})
    .click();
  await page.getByRole('option', {name: label, exact: true}).click();
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {name: 'Настройки'})).toBeHidden();
}

test.describe('reliability threshold', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({
      name: 'quay.ged',
      mimeType: 'text/plain',
      buffer: Buffer.from(GED),
    });
    await expect(box(page, 'I1')).toBeVisible();
  });

  test('hides people below it and dims those who link the others', async ({
    page,
  }) => {
    // «Все» is the default: everyone is drawn, nobody is pale.
    await expect(page.locator('g.gv-person')).toHaveCount(5);
    await expect(page.locator('g.gv-dimmed')).toHaveCount(0);
    await expect(page.locator('.legend__dimmed')).toHaveCount(0);

    await setThreshold(page, '2');
    await expect(page.locator('g.gv-person')).toHaveCount(3);
    await expect(box(page, 'I1')).toBeVisible();
    await expect(box(page, 'I5')).toBeVisible();
    await expect(box(page, 'I3')).toHaveCount(0);
    await expect(box(page, 'I4')).toHaveCount(0);
    // Пётр has no citation, but Илья is reached through him.
    await expect(box(page, 'I2')).toHaveClass(/gv-dimmed/);
    await expect(box(page, 'I2')).toHaveAttribute(
      'aria-label',
      /источники ниже порога надёжности/,
    );
    await expect(box(page, 'I1')).not.toHaveClass(/gv-dimmed/);
    await expect(box(page, 'I5')).not.toHaveClass(/gv-dimmed/);
    await expect(page.locator('.legend__dimmed')).toBeVisible();
    // Focus went back to «Настройки»; its tooltip is not what is checked here.
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await expect(page.locator('.tip__label')).toHaveCount(0);
    await expectNoAxeViolations(page);

    // «0» takes every rated citation; Олег's has no QUAY.
    await setThreshold(page, '0');
    await expect(page.locator('g.gv-person')).toHaveCount(4);
    await expect(box(page, 'I3')).toBeVisible();
    await expect(box(page, 'I4')).toHaveCount(0);

    // And back.
    await setThreshold(page, 'Все');
    await expect(page.locator('g.gv-person')).toHaveCount(5);
    await expect(page.locator('g.gv-dimmed')).toHaveCount(0);
  });

  test('a hidden person opened from the card becomes the root', async ({
    page,
  }) => {
    await setThreshold(page, '2');
    await expect(box(page, 'I3')).toHaveCount(0);
    await page
      .getByRole('complementary')
      .getByRole('link', {name: /Мария Тестова/})
      .click();
    await expect(box(page, 'I3')).toBeVisible();
    await expect(box(page, 'I3')).toHaveClass(/gv-dimmed/);
    await expect(box(page, 'I3')).toHaveAttribute(
      'aria-label',
      /Точка отсчёта/,
    );
  });

  test('the card still lists every source of the person', async ({page}) => {
    await setThreshold(page, '3');
    const card = page.getByRole('complementary');
    await expect(card).toContainText('1 источник');
    await card.getByRole('button', {name: 'Все сведения'}).click();
    const sources = page
      .getByRole('dialog', {name: /Анна Тестова/})
      .getByRole('region', {name: 'Источники'});
    await expect(sources.getByRole('listitem')).toHaveCount(1);
    await expect(sources).toContainText('Надёжность 2');
  });

  test('the choice is saved with the other settings', async ({page}) => {
    await setThreshold(page, '3');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('gedview.settings')))
      .toContain('"minSourceQuality":"3"');
  });
});

test('a selected person the threshold hides leaves the root in view', async ({
  page,
}) => {
  // Р (QUAY 3) with six children of six children each: the grandchild picked
  // is far from the root, and has no citation.
  const kids = Array.from({length: 6}, (_, i) => `K${i}`);
  const grandkids = (k: string) =>
    Array.from({length: 6}, (_, i) => `${k}G${i}`);
  const ged = [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 7.0',
    '0 @S1@ SOUR',
    '1 TITL Книга',
    '0 @R@ INDI',
    '1 NAME Корень',
    '1 FAMS @F@',
    '1 BIRT',
    '2 SOUR @S1@',
    '3 QUAY 3',
    '0 @F@ FAM',
    '1 HUSB @R@',
    ...kids.map((k) => `1 CHIL @${k}@`),
    ...kids.flatMap((k) => [
      `0 @${k}@ INDI`,
      `1 NAME ${k}`,
      '1 FAMC @F@',
      `1 FAMS @F${k}@`,
      `0 @F${k}@ FAM`,
      `1 HUSB @${k}@`,
      ...grandkids(k).map((g) => `1 CHIL @${g}@`),
      ...grandkids(k).flatMap((g) => [
        `0 @${g}@ INDI`,
        `1 NAME ${g}`,
        `1 FAMC @F${k}@`,
      ]),
    ]),
    '0 TRLR',
    '',
  ].join('\n');
  await page.goto('/#id=K5G5&root=R');
  await page.getByTestId('file-input').setInputFiles({
    name: 'wide.ged',
    mimeType: 'text/plain',
    buffer: Buffer.from(ged),
  });
  await expect(box(page, 'K5G5')).toBeInViewport();

  await setThreshold(page, '3');
  await expect(box(page, 'K5G5')).toHaveCount(0);
  await expect(page.locator('g.gv-person')).toHaveCount(1);
  await expect(box(page, 'R')).toBeInViewport();
});
