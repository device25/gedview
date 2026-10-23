import {expect, test} from '@playwright/test';
import {openDemo, trackExternal} from './helpers';

test.describe('demo tree', () => {
  test('shows the chart placeholder, the header and the card', async ({
    page,
  }) => {
    const external = trackExternal(page);
    await openDemo(page);
    await expect(
      page.getByRole('heading', {level: 1, name: 'Соколовы'}),
    ).toBeVisible();
    await expect(
      page.getByText('sokolovy.gdz · GEDCOM 7.0.18 · 10 человек'),
    ).toBeVisible();
    await expect(page.getByRole('tablist', {name: 'Вид схемы'})).toBeVisible();
    await expect(
      page.getByRole('tab', {name: 'Песочные часы'}),
    ).toHaveAttribute('aria-selected', 'true');

    const chart = page.getByRole('list', {name: 'Люди на схеме'});
    await expect(chart.getByRole('button')).toHaveCount(10);
    await expect(
      chart.getByRole('button', {
        name: /^Иван Петрович Соколов\s*6 апр 1889 ст\. ст\. — 1957/,
      }),
    ).toHaveAttribute('aria-current', 'true');

    const card = page.getByRole('complementary');
    await expect(card).toContainText('6 апреля 1889 ст. ст.');
    await expect(card.getByText('Крёстный:')).toBeVisible();
    await expect(
      card.getByRole('link', {name: 'Михаил Андреевич Белов'}).first(),
    ).toBeVisible();
    const disputed = card.getByRole('note').filter({hasText: 'спорная'});
    await expect(disputed).toContainText('Связь с родителями спорная');
    await expect(disputed).toContainText('исповедной ведомости 1890 года');
    await expect(card).toContainText('6 источников · 2 заметки · 2 медиа');
    await expect(page.getByRole('group', {name: 'Масштаб'})).toBeVisible();
    expect(external).toEqual([]);
  });

  test('selecting a person updates the card and the URL hash', async ({
    page,
  }) => {
    await openDemo(page);
    await page
      .getByRole('list', {name: 'Люди на схеме'})
      .getByRole('button', {name: /^Пётр Ильич Соколов/})
      .click();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Пётр Ильич Соколов'}),
    ).toBeVisible();
    await expect(page).toHaveURL(/#view=hourglass&id=I2$/);
    await expect(page.getByRole('complementary')).toContainText('1858 — 1921');
  });

  test('relative links select the person; the hash is restored on reload', async ({
    page,
  }) => {
    await openDemo(page);
    await page
      .getByRole('complementary')
      .getByRole('link', {name: 'Евдокия Семёновна Крылова'})
      .click();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Евдокия Семёновна Крылова'}),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Евдокия Семёновна Крылова'}),
    ).toBeVisible();
  });

  test('the hash contains no names', async ({page}) => {
    await openDemo(page);
    const hash = new URL(page.url()).hash;
    expect(hash).toBe('#view=hourglass&id=I1');
    expect(decodeURIComponent(page.url())).not.toContain('Соколов');
  });

  test('view tabs are a real tablist with arrow-key navigation', async ({
    page,
  }) => {
    await openDemo(page);
    await page.getByRole('tab', {name: 'Песочные часы'}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('tab', {name: 'Все родственники'}),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/view=relatives/);
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await page.getByRole('tab', {name: 'Веер'}).click();
    await expect(page).toHaveURL(/view=fancy/);
  });

  test('the card can be minimised, closed and shown again, and Esc closes it', async ({
    page,
  }) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    const minimise = card.getByRole('button', {name: 'Свернуть карточку'});
    await minimise.click();
    await expect(minimise).toHaveAttribute('aria-expanded', 'false');
    await expect(
      card.getByRole('link', {name: 'Евдокия Семёновна Крылова'}),
    ).toBeHidden();
    await minimise.click();
    await card.getByRole('button', {name: 'Закрыть карточку'}).click();
    const show = page.getByRole('button', {name: 'Показать карточку'});
    await expect(show).toBeFocused();
    await show.click();
    await expect(card).toBeVisible();
    // Esc with focus on the chart closes the card too.
    await page
      .getByRole('list', {name: 'Люди на схеме'})
      .getByRole('button')
      .nth(1)
      .focus();
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect(
      page.getByRole('button', {name: 'Показать карточку'}),
    ).toBeFocused();
  });

  test('the full card opens with names, events, sources and links', async ({
    page,
  }) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Все сведения'}).click();
    const dialog = page.getByRole('dialog', {name: 'Иван Петрович Соколов'});
    await expect(dialog).toBeVisible();
    for (const h of [
      'Имена',
      'События',
      'Семья',
      'Источники',
      'Заметки',
      'Медиа',
      'Внешние ссылки',
    ]) {
      await expect(
        dialog.getByRole('heading', {name: h, level: 3}),
      ).toBeVisible();
    }
    await expect(dialog.getByText('при рождении')).toBeVisible();
    await expect(dialog.getByText('Ivan Petrovich Sokolov')).toBeVisible();
    await expect(
      dialog.getByText('Надёжность 3 — прямое первичное свидетельство'),
    ).toBeVisible();
    await expect(
      dialog.getByText('Надёжность 1 — сомнительной надёжности').first(),
    ).toBeVisible();
    await expect(dialog.getByText('Развода не было')).toBeVisible();
    await expect(
      dialog.getByRole('link', {name: /FamilySearch/}),
    ).toHaveAttribute('rel', /noopener/);
    // Confidential events stay hidden until the reader asks.
    await expect(
      dialog.getByText('Служебные сведения', {exact: true}).first(),
    ).toBeVisible();
    await expect(
      dialog.getByText('2 скрыто: пометка «конфиденциально» и «приватно»'),
    ).toBeVisible();
    await expect(dialog.getByText('Не для публикации')).toBeHidden();
    await dialog.getByRole('button', {name: 'Показать', exact: true}).click();
    await expect(dialog.getByText('Не для публикации')).toBeVisible();
    // A citation link jumps to the source.
    await dialog.getByRole('link', {name: '[2]'}).first().click();
    await expect(dialog.locator('#src-2')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('button', {name: 'Все сведения'}),
    ).toBeFocused();
  });

  test('settings change the chart and persist across reloads', async ({
    page,
  }) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Настройки'}).click();
    const dialog = page.getByRole('dialog', {name: 'Настройки'});
    await dialog.getByText('Идентификаторы').click();
    await expect(
      dialog.getByRole('checkbox', {name: 'Идентификаторы'}),
    ).toBeChecked();
    await expect(
      page
        .getByRole('list', {name: 'Люди на схеме'})
        .getByText('I2', {exact: true}),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(
      page
        .getByRole('list', {name: 'Люди на схеме'})
        .getByText('I2', {exact: true}),
    ).toBeVisible();
  });
});
