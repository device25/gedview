import {expect, test, type Page} from '@playwright/test';
import {expectNoAxeViolations, openDemo, trackExternal} from './helpers';

async function openFull(page: Page, name = 'Иван Петрович Соколов') {
  await page.getByRole('button', {name: 'Все сведения'}).click();
  const dialog = page.getByRole('dialog', {name});
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('person card: GEDCOM 7.0 details', () => {
  test('events show age, value, SDATE order, NO list and cleaned places', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    await expect(dialog.getByText('Возраст: 7 лет')).toBeVisible();
    await expect(dialog.getByText('Возраст: меньше 40 лет')).toBeVisible();
    await expect(
      dialog.getByText('Возраст: 67 лет 11 месяцев 25 дней'),
    ).toBeVisible();
    await expect(dialog.getByText('рабочий льнозавода').first()).toBeVisible();
    // Empty jurisdictions are skipped, never ", ,".
    await expect(
      dialog.getByText('г. Калинин, Калининская область, СССР'),
    ).toBeVisible();
    await expect(dialog.getByText(', ,')).toHaveCount(0);
    // Ordered by SDATE: the residence (SDATE 1926) comes before occupation.
    const labels = await dialog
      .locator('.events--full .event__label')
      .allTextContents();
    expect(labels.indexOf('Проживание')).toBeLessThan(
      labels.indexOf('Занятие'),
    );
    // NO events form their own list with the period.
    const none = dialog.getByRole('list', {name: 'Не было'});
    await expect(none).toContainText('Развода не было · с 1912 по 1957');
  });

  test('associations: gendered roles, phrases, no-record associates, INDI-level section', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    await expect(dialog.getByText('Крёстный:')).toBeVisible();
    await expect(dialog.getByText('Крёстная:')).toBeVisible();
    await expect(dialog.getByText('Свидетель:').first()).toBeVisible();
    await expect(dialog.getByText('«священник Василий»')).toBeVisible();
    const links = dialog.getByRole('region', {name: 'Связи'});
    await expect(links.getByText('Друг:')).toBeVisible();
    await expect(
      links.getByRole('link', {name: 'Михаил Андреевич Белов'}),
    ).toBeVisible();
    await expect(links).toContainText(
      '«Фёдор Лавров, сосед по двору» (записи о человеке нет)',
    );
    // ROLE PHRASE of an OTHER role replaces the label.
    await expect(links).toContainText('свояченица: «Анна, соседка»');
  });

  test('family: pedigree, status and strikethrough for a disproven link', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    const family = dialog.getByRole('region', {name: 'Семья'});
    await expect(family).toContainText('Родители · кровные');
    await expect(family).toContainText(
      'Родители · усыновление «усыновлён отчимом»',
    );
    await expect(family).toContainText('Связь спорная.');
    await expect(family).toContainText('Связь опровергнута.');
    const disproven = family.getByRole('link', {
      name: 'Семён Фёдорович Крылов',
    });
    await expect(disproven).toHaveCSS('text-decoration-line', 'line-through');
    await expect(family.getByText('Жена')).toBeVisible();
    await expect(family.getByText('Дети', {exact: true})).toBeVisible();
  });

  test('sources: numbered once, quality badges, text, void source, notes', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    const sources = dialog.getByRole('region', {name: 'Источники'});
    await expect(sources.getByRole('listitem')).toHaveCount(7);
    await expect(sources).toContainText('Надёжность 0 — ненадёжное или оценка');
    await expect(sources).toContainText(
      'Надёжность 1 — сомнительной надёжности',
    );
    await expect(sources).toContainText(
      'Надёжность 2 — вторичное свидетельство',
    );
    await expect(sources).toContainText(
      'Надёжность 3 — прямое первичное свидетельство',
    );
    await expect(sources).toContainText('Дата в источнике: 1 июня 1934');
    // DATA.TEXT as html: formatted, sanitised, in a blockquote.
    await expect(sources.locator('blockquote b')).toHaveText('рабочим');
    await expect(sources).toContainText('Запись внесена со слов владельца.');
    // @VOID@ source: only a page.
    await expect(sources).toContainText('Выписка из архивного дела');
    await expect(sources).toContainText('д. 17, л. 4');
  });

  test('source references are real links, reachable and operable by keyboard', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    const hashBefore = new URL(page.url()).hash;
    const ref = dialog.getByRole('link', {name: '[4]'});
    await expect(ref).toHaveAttribute('href', '#src-4');
    await ref.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.locator('#src-4')).toBeFocused();
    // The chart state in the hash stays untouched.
    expect(new URL(page.url()).hash).toBe(hashBefore);
    // Every entry has a unique id.
    const ids = await dialog
      .locator('.source')
      .evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('HTML notes are sanitised: no script, no unsafe link, safe attributes', async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await openDemo(page);
    const dialog = await openFull(page);
    const notes = dialog.getByRole('region', {name: 'Заметки'});
    await expect(notes.locator('b')).toHaveText('рабочий льнозавода');
    await expect(notes.locator('i')).toHaveText('Соколов-Белов');
    await expect(notes).not.toContainText('alert');
    await expect(notes.locator('script')).toHaveCount(0);
    const ok = notes.getByRole('link', {name: 'История льнозавода'});
    await expect(ok).toHaveAttribute('target', '_blank');
    await expect(ok).toHaveAttribute('rel', 'noopener noreferrer');
    // The javascript: link lost its href and onclick; the text stays.
    await expect(notes.getByRole('link')).toHaveCount(1);
    await expect(notes).toContainText('Опасная ссылка');
    expect(await notes.locator('[onclick], [style]').count()).toBe(0);
    expect(dialogs).toEqual([]);
  });

  test('a note with a translation can be switched between versions', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    const notes = dialog.getByRole('region', {name: 'Заметки'});
    await expect(notes.getByText('Служил рядовым')).toBeVisible();
    await expect(notes.getByText('Оригинал (ru)')).toBeVisible();
    await notes.getByRole('button', {name: 'Показать перевод (en)'}).click();
    await expect(notes.getByText('Served as a private')).toBeVisible();
    await expect(notes.getByText('Служил рядовым')).toBeHidden();
    await expect(notes.getByText('Перевод (en)')).toBeVisible();
    await expect(notes.locator('[lang="en"]')).toBeVisible();
    await notes.getByRole('button', {name: 'Показать оригинал (ru)'}).click();
    await expect(notes.getByText('Служил рядовым')).toBeVisible();
  });

  test('restricted details are hidden and revealed for this card only', async ({
    page,
  }) => {
    await openDemo(page);
    const floating = page.getByRole('complementary');
    await expect(
      floating.getByText('2 скрыто: пометка «конфиденциально» и «приватно»'),
    ).toBeVisible();
    await expect(floating.getByText('Не для публикации')).toBeHidden();

    const dialog = await openFull(page);
    await expect(dialog.getByText('Личное дело (скан)')).toBeHidden();
    await expect(dialog.getByText('Не для публикации')).toBeHidden();
    await dialog.getByRole('button', {name: 'Показать', exact: true}).click();
    await expect(dialog.getByText('Не для публикации')).toBeVisible();
    await expect(dialog.getByText('Личное дело (скан)')).toBeVisible();
    await expect(dialog.getByText('скрыто: пометка')).toBeHidden();
    await page.keyboard.press('Escape');
    // Closing the card forgets the reveal.
    await expect(floating.getByText('Не для публикации')).toBeHidden();
    const again = await openFull(page);
    await expect(again.getByText('Не для публикации')).toBeHidden();
  });

  test('the floating card can reveal restricted events too', async ({page}) => {
    await openDemo(page);
    const floating = page.getByRole('complementary');
    await floating.getByRole('button', {name: 'Показать', exact: true}).click();
    await expect(floating.getByText('Не для публикации')).toBeVisible();
    // Another person: nothing stays revealed, and Ivan hides again.
    await floating
      .getByRole('link', {name: 'Евдокия Семёновна Крылова'})
      .click();
    await page
      .getByRole('complementary')
      .getByRole('link', {name: /Иван Петрович Соколов/})
      .first()
      .click();
    await expect(
      page.getByRole('complementary').getByText('Не для публикации'),
    ).toBeHidden();
  });

  test('turning "hide restricted" off shows everything without a notice', async ({
    page,
  }) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Настройки'}).click();
    await page
      .getByRole('dialog', {name: 'Настройки'})
      .getByText('Скрывать закрытые сведения')
      .click();
    await page.keyboard.press('Escape');
    const floating = page.getByRole('complementary');
    await expect(floating.getByText('Не для публикации')).toBeVisible();
    await expect(floating.getByText('скрыто: пометка')).toHaveCount(0);
  });

  test('links: https only, other types show the value and the type URI', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    const links = dialog.getByRole('region', {name: 'Внешние ссылки'});
    await expect(links.getByRole('link')).toHaveCount(1);
    await expect(
      links.getByRole('link', {name: /FamilySearch/}),
    ).toHaveAttribute('href', 'https://www.familysearch.org/');
    await expect(links).toContainText('A-1889/41');
    await expect(links).toContainText('тип https://example.org/archive-id');
    // A javascript: URL is never a link.
    await expect(links).toContainText('Bad link');
    await expect(links.locator('a[href^="javascript"]')).toHaveCount(0);
  });

  test('technical details: UID, LOCKED badge, extension tags with their URI', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    await dialog.getByText('Служебные сведения', {exact: true}).last().click();
    const service = dialog.locator('details.service');
    await expect(service).toContainText('0f4ae2b0-7c52-4c1d-9c7e-3b61d8a5c001');
    await expect(service.locator('.badge')).toHaveText('защищено от правок');
    await expect(service).toContainText('_RUFNAME');
    await expect(service).toContainText('https://example.org/ext/_RUFNAME');
    await expect(service).toContainText('_LOCAL');
    await expect(service).toContainText('не описано в HEAD.SCHMA');
  });

  test('no requests leave localhost while the card is used', async ({page}) => {
    const external = trackExternal(page);
    await openDemo(page);
    const dialog = await openFull(page);
    await dialog.getByRole('link', {name: '[2]'}).first().click();
    expect(external).toEqual([]);
  });

  test('axe: full card with revealed items and a switched note, light and dark', async ({
    page,
  }) => {
    await openDemo(page);
    const dialog = await openFull(page);
    await dialog.getByRole('button', {name: 'Показать', exact: true}).click();
    await dialog.getByRole('button', {name: 'Показать перевод (en)'}).click();
    await dialog.getByText('Служебные сведения', {exact: true}).last().click();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Сменить тему'}).click();
    await openFull(page);
    await expectNoAxeViolations(page);
  });
});

