import {expect, test} from '@playwright/test';
import {openDemo} from './helpers';

test.describe('flyouts', () => {
  test('open with the keyboard, close with Esc and return focus to the button', async ({
    page,
  }) => {
    await openDemo(page);
    const people = page.getByRole('button', {
      name: 'Люди и поиск',
      exact: true,
    });
    await people.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'Люди и поиск'});
    await expect(dialog).toBeVisible();
    await expect(people).toHaveAttribute('aria-expanded', 'true');
    // Focus moved into the panel (the search field).
    await expect(dialog.getByRole('searchbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(people).toBeFocused();
  });

  test('"/" opens the search and finds a person by surname and year', async ({
    page,
  }) => {
    await openDemo(page);
    await page.locator('body').click({position: {x: 700, y: 600}});
    await page.keyboard.press('/');
    const search = page.getByRole('searchbox', {name: 'Поиск человека'});
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await search.fill('соколов 1919');
    const options = page.getByRole('option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('Александра Ивановна Соколова');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Александра Ивановна Соколова',
      }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('"/" typed in a field does not steal focus', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Люди и поиск'}).click();
    const search = page.getByRole('searchbox');
    await search.fill('а/б');
    await expect(search).toHaveValue('а/б');
  });

  test('the sources flyout lists sources from the file', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Источники', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Источники'});
    await expect(
      dialog.getByText('Метрическая книга Покровской церкви, 1889'),
    ).toBeVisible();
    await dialog.getByRole('button', {name: 'Закрыть: Источники'}).click();
    await expect(dialog).toBeHidden();
  });

  test('only one flyout is open at a time', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Настройки'}).click();
    await expect(page.getByRole('dialog', {name: 'Настройки'})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Язык интерфейса'}).click();
    await expect(page.getByRole('dialog', {name: 'Язык'})).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
});

test.describe('language and theme', () => {
  test('switching to English translates the UI and sets <html lang>', async ({
    page,
  }) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Язык интерфейса'}).click();
    const dialog = page.getByRole('dialog', {name: 'Язык'});
    await expect(dialog.getByRole('radio', {name: 'Русский'})).toBeChecked();
    await dialog.getByText('English', {exact: true}).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('tab', {name: 'Hourglass'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Open file'})).toBeVisible();
    await expect(
      page.getByText('sokolovy.gdz · GEDCOM 7.0.18 · 10 people'),
    ).toBeVisible();
    const card = page.getByRole('complementary');
    await expect(card).toContainText('6 April 1889 O.S.');
    await expect(card.getByText('Godfather')).toBeVisible();
    await expect(
      page.getByRole('button', {name: 'Interface language'}),
    ).toHaveText('EN');
    // The choice survives a reload.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the theme button toggles light and dark and is remembered', async ({
    page,
  }) => {
    await openDemo(page);
    const html = page.locator('html');
    await page.getByRole('button', {name: 'Сменить тему'}).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bg).toBe('rgb(18, 19, 20)');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', {name: 'Сменить тему'}).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('settings offer System, Light and Dark; System follows the OS', async ({
    page,
  }) => {
    await page.emulateMedia({colorScheme: 'dark'});
    await openDemo(page);
    const html = page.locator('html');
    await expect(html).not.toHaveAttribute('data-theme');
    await page.getByRole('button', {name: 'Настройки'}).click();
    await page.getByRole('button', {name: /Тема/}).click();
    await expect(page.getByRole('option')).toHaveText([
      'Как в системе',
      'Светлая',
      'Тёмная',
    ]);
    await page.getByRole('option', {name: 'Светлая'}).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });
});
