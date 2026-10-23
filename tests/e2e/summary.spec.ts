import {expect, test, type Page} from '@playwright/test';
import {expectNoAxeViolations, openDemo} from './helpers';

/** Opens the demo straight on «Сводка», counted from Александра. */
async function openSummary(page: Page) {
  await page.goto('/?demo#mode=summary&id=I6');
  await expect(
    page.getByRole('heading', {level: 2, name: 'Известные предки'}),
  ).toBeVisible();
}

test.describe('summary', () => {
  test('the rail opens «Сводка»; the URL keeps it', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Сводка'}).click();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Известные предки'}),
    ).toBeVisible();
    await expect(page.getByRole('button', {name: 'Сводка'})).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page).toHaveURL(/mode=summary/);
    await page.reload();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Требует внимания'}),
    ).toBeVisible();
  });

  test('ancestors, checks, sources, births and surnames from the demo', async ({
    page,
  }) => {
    await page.emulateMedia({colorScheme: 'light'});
    await openSummary(page);
    await expect(page.getByText(/^10 человек в 5 семьях/)).toBeVisible();
    // Александра's grandparents: all four known, two links disputed.
    const grand = page.getByRole('button', {
      name: /^Пётр Ильич Соколов; связь спорная$/,
    });
    await expect(grand).toBeVisible();
    await expect(page.getByText('из них 2 спорные')).toBeVisible();
    await expect(
      page.getByText('Противоречий не найдено', {exact: false}),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {name: 'Частые фамилии'}),
    ).toBeVisible();
    await expect(page.getByText('Крылов', {exact: true})).toBeVisible();
    await expectNoAxeViolations(page);
    await page.emulateMedia({colorScheme: 'dark'});
    await expectNoAxeViolations(page);
  });

  test('a check opens People with the people it is about', async ({page}) => {
    await openSummary(page);
    await page.getByRole('button', {name: /^Без ссылок на источники/}).click();
    const dialog = page.getByRole('dialog', {name: 'Люди и поиск'});
    await expect(
      dialog.getByText('Проверка: Без ссылок на источники'),
    ).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText('Найдено: 9');
    await dialog.getByRole('option', {name: /^Пётр Ильич Соколов/}).click();
    // Choosing a person shows them on the chart, with the card.
    await expect(
      page.getByRole('heading', {level: 2, name: 'Пётр Ильич Соколов'}),
    ).toBeVisible();
    await expect(page.getByRole('button', {name: 'Схема'})).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('a grandparent cell selects them on the chart', async ({page}) => {
    await openSummary(page);
    await page.getByRole('button', {name: /^Семён Фёдорович Крылов/}).click();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Семён Фёдорович Крылов'}),
    ).toBeVisible();
  });
});
