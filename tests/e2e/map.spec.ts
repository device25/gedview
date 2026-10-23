import {expect, test, type Page} from '@playwright/test';
import {expectNoAxeViolations, openDemo, trackExternal} from './helpers';

const svg = (page: Page) => page.locator('svg.gv-map-svg');
const markers = (page: Page) => svg(page).getByRole('button');

/** Opens the demo straight on «Карта». */
async function openMap(page: Page, view = '') {
  await page.goto(`/?demo#mode=map${view ? `&map=${view}` : ''}&id=I1`);
  await expect(svg(page)).toBeVisible();
  // The base map is bundled and drawn once it has loaded.
  await expect(page.locator('path.gv-map-land')).toHaveCount(1);
}

test.describe('map', () => {
  test('the rail opens «Карта»; the URL keeps it', async ({page}) => {
    await openDemo(page);
    await page.getByRole('button', {name: 'Карта'}).click();
    await expect(page.getByRole('tab', {name: 'Места'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', {name: 'Карта'})).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page).toHaveURL(/mode=map/);
    await page.getByRole('tab', {name: 'Путь человека'}).click();
    await expect(page).toHaveURL(/map=path/);
    await page.reload();
    await expect(
      page.getByRole('tab', {name: 'Путь человека'}),
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('places: one marker per point, event filters, nothing from outside', async ({
    page,
  }) => {
    const external = trackExternal(page);
    await openMap(page);
    await expect(
      page.getByText('На карте 4 места из 5, без координат 1'),
    ).toBeVisible();
    // Three spellings of Покровское share coordinates: one marker.
    await expect(markers(page)).toHaveCount(2);
    await expect(
      markers(page).filter({hasText: ''}).first(),
    ).toHaveAccessibleName(/с\. Покровское.*: \d+ событ/);
    await page.getByRole('button', {name: 'Смерти'}).click();
    await expect(page.getByRole('button', {name: 'Смерти'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // Калинин has only the death.
    await expect(markers(page)).toHaveCount(1);
    expect(external).toEqual([]);
  });

  test('the list shows places without coordinates', async ({page}) => {
    await openMap(page);
    const side = page.getByRole('complementary');
    await expect(
      side.getByRole('button', {
        name: /г\. Калинин, Калининская область, СССР/,
      }),
    ).toBeVisible();
    await side.locator('.map-seg__item', {hasText: 'Без координат'}).click();
    await expect(
      side.getByRole('radio', {name: 'Без координат, 1'}),
    ).toBeChecked();
    await expect(side.getByText('д. Горки')).toBeVisible();
    await expect(side.getByText('Нет координат')).toBeVisible();
  });

  test('markers: arrow keys move between them, Enter picks one', async ({
    page,
  }) => {
    await openMap(page);
    const first = markers(page).first();
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(markers(page).nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(markers(page).nth(1)).toHaveAttribute('aria-current', 'true');
  });

  test("a person's path: steps in date order, one marker per point", async ({
    page,
  }) => {
    await openMap(page, 'path');
    const side = page.getByRole('complementary');
    await expect(
      side.getByRole('heading', {name: 'Иван Петрович Соколов'}),
    ).toBeVisible();
    await expect(side.getByRole('listitem')).toHaveCount(6);
    await expect(side.getByRole('listitem').nth(4)).toContainText('д. Горки');
    await expect(side.getByRole('listitem').nth(4)).toContainText(
      'Нет координат',
    );
    await expect(markers(page)).toHaveCount(2);
    await expect(markers(page).filter({hasText: '1—4'})).toHaveCount(1);
    await expect(markers(page).filter({hasText: '6'})).toHaveAccessibleName(
      /^6\. .*1957, г\. Калинин/,
    );
    // The dashed segment stands for the step without coordinates.
    await expect(
      svg(page).locator('path.gv-map-flow[stroke-dasharray]'),
    ).toHaveCount(1);
  });

  test('how the family spread: from the root', async ({page}) => {
    await openMap(page, 'spread');
    const side = page.getByRole('complementary');
    await expect(
      side.getByRole('heading', {name: 'Потомки: Иван Петрович Соколов'}),
    ).toBeVisible();
    await expect(side.getByRole('row')).toHaveCount(2);
  });

  test('a file without coordinates says so and lists its places', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByTestId('file-input')
      .setInputFiles('tests/fixtures/synthetic/marriages.ged');
    await page.getByRole('button', {name: 'Карта'}).click();
    await expect(
      page.getByRole('heading', {name: 'У мест в этом файле нет координат'}),
    ).toBeVisible();
    await expect(page.getByText('Калинин', {exact: true})).toBeVisible();
    await expect(svg(page)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('accessibility, light and dark', async ({page}) => {
    for (const view of ['', 'path', 'spread']) {
      await page.emulateMedia({colorScheme: 'light'});
      await openMap(page, view);
      await expectNoAxeViolations(page);
      await page.emulateMedia({colorScheme: 'dark'});
      await expectNoAxeViolations(page);
    }
  });
});
