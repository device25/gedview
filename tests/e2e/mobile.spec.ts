import {expect, test, type Page} from '@playwright/test';
import {openDemo} from './helpers';

/** The chart ends where the card begins, and the selected person's box is
 *  inside what is left of it, once the chart has stopped moving. */
async function expectChartAbove(page: Page, cardTop: number) {
  const svg = page.locator('svg.gv-svg');
  await expect
    .poll(
      async () =>
        (await svg.boundingBox())!.y + (await svg.boundingBox())!.height,
    )
    .toBeLessThanOrEqual(cardTop + 1);
  const chart = (await svg.boundingBox())!;
  const selected = page.locator('g.gv-person[aria-current="true"]').first();
  await expect
    .poll(async () => {
      const b = (await selected.boundingBox())!;
      return b.y >= chart.y - 1 && b.y + b.height <= chart.y + chart.height + 1;
    })
    .toBe(true);
}

test.use({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});

test.describe('phone layout', () => {
  test('uses a bottom navigation instead of the rail and a bottom-sheet card', async ({
    page,
  }) => {
    await openDemo(page);
    const nav = page.getByRole('navigation', {name: 'Основное меню'});
    const box = await nav.boundingBox();
    expect(box?.y).toBeGreaterThan(700);
    expect(box?.width).toBeGreaterThanOrEqual(389);

    const card = page.getByRole('complementary');
    const cardBox = await card.boundingBox();
    expect(cardBox?.width).toBeGreaterThanOrEqual(389);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(box!.y + 1);
  });

  test('touch targets are at least 44 px', async ({page}) => {
    await openDemo(page);
    const selectors = [
      page.getByRole('navigation').getByRole('button'),
      page.getByRole('button', {name: 'Поиск', exact: true}),
      page.getByRole('tab'),
      page.getByRole('complementary').getByRole('button'),
    ];
    for (const loc of selectors) {
      for (const el of await loc.all()) {
        if (!(await el.isVisible())) continue;
        const b = await el.boundingBox();
        const name =
          (await el.textContent()) || (await el.getAttribute('aria-label'));
        expect(b!.height, `${name} height`).toBeGreaterThanOrEqual(43.5);
        expect(b!.width, `${name} width`).toBeGreaterThanOrEqual(43.5);
      }
    }
  });

  test('flyouts are full-width sheets and close with Esc', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Люди', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Люди и поиск'});
    await expect(dialog).toBeVisible();
    const box = await page.locator('.sheet').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(389);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the card opens lowered and leaves the chart the screen', async ({
    page,
  }) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    await expect(
      card.getByRole('heading', {name: /Иван Петрович/}),
    ).toBeVisible();
    await expect(
      card.getByRole('link', {name: 'Евдокия Семёновна Крылова'}),
    ).toBeHidden();
    const cardBox = (await card.boundingBox())!;
    expect(cardBox.height).toBeLessThan(160);
    await expectChartAbove(page, cardBox.y);
  });

  test('the handle raises and lowers the card; the chart keeps the person in view', async ({
    page,
  }) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    const handle = card.getByRole('button', {name: 'Развернуть карточку'});
    await handle.click();
    await expect(
      card.getByRole('link', {name: 'Евдокия Семёновна Крылова'}),
    ).toBeVisible();
    await expect(
      card.getByRole('button', {name: 'Свернуть карточку'}),
    ).toHaveAttribute('aria-expanded', 'true');
    await expectChartAbove(page, (await card.boundingBox())!.y);
    await card.getByRole('button', {name: 'Свернуть карточку'}).click();
    await expect(
      card.getByRole('link', {name: 'Евдокия Семёновна Крылова'}),
    ).toBeHidden();
  });

  test('a swipe on the card raises and lowers it; a tap on the chart lowers it', async ({
    page,
  }) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    const relative = card.getByRole('link', {
      name: 'Евдокия Семёновна Крылова',
    });
    const swipe = async (dy: number) => {
      // Start where the card's top is once it has stopped moving.
      const head = card.locator('.card__head');
      let b = (await head.boundingBox())!;
      await expect
        .poll(async () => {
          const now = (await head.boundingBox())!;
          const still = now.y === b.y;
          b = now;
          return still;
        })
        .toBe(true);
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + dy, {steps: 4});
      await page.mouse.up();
    };
    await swipe(-80);
    await expect(relative).toBeVisible();
    await swipe(80);
    await expect(relative).toBeHidden();

    // A tap on the name raises it; a tap on the chart's empty space lowers it.
    await card.getByRole('heading', {name: /Иван Петрович/}).click();
    await expect(relative).toBeVisible();
    // A point on the chart with nothing drawn on it.
    const empty = await page.evaluate(() => {
      const svg = document.querySelector('svg.gv-svg')!.getBoundingClientRect();
      for (let y = svg.top + 8; y < svg.bottom; y += 12) {
        for (let x = svg.left + 8; x < svg.right; x += 12) {
          const el = document.elementFromPoint(x, y);
          if (el?.closest('svg.gv-svg') && !el.closest('g, path'))
            return {x, y};
        }
      }
      return null;
    });
    expect(empty).not.toBeNull();
    await page.mouse.click(empty!.x, empty!.y);
    await expect(relative).toBeHidden();
  });

  test('choosing another person lowers the card and centres them', async ({
    page,
  }) => {
    await openDemo(page);
    const card = page.getByRole('complementary');
    await card.getByRole('button', {name: 'Развернуть карточку'}).click();
    await card.getByRole('link', {name: 'Евдокия Семёновна Крылова'}).click();
    await expect(card.getByRole('heading', {name: /Евдокия/})).toBeVisible();
    await expect(
      card.getByRole('button', {name: 'Развернуть карточку'}),
    ).toHaveAttribute('aria-expanded', 'false');
    await expectChartAbove(page, (await card.boundingBox())!.y);
  });

  test('settings sheet holds language, file and theme controls', async ({
    page,
  }) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Настройки'}).click();
    const dialog = page.getByRole('dialog', {name: 'Настройки'});
    await expect(dialog.getByRole('radio', {name: 'English'})).toBeAttached();
    await expect(
      dialog.getByRole('button', {name: 'Открыть файл'}),
    ).toBeVisible();
    await expect(dialog.getByRole('button', {name: 'По ссылке'})).toBeVisible();
  });
});