test.describe('person card in English', () => {
  test.use({locale: 'en-US'});

  test('shows names, notes and roles in the UI language', async ({page}) => {
    await page.goto('/?demo');
    await expect(
      page.getByRole('heading', {level: 2, name: 'Ivan Petrovich Sokolov'}),
    ).toBeVisible();
    await expect(
      page.getByRole('complementary').getByText('Godfather:'),
    ).toBeVisible();
    await page.getByRole('button', {name: 'All details'}).click();
    const dialog = page.getByRole('dialog', {name: 'Ivan Petrovich Sokolov'});
    // The Russian original stays available among the forms of the name.
    await expect(dialog.getByText('Иван Петрович Соколов')).toBeVisible();
    await expect(dialog.getByText('· Original', {exact: true})).toBeVisible();
    // The note with an English translation shows it first.
    await expect(dialog.getByText('Served as a private')).toBeVisible();
    await expect(dialog.getByText('Translation (en)')).toBeVisible();
    await dialog.getByRole('button', {name: 'Show original (ru)'}).click();
    await expect(dialog.getByText('Служил рядовым')).toBeVisible();
    await expect(
      dialog.getByText('Reliability 3 — direct primary evidence'),
    ).toBeVisible();
    await expect(dialog.getByText('Age: under 40 years')).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
