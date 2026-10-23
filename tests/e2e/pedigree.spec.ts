import {expect, test, type Page} from '@playwright/test';
import {chooseLevel} from './helpers';

/** Opens the synthetic pedigree: a root with four great-grandparent
 *  couples on the mother's side who have other children. */
async function openPedigree(page: Page) {
  await page.goto('/#id=I1');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles('tests/fixtures/synthetic/pedigree.ged');
  await expect(page.locator('svg.gv-svg[data-drawn]')).toBeAttached();
}

/** The chart's lines as segments, each with the family it starts from. */
function lineReport(page: Page) {
  return page.evaluate(() => {
    const segs: Array<{key: string; a: number[]; b: number[]}> = [];
    for (const p of document.querySelectorAll(
      'path.link:not(.additional-marriage)',
    )) {
      const v = (p.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(
        Number,
      );
      const pts: number[][] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i]!, v[i + 1]!]);
      if (pts.length < 2) continue;
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      const top = first[1]! < last[1]! ? first : last;
      const key = top.map(Math.round).join(' ');
      for (let i = 1; i < pts.length; i++)
        segs.push({key, a: pts[i - 1]!, b: pts[i]!});
    }
    const flat = segs.filter(
      (s) => s.a[1] === s.b[1] && Math.abs(s.a[0]! - s.b[0]!) > 1,
    );
    const upright = segs.filter(
      (s) => s.a[0] === s.b[0] && Math.abs(s.a[1]! - s.b[1]!) > 1,
    );
    let along = 0;
    for (const p of flat) {
      for (const q of flat) {
        if (p === q || p.key === q.key || Math.abs(p.a[1]! - q.a[1]!) > 1)
          continue;
        const lo = Math.max(
          Math.min(p.a[0]!, p.b[0]!),
          Math.min(q.a[0]!, q.b[0]!),
        );
        const hi = Math.min(
          Math.max(p.a[0]!, p.b[0]!),
          Math.max(q.a[0]!, q.b[0]!),
        );
        if (hi - lo > 4) along++;
      }
    }
    let crossings = 0;
    for (const h of flat) {
      for (const v of upright) {
        if (h.key === v.key) continue;
        const [x0, x1] = [
          Math.min(h.a[0]!, h.b[0]!),
          Math.max(h.a[0]!, h.b[0]!),
        ];
        const [y0, y1] = [
          Math.min(v.a[1]!, v.b[1]!),
          Math.max(v.a[1]!, v.b[1]!),
        ];
        const x = v.a[0]!;
        const y = h.a[1]!;
        if (x > x0 + 1 && x < x1 - 1 && y > y0 + 1 && y < y1 - 1) crossings++;
      }
    }
    return {along, crossings};
  });
}

test.describe('lines between generations', () => {
  test('the direct line is a pedigree: no line crosses another', async ({
    page,
  }) => {
    await openPedigree(page);
    const {along, crossings} = await lineReport(page);
    expect(along).toBe(0);
    expect(crossings).toBe(0);
  });

  test('lines of different families never run along each other', async ({
    page,
  }) => {
    await openPedigree(page);
    await chooseLevel(page, 'Братья и сёстры');
    await expect(
      page.locator('g.gv-person[data-id="I15"]').first(),
    ).toBeAttached();
    expect((await lineReport(page)).along).toBe(0);
  });
});
