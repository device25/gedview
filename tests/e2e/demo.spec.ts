import {expect, test} from '@playwright/test';
import {chart, openDemo, trackExternal} from './helpers';

test.describe('demo tree', () => {
  test('shows the chart, the header and the card', async ({page}) => {
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

    // Ivan, his parents, his wife with her parents and their two children.
    await expect(chart(page).getByRole('button')).toHaveCount(8);
    await expect(
      chart(page).getByRole('button', {
        name: /^Иван Петрович Соколов, 1889—1957/,
      }),
    ).toHaveAttribute('aria-current', 'true');

    const card = page.getByRole('complementary');
    await expect(card).toContainText('6 (18) апреля 1889');
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
    await chart(page)
      .getByRole('button', {name: /^Пётр Ильич Соколов/})
      .click();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Пётр Ильич Соколов'}),
    ).toBeVisible();
    await expect(page).toHaveURL(/#view=hourglass&id=I2$/);
    await expect(page.getByRole('complementary')).toContainText('1858—1921');
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
    await expect(page.getByRole('tab', {name: 'Веер'})).toHaveCount(0);
  });

  test('the card can be minimised, closed and shown again, and Esc closes it', async ({
    page,
  }) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    const minimise = card.getByRole('button', {
      name: /^(Свернуть|Развернуть) карточку$/,
    });
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
    await chart(page).getByRole('button').nth(1).focus();
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
    await expect(chart(page).getByText('I2', {exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(chart(page).getByText('I2', {exact: true})).toBeVisible();
  });
});

test.describe('typography', () => {
  test('Julian dates are written as 6 (18) апреля 1889, with the legend explaining it', async ({
    page,
  }) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    // The card header and the chart box, with a non-breaking space between
    // the day and the month and a long dash around a full date.
    await expect(card.locator('.card__life')).toHaveText(
      '6 (18) апреля 1889 — 1957',
    );
    await expect(
      page
        .locator('.gv-person', {hasText: 'Иван Петрович Соколов'})
        .locator('.gv-life'),
    ).toHaveText('1889—1957');
    // A year range has the long dash and no spaces.
    await expect(
      page
        .locator('.gv-person', {hasText: 'Пётр Ильич Соколов'})
        .locator('.gv-life'),
    ).toHaveText('1858—1921');
    await expect(page.locator('.legend')).toContainText(
      '6 (18) апреля — дата по старому стилю, в скобках по новому',
    );
    // Months are never abbreviated anywhere on the screen.
    await expect(page.locator('body')).not.toContainText(/\bапр\b|ст\. ?ст\./);
  });

  test('the English UI uses full months, an en dash and the same notation', async ({
    page,
  }) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Язык интерфейса'}).click();
    await page
      .getByRole('dialog', {name: 'Язык'})
      .getByText('English', {exact: true})
      .click();
    await expect(
      page.getByRole('complementary').locator('.card__life'),
    ).toHaveText('6 (18) April 1889 – 1957');
    await expect(page.locator('.legend')).toContainText(
      '6 (18) April — Old Style date, New Style in brackets',
    );
  });

  test('the date style setting switches between both, source and new style', async ({
    page,
  }) => {
    await openDemo(page);
    const life = page.getByRole('complementary').locator('.card__life');
    await page.getByRole('button', {name: 'Настройки'}).click();
    const dialog = page.getByRole('dialog', {name: 'Настройки'});
    const select = dialog.getByRole('button', {name: /Даты до 1918 года/});
    await expect(select).toContainText('Оба стиля');
    await select.click();
    await page.getByRole('option', {name: 'Как в источнике'}).click();
    await expect(life).toHaveText('6 апреля 1889 — 1957');
    await select.click();
    await page.getByRole('option', {name: 'Новый стиль'}).click();
    await expect(life).toHaveText('18 апреля 1889 — 1957');
  });

  test('a counter keeps its number and noun together', async ({page}) => {
    await openDemo(page);
    await expect(
      page.getByText('sokolovy.gdz · GEDCOM 7.0.18 · 10 человек'),
    ).toBeVisible();
    const text = await page.locator('header').first().innerText();
    expect(text).toContain('10 человек');
  });
});

test.describe('hit areas (Fitts)', () => {
  test('a rail button spans the whole rail width, the pill stays 44px', async ({
    page,
  }) => {
    await openDemo(page);
    const buttons = page.locator('.rail__btn');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.x).toBe(0);
      expect(box?.width).toBe(72);
      const pill = await buttons.nth(i).locator('.rail__pill').boundingBox();
      expect(pill?.width).toBe(44);
      expect(pill?.height).toBe(44);
      expect(pill?.x).toBe(14);
    }
  });

  test('a click at the very left edge of a rail row opens the flyout', async ({
    page,
  }) => {
    await openDemo(page);
    const btn = page.getByRole('button', {name: 'Источники', exact: true});
    const box = await btn.boundingBox();
    if (!box) throw new Error('rail button is not visible');
    await page.mouse.click(4, box.y + box.height / 2);
    await expect(page.getByRole('dialog', {name: 'Источники'})).toBeVisible();
  });

  test('tooltips still show for a hover at the edge of a rail row', async ({
    page,
  }) => {
    await openDemo(page);
    const btn = page.getByRole('button', {name: 'Люди и поиск', exact: true});
    const box = await btn.boundingBox();
    if (!box) throw new Error('rail button is not visible');
    const y = box.y + box.height / 2;
    // Same warm-up as moveMouseTo, but entering at the screen edge.
    await page.mouse.move(box.x + 400, y + 200, {steps: 3});
    await page.mouse.move(2, y, {steps: 8});
    await expect(page.getByRole('tooltip')).toContainText('Люди и поиск');
  });

  test('"close" is set apart from "collapse" on the card', async ({page}) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    const minimise = await card
      .getByRole('button', {name: 'Свернуть карточку'})
      .boundingBox();
    const close = await card
      .getByRole('button', {name: 'Закрыть карточку'})
      .boundingBox();
    if (!minimise || !close) throw new Error('card buttons are not visible');
    expect(close.x - (minimise.x + minimise.width)).toBeGreaterThanOrEqual(12);
  });
});
