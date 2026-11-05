// @vitest-environment jsdom
// chartPeople against what topola really draws: the model only knows the
// chart's data, so a walk it gets wrong shows up here and nowhere else.
import {describe, expect, it} from 'vitest';
import type {LoadedTree, MinSourceQuality} from '../gedcom/types';
import {buildChartData} from '../model/chart';
import {personMeetsQuality} from '../model/citations';
import {
  chartPeople,
  scopePeople,
  type BreadthLevel,
  type ChartScope,
} from '../model/scope';
import {doc7, SETTINGS, treeOf} from '../model/test-utils';
import {drawChart} from './test-draw';

interface Family {
  husb?: string;
  wife?: string;
  kids?: string[];
  /** Kids who are in this family by adoption. */
  adopted?: string[];
}

/** A tree from its families; `quay` gives the people with a citation. */
function kin(
  families: Family[],
  quay: Record<string, number> = {},
): LoadedTree {
  const ids = new Set<string>(Object.keys(quay));
  families.forEach((f) => {
    for (const id of [f.husb, f.wife, ...(f.kids ?? []), ...(f.adopted ?? [])])
      if (id) ids.add(id);
  });
  const indis = [...ids].flatMap((id) => [
    `0 @${id}@ INDI`,
    `1 NAME ${id}`,
    ...families.flatMap((f, i) => [
      ...(f.kids?.includes(id) ? [`1 FAMC @F${i}@`] : []),
      ...(f.adopted?.includes(id) ? [`1 FAMC @F${i}@`, '2 PEDI ADOPTED'] : []),
      ...(f.husb === id || f.wife === id ? [`1 FAMS @F${i}@`] : []),
    ]),
    ...(quay[id] === undefined
      ? []
      : ['1 BIRT', '2 SOUR @S1@', `3 QUAY ${quay[id]}`]),
  ]);
  const fams = families.flatMap((f, i) => [
    `0 @F${i}@ FAM`,
    ...(f.husb ? [`1 HUSB @${f.husb}@`] : []),
    ...(f.wife ? [`1 WIFE @${f.wife}@`] : []),
    ...[...(f.kids ?? []), ...(f.adopted ?? [])].map((k) => `1 CHIL @${k}@`),
  ]);
  return treeOf(doc7('0 @S1@ SOUR', '1 TITL Книга', ...indis, ...fams));
}

const scopeOf = (rootId: string, level: BreadthLevel = 'all'): ChartScope => ({
  rootId,
  level,
  up: 12,
  down: 12,
});

/** Who topola draws for the data the app would give it. */
function drawn(
  tree: LoadedTree,
  scope: ChartScope,
  min: MinSourceQuality,
): string[] {
  const settings = {...SETTINGS, minSourceQuality: min};
  const {keep, only} = chartPeople(tree, settings, scope);
  const d = drawChart(tree, 'relatives', scope.rootId, settings, {keep, only});
  const ids = [...d.svg.querySelectorAll('g.gv-person')].map((g) =>
    g.getAttribute('data-id')!,
  );
  return [...new Set(ids)].sort();
}

const at = (tree: LoadedTree, scope: ChartScope, min: MinSourceQuality) => {
  const {shown, dimmed} = chartPeople(
    tree,
    {...SETTINGS, minSourceQuality: min},
    scope,
  );
  return {shown: [...shown].sort(), dimmed: [...dimmed].sort()};
};

