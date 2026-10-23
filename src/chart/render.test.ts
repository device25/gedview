// @vitest-environment jsdom
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {mockTree} from '../ui/mock/mockTree';
import {doc7, SETTINGS, treeOf} from '../model/test-utils';
import {getIntl} from '../i18n';
import {personLook} from './renderer';
import type {ChartView} from '../gedcom/types';
import {drawChart} from './test-draw';
import {generateTree} from './test-tree';

const FIXTURES = join(import.meta.dirname, '../../tests/fixtures');
const sokolovy = treeOf(
  readFileSync(join(FIXTURES, 'synthetic/sokolovy.ged'), 'utf8'),
);
const maximal = treeOf(
  readFileSync(join(FIXTURES, 'gedcom70/maximal70.ged'), 'utf8'),
);

const looks = (d: ReturnType<typeof drawChart>) =>
  new Map(
    d.links
      .filter((l) => l.link)
      .map((l) => [`${l.link!.famId}|${l.link!.childId}`, l.look]),
  );

describe('person boxes', () => {
  it('draws a box per person with name, life dates and sex', () => {
    const d = drawChart(mockTree, 'hourglass', 'I1');
    const ivan = d.svg.querySelector('g.gv-person[data-id="I1"]')!;
    expect(ivan.getAttribute('role')).toBe('button');
    expect(ivan.getAttribute('aria-current')).toBe('true');
    expect(ivan.getAttribute('aria-label')).toMatch(
      /^Иван Петрович Соколов, 6 апр 1889 ст\. ст\. — 1957$/,
    );
    expect(ivan.querySelector('.gv-dot.gv-M')).not.toBeNull();
    const ids = [...d.svg.querySelectorAll('g.gv-person')].map((g) =>
      g.getAttribute('data-id'),
    );
    // Ivan, his parents, his wife with her parents, two children.
    expect(ids.sort()).toEqual(
      ['I1', 'I10', 'I2', 'I3', 'I4', 'I5', 'I6', 'I9'].sort(),
    );
  });

  it('shows ids and drops sex colours when asked', () => {
    const d = drawChart(mockTree, 'hourglass', 'I1', {
      showIds: true,
      sexColors: false,
    });
    expect(d.svg.querySelector('g[data-id="I1"] .gv-id')?.textContent).toBe(
      'I1',
    );
    expect(d.svg.querySelector('.gv-dot.gv-M')).toBeNull();
  });
});

describe('child links by data, not by order', () => {
  const views: Array<[ChartView, string]> = [
    ['hourglass', 'I1'],
    ['relatives', 'I1'],
    ['relatives', 'I5'],
    // The fan chart only shows descendants: start above the child.
    ['fancy', 'I2'],
  ];
  for (const [view, start] of views) {
    it(`${view} from ${start}: the disputed link is F1|I1 and nothing else`, () => {
      const d = drawChart(mockTree, view, start);
      const found = looks(d);
      expect(found.get('F1|I1')).toBe('dashed');
      expect([...found].filter(([, look]) => look !== 'solid')).toEqual([
        ['F1|I1', 'dashed'],
      ]);
      const dashed = d.links.filter((l) => l.look === 'dashed');
      expect(dashed).toHaveLength(1);
      expect(dashed[0]!.el.getAttribute('class')).toMatch(/link|branch/);
    });
  }

  it('does not dash the link when the setting is off', () => {
    const d = drawChart(mockTree, 'hourglass', 'I1', {dashChallenged: false});
    expect(looks(d).get('F1|I1')).toBe('solid');
  });

  it('every path of the demo hourglass maps to a child link', () => {
    const d = drawChart(mockTree, 'hourglass', 'I1');
    expect(d.links.length).toBeGreaterThan(0);
    for (const l of d.links) expect(l.link).toBeDefined();
  });
});

