import {expect, test, type Page} from '@playwright/test';
import {generateGedcom} from '../../src/chart/test-tree';
import {chart, chooseLevel, expectNoAxeViolations, openDemo} from './helpers';

const person = (page: Page, name: RegExp | string) =>
  chart(page).getByRole('button', {name});

/** Scale and translation of the chart layer (the d3-zoom transform). */
async function transform(page: Page) {
  return page.locator('.gv-layer').evaluate((el) => {
    const t = el.getAttribute('transform') ?? '';
    const [x = 0, y = 0] = (/translate\(([^)]*)\)/.exec(t)?.[1] ?? '')
      .split(/[ ,]+/)
      .map(Number);
    return {x, y, k: Number(/scale\(([^)]*)\)/.exec(t)?.[1] ?? 1)};
  });
}

/** Distance of a person's box from the middle of the chart area. */
async function offCenter(page: Page, id: string) {
  return page.evaluate((personId) => {
    const card = document.querySelector(
      `g.gv-person[data-id="${personId}"] .gv-card`,
    );
    if (!card) return Infinity;
    const box = card.getBoundingClientRect();
    const area = document.querySelector('.gv-chart')!.getBoundingClientRect();
    return Math.hypot(
      box.x + box.width / 2 - (area.x + area.width / 2),
      box.y + box.height / 2 - (area.y + area.height / 2),
    );
  }, id);
}

test.describe('chart views', () => {
  test('draw boxes with names, life dates and links in every view', async ({
    page,
  }) => {
    await openDemo(page);
    const ivan = person(page, /^Иван Петрович Соколов/);
    // The name wraps under the portrait; the full dates do not fit, so the
    // box shows the years and keeps the dates in its description.
    await expect(ivan.locator('text.gv-name')).toHaveText([
      'Иван Петрович',
      'Соколов',
    ]);
    await expect(ivan.locator('text.gv-life')).toHaveText('1889—1957');
    await expect(ivan).toHaveAccessibleName(
      /^Иван Петрович Соколов, 1889—1957/,
    );
    await expect(ivan).toHaveAccessibleDescription(
      /6\u00a0\(18\)\u00a0апреля 1889\u00a0— 1957/,
    );
    await expect(chart(page).locator('path.link')).toHaveCount(3);

    // Counted from Александра, «все родственники» take in both sides.
    await page.evaluate(() => {
      location.hash = '#id=I6&level=all';
    });
    await expect(person(page, /^Александра.*Точка отсчёта/)).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(chart(page).getByRole('button')).toHaveCount(8);
    await expect(
      chart(page).getByRole('button', {name: /^Николай Иванович/}),
    ).toBeVisible();
  });

  test('clicking selects a person, updates the card and centres the box', async ({
    page,
  }) => {
    await openDemo(page);
    await person(page, /^Николай Иванович/).click();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Николай Иванович Соколов'}),
    ).toBeVisible();
    await expect(person(page, /^Николай Иванович/)).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(person(page, /^Иван Петрович/)).not.toHaveAttribute(
      'aria-current',
      'true',
    );
    // The chart re-roots on Nikolay and moves him to the middle.
    await expect.poll(() => offCenter(page, 'I5')).toBeLessThan(2);
    // The selection is announced.
    await expect(
      page.getByRole('status').filter({hasText: 'Выбран:'}),
    ).toHaveText('Выбран: Николай Иванович Соколов');
  });

  /** The chart's pan/zoom transform when the chart for the next selection
   *  has been drawn, and a second later. */
  async function transformAtDraw(page: Page, select: () => Promise<void>) {
    const atDraw = page.evaluate(
      () =>
        new Promise<string | null>((resolve) => {
          const svg = document.querySelector('svg.gv-svg')!;
          new MutationObserver(() =>
            resolve(
              document.querySelector('.gv-layer')!.getAttribute('transform'),
            ),
          ).observe(svg, {attributes: true, attributeFilter: ['data-drawn']});
        }),
    );
    await select();
    const first = await atDraw;
    await expect.poll(() => offCenter(page, 'I5')).toBeLessThan(2);
    const last = await page.locator('.gv-layer').getAttribute('transform');
    return {first, last};
  }

  test('without animation the chart is in place as soon as it is drawn', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openDemo(page);
    await expect.poll(() => offCenter(page, 'I1')).toBeLessThan(2);
    const {first, last} = await transformAtDraw(page, () =>
      person(page, /^Николай Иванович/).click(),
    );
    expect(first).toBe(last);
  });

  test('with animation the chart glides to the new person', async ({page}) => {
    await openDemo(page);
    await expect.poll(() => offCenter(page, 'I1')).toBeLessThan(2);
    const {first, last} = await transformAtDraw(page, () =>
      person(page, /^Николай Иванович/).click(),
    );
    expect(first).not.toBe(last);
  });

  test('the selected person is the one tab stop', async ({page}) => {
    await openDemo(page);
    await expect(chart(page).locator('g.gv-person[tabindex="0"]')).toHaveCount(
      1,
    );
    await expect(
      chart(page).locator('g.gv-person[tabindex="0"]'),
    ).toHaveAttribute('data-id', 'I1');
  });
});