describe('the threshold follows what topola draws', () => {
  it('reaches a marriage’s in-law by the way the chart goes', () => {
    // BR's wife C2 is a cousin: her father P1 can't be climbed to from her,
    // only come down to from the common ancestor GG.
    const tree = kin(
      [
        {husb: 'GG', kids: ['G', 'P2']},
        {husb: 'G', kids: ['FA']},
        {husb: 'P2', kids: ['P1']},
        {husb: 'P1', kids: ['C2']},
        {husb: 'FA', kids: ['R', 'BR']},
        {husb: 'BR', wife: 'C2'},
      ],
      {P1: 3},
    );
    const {shown} = at(tree, scopeOf('R'), '3');
    expect(shown).toEqual(['FA', 'G', 'GG', 'P1', 'P2', 'R']);
    expect(drawn(tree, scopeOf('R'), '3')).toEqual(shown);
  });

  it('reaches an aunt who adopted the root through the blood line', () => {
    const tree = kin(
      [
        {husb: 'GP', kids: ['BF', 'AU']},
        {husb: 'BF', kids: ['K']},
        {wife: 'AU', adopted: ['K']},
      ],
      {AU: 3},
    );
    const {shown} = at(tree, scopeOf('K'), '3');
    expect(shown).toEqual(['AU', 'BF', 'GP', 'K']);
    expect(drawn(tree, scopeOf('K'), '3')).toEqual(shown);
  });

  it('links through the parent who passes, leaving the other out', () => {
    for (const parents of [
      {husb: 'FA', wife: 'MO'},
      {husb: 'MO', wife: 'FA'},
    ]) {
      const tree = kin([{...parents, kids: ['R', 'S']}], {
        R: 3,
        S: 3,
        MO: 3,
      });
      const scope = scopeOf('R', 'siblings');
      expect(at(tree, scope, '3')).toEqual({
        shown: ['MO', 'R', 'S'],
        dimmed: [],
      });
      expect(drawn(tree, scope, '3')).toEqual(['MO', 'R', 'S']);
    }
  });

  it('leaves out a parent the other one can do without', () => {
    // Either parent links R and S, but only the mother leads up to GM.
    const tree = kin(
      [
        {husb: 'FA', wife: 'MO', kids: ['R', 'S']},
        {husb: 'GM', kids: ['MO']},
      ],
      {R: 3, S: 3, GM: 3},
    );
    expect(at(tree, scopeOf('R'), '3')).toEqual({
      shown: ['GM', 'MO', 'R', 'S'],
      dimmed: ['MO'],
    });
    expect(drawn(tree, scopeOf('R'), '3')).toEqual(['GM', 'MO', 'R', 'S']);
  });

  it('keeps both parents when each leads up to someone', () => {
    const tree = kin(
      [
        {husb: 'FA', wife: 'MO', kids: ['R', 'S']},
        {husb: 'GF', kids: ['FA']},
        {husb: 'GM', kids: ['MO']},
      ],
      {R: 3, S: 3, GF: 3, GM: 3},
    );
    expect(at(tree, scopeOf('R'), '3').dimmed).toEqual(['FA', 'MO']);
    expect(drawn(tree, scopeOf('R'), '3')).toEqual(
      ['FA', 'GF', 'GM', 'MO', 'R', 'S'].sort(),
    );
  });

  it('keeps nobody for the sake of someone the chart never draws', () => {
    // The chart doesn't show an ancestor's other marriages, so HS can't be
    // reached, with or without the threshold.
    const tree = kin(
      [
        {husb: 'FA', wife: 'MO', kids: ['R']},
        {husb: 'FA', wife: 'W2', kids: ['HS']},
      ],
      {HS: 3},
    );
    expect(at(tree, scopeOf('R'), '3')).toEqual({
      shown: ['R'],
      dimmed: ['R'],
    });
    expect(drawn(tree, scopeOf('R'), '3')).toEqual(['R']);
  });

  it('does not come back to an ancestor by his adoption', () => {
    // FA, adopted by his brother, would bring his other marriage from there,
    // but the chart leaves him out of what lies below his own parents.
    const tree = kin(
      [
        {husb: 'GP', kids: ['FA', 'UN']},
        {husb: 'FA', wife: 'MO', kids: ['R']},
        {husb: 'UN', adopted: ['FA']},
        {husb: 'FA', wife: 'W2'},
      ],
      {W2: 3},
    );
    expect(at(tree, scopeOf('R'), '3').shown).toEqual(['R']);
    expect(drawn(tree, scopeOf('R'), '3')).toEqual(['R']);
  });

  it('climbs to the parents of an only spouse of the root', () => {
    // W is also a cousin, so her parents are in the scope.
    const tree = kin(
      [
        {husb: 'GF', kids: ['FA', 'WF']},
        {husb: 'FA', kids: ['R']},
        {husb: 'WF', kids: ['W']},
        {husb: 'R', wife: 'W'},
      ],
      {WF: 3, W: 3},
    );
    const {shown} = at(tree, scopeOf('R'), '3');
    expect(shown).toEqual(['R', 'W', 'WF']);
    expect(drawn(tree, scopeOf('R'), '3')).toEqual(shown);
  });
});

describe('at «all» the chart is as without the setting', () => {
  // F0 has only R in it: nothing to link, yet the chart draws it.
  const tree = kin([
    {husb: 'R'},
    {husb: 'R', wife: 'W', kids: ['K']},
    {husb: 'FA', kids: ['R']},
  ]);

  it('gives the chart no second limit', () => {
    const settings = {...SETTINGS, minSourceQuality: 'all' as const};
    const scope = scopeOf('R');
    const {keep, only} = chartPeople(tree, settings, scope);
    expect(only).toBeUndefined();
    expect(buildChartData(tree, settings, {keep, only})).toEqual(
      buildChartData(tree, settings, {
        keep: scopePeople(tree, settings, scope),
      }),
    );
  });

  it('still draws the family with one person', () => {
    const scope = scopeOf('R');
    const {keep, only} = chartPeople(tree, SETTINGS, scope);
    const d = drawChart(tree, 'relatives', 'R', SETTINGS, {keep, only});
    expect(d.svg.querySelectorAll('g.gv-person[data-id="R"]')).toHaveLength(2);
  });
});