describe('disproven and proven links (sokolovy.ged)', () => {
  it('draws a disproven link dotted when asked, hides it otherwise', () => {
    // Sergey (I12) is DISPROVEN in F2, the family of Ivan's parents.
    const dotted = drawChart(sokolovy, 'relatives', 'I3', {
      disproven: 'dotted',
    });
    expect(looks(dotted).get('F2|I12')).toBe('dotted');
    const hidden = drawChart(sokolovy, 'relatives', 'I3', {disproven: 'hide'});
    expect(looks(hidden).has('F2|I12')).toBe(false);
    expect(hidden.svg.querySelector('g[data-id="I12"]')).toBeNull();
  });

  it('draws challenged and proven links apart', () => {
    const d = drawChart(sokolovy, 'hourglass', 'I3', {disproven: 'dotted'});
    expect(looks(d).get('F2|I3')).toBe('dashed');
    const adopted = drawChart(sokolovy, 'hourglass', 'I11');
    expect(looks(adopted).get('F3|I11')).toBe('solid');
  });
});

describe('every view draws official and large trees', () => {
  for (const view of ['hourglass', 'relatives', 'fancy'] as const) {
    it(`${view}: maximal70.ged`, () => {
      const d = drawChart(maximal, view, 'I1');
      expect(d.svg.querySelectorAll('g.gv-person').length).toBeGreaterThan(0);
    });
  }

  it('lays out 2000 people in a moment (hourglass and relatives)', () => {
    const tree = generateTree(2000);
    expect(tree.indis.size).toBeGreaterThanOrEqual(1990);
    for (const view of ['hourglass', 'relatives'] as const) {
      const t0 = performance.now();
      const d = drawChart(tree, view, 'I3');
      const ms = performance.now() - t0;
      expect(d.svg.querySelectorAll('g.gv-person').length).toBeGreaterThan(
        1000,
      );
      // A generous bound: about 0.4 s here; slow CI machines get 10 s.
      expect(ms, view).toBeLessThan(10_000);
      // Some links are disputed, and they are found through their data.
      expect(d.links.some((l) => l.look === 'dashed')).toBe(true);
    }
  }, 60_000);
});

describe('every official test file draws in every view', () => {
  const dir = join(FIXTURES, 'gedcom70');
  const names = readdirSync(dir).filter((n) => n.endsWith('.ged'));
  it('has the files', () => expect(names.length).toBeGreaterThan(10));
  for (const name of names) {
    it(name, () => {
      const tree = treeOf(readFileSync(join(dir, name), 'utf8'));
      const ids = [...tree.indis.keys()].slice(0, 4);
      for (const view of ['hourglass', 'relatives', 'fancy'] as const) {
        for (const id of ids) {
          const d = drawChart(tree, view, id, {disproven: 'dotted'});
          expect(
            d.svg.querySelectorAll('g.gv-person').length,
            `${view} ${id}`,
          ).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe('personLook', () => {
  const tree = treeOf(
    doc7(
      '0 @I1@ INDI',
      '1 NAME Anna /Test/',
      '1 SEX F',
      '1 BIRT',
      '2 DATE 1900',
      '1 DEAT',
      '2 DATE 1980',
      '2 RESN PRIVACY',
      '0 @I2@ INDI',
      '1 RESN CONFIDENTIAL',
      '1 BIRT',
      '2 DATE 1901',
    ),
  );
  const ctx = (hideRestricted: boolean, locale = 'en') => ({
    tree,
    settings: {...SETTINGS, hideRestricted},
    intl: getIntl(locale),
    measure: () => 0,
    selectedId: () => 'I1',
  });

  it('shows name, sex and life dates in the UI language', () => {
    expect(personLook(ctx(false), 'I1')).toMatchObject({
      name: 'Anna Test',
      sex: 'F',
      life: '1900 — 1980',
      label: 'Anna Test, 1900 — 1980',
    });
  });

  it('drops restricted dates and whole restricted persons on request', () => {
    expect(personLook(ctx(true), 'I1').life).toBe('1900');
    expect(personLook(ctx(true), 'I2').life).toBe('');
    expect(personLook(ctx(false), 'I2').life).toBe('1901');
  });

  it('falls back to the id for an unnamed or missing person', () => {
    expect(personLook(ctx(false), 'I2').name).toBe('I2');
    expect(personLook(ctx(false), 'I404').name).toBe('I404');
  });
});