test.describe('disputed and disproven links', () => {
  test('a CHALLENGED link is dashed, labelled, and its phrase shows on hover', async ({
    page,
  }) => {
    await openDemo(page);
    const dashed = chart(page).locator('path.link[data-look="dashed"]');
    await expect(dashed).toHaveCount(1);
    await expect(dashed).toHaveCSS('stroke-dasharray', '6px, 4px');
    await expect(dashed).toHaveCSS('stroke-width', '2px');
    // The other links are plain.
    const solid = chart(page).locator('path.link[data-look="solid"]');
    await expect(solid).toHaveCount(2);
    for (const el of await solid.all()) {
      await expect(el).toHaveCSS('stroke-dasharray', 'none');
      await expect(el).toHaveCSS('stroke-width', '1.5px');
    }

    const pill = chart(page).locator('.gv-pill');
    await expect(pill).toHaveCount(1);
    await expect(pill).toHaveText('спорная');
    await pill.hover();
    const tip = page.locator('.gv-tip');
    await expect(tip).toContainText('Запись о рождении не найдена');
    await page.mouse.move(5, 5);
    await expect(tip).toBeHidden();
  });

  test('the box name and description carry the dispute', async ({page}) => {
    await openDemo(page);
    const ivan = person(page, /^Иван Петрович Соколов/);
    await expect(ivan).toHaveAccessibleName(
      'Иван Петрович Соколов, 1889—1957, Точка отсчёта, Связь с родителями спорная',
    );
    // The full dates that do not fit on the box and the dispute's phrase.
    await expect(ivan).toHaveAccessibleDescription(
      /^6\u00a0\(18\)\u00a0апреля 1889\u00a0— 1957\. Запись о рождении не найдена/,
    );
  });

  test('settings can turn the dashes and the labels off', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Настройки'}).click();
    await page.getByText('Спорные связи пунктиром').click();
    await page.keyboard.press('Escape');
    await expect(
      chart(page).locator('path.link[data-look="dashed"]'),
    ).toHaveCount(0);
    await expect(chart(page).locator('.gv-pill')).toHaveCount(0);
  });

  test('a DISPROVEN link is dotted when the setting says so, absent otherwise', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByTestId('file-input')
      .setInputFiles('tests/fixtures/synthetic/sokolovy.ged');
    await expect(chart(page)).toBeVisible();
    await page.evaluate(() => {
      location.hash = '#view=relatives&id=I3';
    });
    await expect(
      page.getByRole('heading', {level: 2, name: 'Иван Петрович Соколов'}),
    ).toBeVisible();
    // Hidden by default: Sergey Belov (disproven son of F2) is not drawn.
    await expect(chart(page).locator('g[data-id="I12"]')).toHaveCount(0);
    await expect(
      chart(page).locator('path.link[data-look="dotted"]'),
    ).toHaveCount(0);

    await page.getByRole('button', {name: 'Настройки'}).click();
    const dialog = page.getByRole('dialog', {name: 'Настройки'});
    await dialog.getByRole('button', {name: /Опровергнутые связи/}).click();
    await page.getByRole('option', {name: 'Точками'}).click();
    await page.keyboard.press('Escape');

    await expect(
      chart(page).locator('g[data-id="I12"]').first(),
    ).toBeAttached();
    const dotted = chart(page).locator('path.link[data-look="dotted"]');
    await expect(dotted).toHaveCount(1);
    await expect(dotted).toHaveCSS('stroke-dasharray', '1px, 6px');
    await expect(dotted).toHaveCSS('stroke-linecap', 'round');
    await expect(
      chart(page).locator('g[data-id="I12"]').first(),
    ).toHaveAccessibleName(
      /Link to parents is disproven|Связь с родителями опровергнута/,
    );
  });
});

