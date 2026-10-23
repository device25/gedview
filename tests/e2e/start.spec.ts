import {expect, test} from '@playwright/test';
import {expectNoAxeViolations, moveMouseTo, trackExternal} from './helpers';

test.describe('start screen', () => {
  test('explains the app, offers the open actions and says the file stays local', async ({
    page,
  }) => {
    const external = trackExternal(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', {level: 1, name: 'Gedview'}),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {name: 'Открыть файл'}),
    ).toBeVisible();
    await expect(page.getByRole('button', {name: 'По ссылке'})).toBeVisible();
    await expect(page.getByText('Файл не покидает ваш браузер')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expectNoAxeViolations(page);
    expect(external).toEqual([]);
  });

  test('has landmarks and a skip link that moves focus to the main area', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('navigation', {name: 'Основное меню'}),
    ).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', {name: 'Перейти к схеме'});
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    // The URL hash is not touched by the skip link.
    expect(new URL(page.url()).hash).toBe('');
  });

  test('menu items that need a tree are unavailable and say why', async ({
    page,
  }) => {
    await page.goto('/');
    for (const name of ['Схема', 'Люди и поиск', 'Источники', 'Экспорт']) {
      await expect(
        page.getByRole('button', {name, exact: true}),
      ).toHaveAttribute('aria-disabled', 'true');
    }
    await moveMouseTo(
      page,
      page.getByRole('button', {name: 'Люди и поиск', exact: true}),
    );
    await expect(page.getByRole('tooltip')).toContainText(
      'Сначала откройте файл',
    );
    await page
      .getByRole('button', {name: 'Люди и поиск', exact: true})
      .click({force: true}); // aria-disabled: Playwright would wait forever
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Настройки'})).toBeEnabled();
  });

  test('shows a friendly message when the file is not GEDCOM', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('это не GEDCOM');
    await expect(alert).not.toContainText('Error');
    await alert.getByRole('button', {name: 'Закрыть'}).click();
    await expect(alert).toBeHidden();
    await expect(
      page.getByRole('heading', {level: 1, name: 'Gedview'}),
    ).toBeVisible();
  });

  test('"By link" dialog validates the address and closes with Esc', async ({
    page,
  }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', {name: 'По ссылке'});
    await trigger.click();
    const dialog = page.getByRole('dialog', {name: 'Открыть файл по ссылке'});
    await expect(dialog).toBeVisible();
    await expectNoAxeViolations(page);
    await dialog.getByLabel('Адрес файла').fill('not a url');
    await dialog.getByRole('button', {name: 'Открыть файл'}).click();
    await expect(
      dialog.getByText('Введите адрес, начинающийся с http'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('a link that cannot be fetched gives a friendly network message', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', {name: 'По ссылке'}).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Адрес файла').fill('https://example.org/tree.ged');
    await dialog.getByRole('button', {name: 'Открыть файл'}).click();
    await expect(dialog).toBeHidden();
    // With the temporary loader stub every load fails with NOT_GEDCOM; with
    // the real loader this is a NETWORK error. Either way: no raw exception.
    await expect(page.getByRole('alert')).toContainText(
      /GEDCOM|загрузить файл по ссылке/,
    );
  });

  test('dropping a file on the window starts loading it', async ({page}) => {
    await page.goto('/');
    const data = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['0 HEAD'], 'tree.ged', {type: 'text/plain'}));
      return dt;
    });
    await page.dispatchEvent('body', 'dragenter', {dataTransfer: data});
    await expect(page.getByText('Отпустите файл, чтобы открыть')).toBeVisible();
    await page.dispatchEvent('body', 'drop', {dataTransfer: data});
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Отпустите файл, чтобы открыть')).toBeHidden();
  });
});
