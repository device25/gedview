import {expect, test} from '@playwright/test';
import {chart, expectNoAxeViolations} from './helpers';

test.describe('marriages on the chart', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/');
    await page
      .getByTestId('file-input')
      .setInputFiles('tests/fixtures/synthetic/marriages.ged');
    await expect(chart(page).getByRole('button').first()).toBeVisible();
    await page.evaluate(() => {
      location.hash = '#id=I3&root=I1&level=direct&up=1&down=2';
    });
    await expect(
      page.getByRole('heading', {level: 2, name: 'Николай Иванович Соколов'}),
    ).toBeVisible();
  });

  test('a family box under each couple: ⚭, year, place, words', async ({
    page,
  }) => {
    const box = (fam: string) =>
      chart(page).locator(`.gv-family[data-fam="${fam}"]`);
    await expect(box('F1')).toHaveText(/⚭ 1912\s*Старица/);
    await expect(box('F2')).toHaveText(/⚭ 1934, Калинин\s*развод 1937/);
    await expect(box('F3')).toHaveText(/⚭ 1938\s*Калинин/);
    await expect(box('F4')).toHaveText('Помолвка 1938');
    // Decorative: the card lists the same events.
    await expect(box('F2')).toHaveAttribute('aria-hidden', 'true');
  });

  test('a person with two marriages: two copies, both selected, joined under the cards', async ({
    page,
  }) => {
    const copies = chart(page).locator('g.gv-person[data-id="I3"]');
    await expect(copies).toHaveCount(2);
    await expect(copies.nth(0)).toHaveAccessibleName(
      'Николай Иванович Соколов, 1913—1942, Первый брак',
    );
    await expect(copies.nth(1)).toHaveAccessibleName(
      'Николай Иванович Соколов, 1913—1942, Второй брак',
    );
    for (const copy of await copies.all()) {
      await expect(copy).toHaveAttribute('aria-current', 'true');
    }
    const lane = chart(page).locator('path.link.additional-marriage');
    await expect(lane).toHaveCount(1);
    await expect(lane).toHaveCSS('stroke-dasharray', '2px, 5px');
    // The lane runs under the cards: the path goes down, across and up.
    await expect(lane).toHaveAttribute('d', /^M-?[\d.]+ -?[\d.]+V-?[\d.]+H/);
    await expectNoAxeViolations(page);
  });
});