test.describe('keyboard', () => {
  test('arrows move between relatives, Enter selects, focus stays', async ({
    page,
  }) => {
    await openDemo(page);
    await person(page, /^Иван Петрович/).focus();
    await page.keyboard.press('ArrowUp');
    await expect(person(page, /^Пётр Ильич/)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(person(page, /^Мария Фёдоровна/)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(person(page, /^Пётр Ильич/)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(person(page, /^Иван Петрович/)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(person(page, /^Евдокия/)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(person(page, /^Николай/)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(person(page, /^Александра/)).toBeFocused();
    // Nothing further to the right or below.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(person(page, /^Александра/)).toBeFocused();

    // Exactly one box is in the tab order, and it follows the focus.
    await expect(chart(page).locator('g.gv-person[tabindex="0"]')).toHaveCount(
      1,
    );
    await expect(person(page, /^Александра/)).toHaveAttribute('tabindex', '0');

    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Александра Ивановна Соколова',
      }),
    ).toBeVisible();
    await expect(person(page, /^Александра/)).toBeFocused();
    await expect(person(page, /^Александра/)).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(chart(page).locator('g.gv-person:focus-visible')).toHaveCount(
      1,
    );
    // Space selects too.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: /Иван Петрович Соколов|Евдокия/,
      }),
    ).toBeVisible();
  });

  test('focus shows a ring and, for a disputed link, its phrase', async ({
    page,
  }) => {
    await openDemo(page);
    await person(page, /^Николай/).focus();
    await page.keyboard.press('ArrowUp');
    const ivan = person(page, /^Иван Петрович/);
    await expect(ivan).toBeFocused();
    await expect(ivan.locator('.gv-focus')).toBeVisible();
    await expect(page.locator('.gv-tip')).toContainText(
      'Запись о рождении не найдена',
    );
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.gv-tip')).toBeHidden();
  });

  test('moving focus off screen pans the chart', async ({page}) => {
    await openDemo(page);
    // Zoom in so that the neighbours are out of view.
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', {name: 'Приблизить'}).click();
    }
    await person(page, /^Иван Петрович/).focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    const pyotr = chart(page).locator('g[data-id="I2"] .gv-card');
    await expect
      .poll(async () => {
        const b = await pyotr.boundingBox();
        const a = await page.locator('.gv-chart').boundingBox();
        return (
          !!b &&
          !!a &&
          b.x >= a.x &&
          b.x + b.width <= a.x + a.width &&
          b.y >= a.y &&
          b.y + b.height <= a.y + a.height
        );
      })
      .toBe(true);
  });
});