describe('random trees', () => {
  /** Small trees with what makes the chart's walk differ from the links:
   *  second marriages, marriages among relatives and adoptions. */
  function randomTree(seed: number): LoadedTree {
    let s = seed;
    const next = (n: number) => {
      s = (s * 48271) % 2147483647;
      return s % n;
    };
    const families: Family[] = [];
    const quay: Record<string, number> = {};
    const people: string[] = [];
    const person = () => {
      const id = `P${people.length}`;
      people.push(id);
      if (next(3) === 0) quay[id] = next(4);
      return id;
    };
    const parentsOf = new Map<string, string[]>();
    const taken = new Set<string>();
    families.push({husb: person(), wife: person(), kids: []});
    for (let i = 0; i < families.length && people.length < 28; i++) {
      const fam = families[i]!;
      const kids = 1 + next(3);
      for (let k = 0; k < kids; k++) {
        const kid = person();
        fam.kids!.push(kid);
        parentsOf.set(kid, [fam.husb!, fam.wife!]);
        if (next(4) === 0) continue;
        // Half of them marry a relative who is free, the others a newcomer.
        const free = people.filter(
          (p) => p !== kid && !taken.has(p) && !parentsOf.get(p)?.includes(kid),
        );
        const relative = next(2) === 0 ? free[next(free.length || 1)] : null;
        const spouse = relative ?? person();
        taken.add(spouse);
        families.push({husb: kid, wife: spouse, kids: []});
        if (next(4) === 0) families.push({husb: kid, wife: person(), kids: []});
      }
      if (next(8) === 0 && fam.kids!.length > 0) {
        const other = families[next(families.length)]!;
        const kid = fam.kids![0]!;
        if (other !== fam && !other.kids!.includes(kid))
          (other.adopted ??= []).push(kid);
      }
    }
    return kin(families, quay);
  }

  const levels: BreadthLevel[] = ['direct', 'siblings', 'cousins1', 'all'];

  it(
    'every pale person is needed by someone who passes',
    {timeout: 60000},
    () => {
      let pale = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const tree = randomTree(seed * 104729);
        const ids = [...tree.indis.keys()];
        const rootId = ids[seed % ids.length]!;
        // With its other marriages gone, a root's chart climbs to the parents
        // of the spouse left: a way the threshold doesn't count on.
        if (tree.indis.get(rootId)!.fams.length > 1) continue;
        const scope = scopeOf(rootId, levels[seed % levels.length]!);
        const settings = {...SETTINGS, minSourceQuality: '3' as const};
        const {keep, shown, dimmed} = chartPeople(tree, settings, scope);
        const passing = [...shown].filter((id) => !dimmed.has(id));
        for (const id of dimmed) {
          if (id === rootId) continue;
          pale++;
          const only = new Set(shown);
          only.delete(id);
          const d = drawChart(tree, 'relatives', rootId, settings, {
            keep,
            only,
          });
          const lost = passing.filter(
            (p) => !d.svg.querySelector(`g.gv-person[data-id="${p}"]`),
          );
          expect(lost.length, `seed ${seed}, ${id}`).toBeGreaterThan(0);
        }
      }
      expect(pale).toBeGreaterThan(20);
    },
  );

  it(
    'what is counted is what is drawn, and who passes stays',
    {timeout: 60000},
    () => {
      let filtered = 0;
      for (let seed = 1; seed <= 120; seed++) {
        const tree = randomTree(seed * 7919);
        const ids = [...tree.indis.keys()];
        const rootId = ids[seed % ids.length]!;
        const scope = scopeOf(rootId, levels[seed % levels.length]!);
        for (const min of ['0', '3'] as const) {
          const {shown} = at(tree, scope, min);
          const label = `seed ${seed}, root ${rootId}, ${scope.level}, ${min}`;
          expect(drawn(tree, scope, min), label).toEqual(shown);
          if (shown.length > 1) filtered++;

          // Everyone above the threshold the plain chart draws is still there.
          const plain = drawn(tree, scope, 'all');
          const passing = plain.filter((id) =>
            personMeetsQuality(tree.indis.get(id)!, min),
          );
          for (const id of passing) expect(shown, label).toContain(id);
        }
      }
      // The trees do exercise the threshold.
      expect(filtered).toBeGreaterThan(50);
    },
  );
});
