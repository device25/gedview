import AxeBuilder from '@axe-core/playwright';
import {expect, type Locator, type Page} from '@playwright/test';

/** Collects every request that leaves localhost (there must be none). */
export function trackExternal(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.protocol !== 'data:' &&
      url.protocol !== 'blob:'
    ) {
      external.push(req.url());
    }
  });
  return external;
}

/**
 * With `popover: true` the "region" rule is skipped: react-aria's Popover
 * adds visually hidden "Dismiss" buttons next to the dialog, which axe
 * reports as content outside landmarks. The dialog itself is still checked
 * by every other rule.
 */
export async function expectNoAxeViolations(
  page: Page,
  {popover = false}: {popover?: boolean} = {},
) {
  const builder = new AxeBuilder({page});
  if (popover) builder.disableRules(['region']);
  const results = await builder.analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map(
        (n) =>
          `${n.target.join(' ')} :: ${n.html.slice(0, 160)} :: ${n.any[0]?.message ?? ''}`,
      ),
    })),
  ).toEqual([]);
}

/** Opens the demo family and waits until the card shows its first person. */
export async function openDemo(page: Page, path = '/?demo') {
  await page.goto(path);
  await expect(
    page.getByRole('heading', {level: 2, name: 'Иван Петрович Соколов'}),
  ).toBeVisible();
}

/**
 * Hovers like a real mouse: react-aria shows tooltips only after it has seen
 * genuine pointer movement, which a single Playwright `hover()` right after
 * page load does not produce. Enter, leave and enter again.
 */
export async function moveMouseTo(page: Page, target: Locator) {
  await target.hover();
  const box = await target.boundingBox();
  if (!box) throw new Error('target is not visible');
  await page.mouse.move(box.x + box.width + 200, box.y + box.height + 200, {
    steps: 3,
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 6,
  });
}

/** The chart: an SVG group holding one button per person. */
export const chart = (page: Page) =>
  page.getByRole('group', {name: /Стрелки — переход между родственниками/});