test.describe('zoom and pan', () => {
  const percent = (page: Page) =>
    page.getByRole('group', {name: 'Масштаб'}).getByRole('button').nth(1);

  test('the buttons zoom, the label follows, fit fits', async ({page}) => {
    await openDemo(page);
    expect((await transform(page)).k).toBe(1);
    await page.getByRole('button', {name: 'Приблизить'}).click();
    await expect
      .poll(async () => (await transform(page)).k)
      .toBeCloseTo(1.25, 2);
    await expect(percent(page)).toContainText('125%');
    await page.getByRole('button', {name: 'Отдалить'}).click();
    await page.getByRole('button', {name: 'Отдалить'}).click();
    await expect
      .poll(async () => (await transform(page)).k)
      .toBeCloseTo(0.8, 2);
    await expect(percent(page)).toContainText('80%');

    // Zoom in a lot, then fit: the whole chart is inside the area again.
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', {name: 'Приблизить'}).click();
    }
    await percent(page).click();
    await expect
      .poll(async () => {
        const k = (await transform(page)).k;
        return k > 0.3 && k <= 1;
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const inner = await page.locator('.gv-inner').boundingBox();
        const area = await page.locator('.gv-chart').boundingBox();
        const cards = await chart(page)
          .locator('.gv-card')
          .evaluateAll((els) => {
            const rects = els.map((e) => e.getBoundingClientRect());
            return {
              l: Math.min(...rects.map((r) => r.left)),
              r: Math.max(...rects.map((r) => r.right)),
              t: Math.min(...rects.map((r) => r.top)),
              b: Math.max(...rects.map((r) => r.bottom)),
            };
          });
        return (
          !!inner &&
          !!area &&
          cards.l >= area.x &&
          cards.r <= area.x + area.width &&
          cards.t >= area.y &&
          cards.b <= area.y + area.height
        );
      })
      .toBe(true);
    await expect(percent(page)).not.toContainText('100%');
  });

  test('the wheel zooms and the zoom label follows', async ({page}) => {
    await openDemo(page);
    const area = (await page.locator('.gv-chart').boundingBox())!;
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.wheel(0, -400);
    await expect
      .poll(async () => (await transform(page)).k)
      .toBeGreaterThan(1.2);
    const k = (await transform(page)).k;
    await expect(percent(page)).toContainText(`${Math.round(k * 100)}%`);
    await page.mouse.wheel(0, 800);
    await expect.poll(async () => (await transform(page)).k).toBeLessThan(k);
  });

  test('fast wheel scrolling is never pulled back', async ({page}) => {
    await openDemo(page);
    // A real fast scroll: a wheel event every 8 ms for half a second, with
    // the scale recorded on every animation frame.
    const scales = await page.evaluate(async () => {
      const svg = document.querySelector('svg.gv-svg')!;
      const layer = document.querySelector('.gv-layer')!;
      const r = svg.getBoundingClientRect();
      const seen: number[] = [];
      let running = true;
      const tick = () => {
        const m = /scale\(([^)]*)\)/.exec(
          layer.getAttribute('transform') ?? '',
        );
        seen.push(Number(m?.[1] ?? 1));
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let i = 0; i < 60; i++) {
        svg.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -40,
            clientX: r.x + r.width / 3,
            clientY: r.y + r.height / 2,
            bubbles: true,
            cancelable: true,
          }),
        );
        await new Promise((done) => setTimeout(done, 8));
      }
      await new Promise((done) => setTimeout(done, 500));
      running = false;
      return seen;
    });
    // Zooming in only: no frame may go back to a smaller scale.
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]!, `frame ${i}`).toBeGreaterThanOrEqual(
        scales[i - 1]! - 1e-6,
      );
    }
    const k = (await transform(page)).k;
    expect(k).toBeGreaterThan(1.5);
    // The label catches up once the wheel stops.
    await expect(percent(page)).toContainText(`${Math.round(k * 100)}%`);
  });

  test('a zoom button right after the wheel zooms from where the view is', async ({
    page,
  }) => {
    await openDemo(page);
    const area = (await page.locator('.gv-chart').boundingBox())!;
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.wheel(0, -400);
    await page.getByRole('button', {name: 'Приблизить'}).click();
    await page.waitForTimeout(600);
    const k = (await transform(page)).k;
    expect(k).toBeGreaterThan(1.4);
    await expect(percent(page)).toContainText(`${Math.round(k * 100)}%`);
  });

  test('dragging pans without selecting', async ({page}) => {
    await openDemo(page);
    const before = await transform(page);
    const area = (await page.locator('.gv-chart').boundingBox())!;
    const x = area.x + 60;
    const y = area.y + area.height - 80;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y - 40, {steps: 5});
    await page.mouse.up();
    const after = await transform(page);
    expect(after.x - before.x).toBeCloseTo(80, 0);
    expect(after.y - before.y).toBeCloseTo(-40, 0);
    expect(after.k).toBe(before.k);

    // Dragging a box does not select it either.
    const nikolay = chart(page).locator('g[data-id="I5"] .gv-card');
    const b = (await nikolay.boundingBox())!;
    await page.mouse.move(b.x + 20, b.y + 20);
    await page.mouse.down();
    await page.mouse.move(b.x + 60, b.y + 50, {steps: 5});
    await page.mouse.up();
    await expect(
      page.getByRole('heading', {level: 2, name: 'Иван Петрович Соколов'}),
    ).toBeVisible();
  });

  test('keeps working after a view change and a resize', async ({page}) => {
    await openDemo(page);
    await chooseLevel(page, 'Братья и сёстры');
    await expect(chart(page).getByRole('button')).toHaveCount(6);
    await page.setViewportSize({width: 900, height: 700});
    await page.getByRole('button', {name: 'Приблизить'}).click();
    await expect
      .poll(async () => (await transform(page)).k)
      .toBeCloseTo(1.25, 2);
  });
});

test.describe('accessibility of the chart', () => {
  for (const [level, name] of [
    ['Прямая линия', 'direct'],
    ['Все родственники', 'all'],
  ] as const) {
    test(`axe is clean on the ${name} level, light and dark`, async ({
      page,
    }) => {
      await page.emulateMedia({colorScheme: 'light'});
      await openDemo(page);
      if (name !== 'direct') await chooseLevel(page, level);
      await expect(chart(page).getByRole('button').first()).toBeVisible();
      await expectNoAxeViolations(page);
      await page.emulateMedia({colorScheme: 'dark'});
      await expectNoAxeViolations(page);
    });
  }

  test('axe is clean while a tip is shown', async ({page}) => {
    await openDemo(page);
    await page.locator('.gv-pill').hover();
    await expect(page.locator('.gv-tip')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the chart is a labelled group of buttons', async ({page}) => {
    await openDemo(page);
    await expect(chart(page)).toHaveAttribute('role', 'group');
    await expect(chart(page)).toHaveAccessibleName(
      'Прямая линия. Стрелки — переход между родственниками, Enter — выбрать.',
    );
  });
});

test.describe('real and large trees', () => {
  test('maximal70.ged draws in every view', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page
      .getByTestId('file-input')
      .setInputFiles('tests/fixtures/gedcom70/maximal70.ged');
    await expect(chart(page).getByRole('button').first()).toBeVisible();
    for (const level of ['Все родственники', 'Прямая линия']) {
      await chooseLevel(page, level);
      await expect(chart(page).getByRole('button').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('a 2000-person tree draws all relatives', async ({page}) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({
      name: 'big.ged',
      mimeType: 'text/plain',
      buffer: Buffer.from(generateGedcom(2000)),
    });
    await expect(chart(page).getByRole('button').first()).toBeVisible();
    const started = Date.now();
    await page.evaluate(() => {
      location.hash = '#id=I3&level=all';
    });
    await expect(chart(page).getByRole('button').nth(1500)).toBeAttached();
    expect(Date.now() - started).toBeLessThan(15_000);

    // Fit shrinks the wide chart as far as the zoom allows.
    await page.getByRole('button', {name: /вписать в экран/}).click();
    await expect.poll(async () => (await transform(page)).k).toBeLessThan(0.1);
  });
});

test.describe('chart on a phone', () => {
  test.use({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });

  test('a tap selects a person and a tap on the label shows the phrase', async ({
    page,
  }) => {
    await openDemo(page);
    // Evdokia, Ivan's wife, is partly off screen: tap the part that shows.
    await person(page, /^Евдокия/).tap({position: {x: 12, y: 30}});
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Евдокия Семёновна Крылова',
      }),
    ).toBeVisible();
    await expect.poll(() => offCenter(page, 'I4')).toBeLessThan(2);
    // Selecting does not re-root: the chart still holds Ivan with his label.
    await expect(chart(page).locator('.gv-pill')).toHaveCount(1);
    await chart(page).locator('.gv-pill').dispatchEvent('click');
    await expect(page.locator('.gv-tip')).toContainText(
      'Запись о рождении не найдена',
    );
  });
});
