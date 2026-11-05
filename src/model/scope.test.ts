import {describe, expect, it} from 'vitest';
import {buildChartData} from './chart';
import {buildChartData as chartData} from './chart';
import {chartPeople, scopeCount, scopePeople, type ChartScope} from './scope';
import {doc7, SETTINGS, treeOf} from './test-utils';

// Four generations around Александра (A):
//   Илья + Дарья → Пётр, Николай Ильич (NI)
//   Пётр + Мария → Иван, Степан;  NI + Зоя → Ольга;  Ольга + Белов → Вера
//   Семён + Пелагея → Евдокия
//   Иван + Евдокия → A, Николай (N);  Степан + Клава → Пётр С. (PS)
//   PS + Галя → Анна (AP);  N + Нина → Лев;  A + Сергей → Дмитрий → Оля
const people: Record<string, string> = {
  ILYA: 'Илья',
  DARIA: 'Дарья',
  PETR: 'Пётр',
  MARIA: 'Мария',
  NI: 'Николай Ильич',
  ZOYA: 'Зоя',
  OLGA: 'Ольга',
  BELOV: 'Белов',
  VERA: 'Вера',
  SEMEN: 'Семён',
  PELAGEYA: 'Пелагея',
  IVAN: 'Иван',
  EVD: 'Евдокия',
  STEPAN: 'Степан',
  KLAVA: 'Клава',
  A: 'Александра',
  N: 'Николай',
  PS: 'Пётр С',
  GALYA: 'Галя',
  AP: 'Анна',
  NINA: 'Нина',
  LEV: 'Лев',
  SERGEY: 'Сергей',
  DMITRY: 'Дмитрий',
  OLYA: 'Оля',
};
const families: Array<[string, string, string, string[]]> = [
  ['F1', 'ILYA', 'DARIA', ['PETR', 'NI']],
  ['F2', 'PETR', 'MARIA', ['IVAN', 'STEPAN']],
  ['F3', 'NI', 'ZOYA', ['OLGA']],
  ['F4', 'BELOV', 'OLGA', ['VERA']],
  ['F5', 'SEMEN', 'PELAGEYA', ['EVD']],
  ['F6', 'IVAN', 'EVD', ['A', 'N']],
  ['F7', 'STEPAN', 'KLAVA', ['PS']],
  ['F8', 'PS', 'GALYA', ['AP']],
  ['F9', 'N', 'NINA', ['LEV']],
  ['F10', 'SERGEY', 'A', ['DMITRY']],
  ['F11', 'DMITRY', 'X', ['OLYA']],
];

function tree() {
  const lines: string[] = [];
  for (const [id, name] of Object.entries({...people, X: 'Икс'})) {
    lines.push(`0 @${id}@ INDI`, `1 NAME ${name}`);
    for (const [fam, h, w, kids] of families) {
      if (h === id || w === id) lines.push(`1 FAMS @${fam}@`);
      if (kids.includes(id)) lines.push(`1 FAMC @${fam}@`);
    }
  }
  for (const [fam, h, w, kids] of families) {
    lines.push(`0 @${fam}@ FAM`, `1 HUSB @${h}@`, `1 WIFE @${w}@`);
    for (const k of kids) lines.push(`1 CHIL @${k}@`);
  }
  return treeOf(doc7(...lines));
}

const T = tree();
const scope = (patch: Partial<ChartScope>): ChartScope => ({
  rootId: 'A',
  level: 'direct',
  up: 3,
  down: 2,
  ...patch,
});
const ids = (patch: Partial<ChartScope>) =>
  [...scopePeople(T, SETTINGS, scope(patch))].sort();

describe('scopePeople', () => {
  it('direct line: ancestors and descendants only', () => {
    expect(ids({})).toEqual(
      [
        'A',
        'DARIA',
        'DMITRY',
        'EVD',
        'ILYA',
        'IVAN',
        'MARIA',
        'OLYA',
        'PELAGEYA',
        'PETR',
        'SEMEN',
      ].sort(),
    );
  });

  it("siblings: the parents' descendants and the siblings of ancestors", () => {
    const got = ids({level: 'siblings'});
    // Brother and his son; the uncle and the grandfather's brother.
    for (const id of ['N', 'LEV', 'STEPAN', 'NI']) expect(got).toContain(id);
    // Not the uncle's or great-uncle's children.
    for (const id of ['PS', 'OLGA', 'AP', 'VERA'])
      expect(got).not.toContain(id);
  });

  it("first cousins: the grandparents' descendants", () => {
    const got = ids({level: 'cousins1'});
    for (const id of ['PS', 'AP']) expect(got).toContain(id);
    // A parent's first cousin shares only the great-grandparents.
    expect(got).not.toContain('OLGA');
  });

  it("second cousins: the great-grandparents' descendants", () => {
    const got = ids({level: 'cousins2'});
    for (const id of ['OLGA', 'VERA']) expect(got).toContain(id);
  });

  it('second cousins need three generations up', () => {
    expect(ids({level: 'cousins2', up: 1})).toEqual(ids({level: 'cousins2'}));
  });

  it('generations limit every line', () => {
    const got = ids({level: 'cousins1', up: 2, down: 0});
    expect(got).not.toContain('DMITRY');
    expect(got).not.toContain('AP');
    expect(got).not.toContain('LEV');
    expect(got).not.toContain('ILYA');
    expect(got).toContain('PS');
  });

  it('everyone related ignores the limits', () => {
    const got = ids({level: 'all', up: 1, down: 0});
    for (const id of ['ILYA', 'VERA', 'OLYA', 'AP']) expect(got).toContain(id);
  });

  it('an unknown root gives nobody', () => {
    expect(ids({rootId: 'NOPE'})).toEqual([]);
  });
});

describe('chart data for a scope', () => {
  it('keeps spouses but not their parents or other marriages', () => {
    const keep = scopePeople(
      T,
      SETTINGS,
      scope({level: 'direct', up: 1, down: 1}),
    );
    const data = buildChartData(T, SETTINGS, {keep});
    const drawn = data.indis.map((i) => i.id).sort();
    // Евдокия is a parent (blood line); Сергей and Икс are spouses.
    expect(drawn).toEqual(['A', 'DMITRY', 'EVD', 'IVAN', 'SERGEY', 'X'].sort());
    // Ivan's parents are beyond «вверх 1»: his family link is dropped.
    expect(data.indis.find((i) => i.id === 'IVAN')!.famc).toBeUndefined();
    // Dmitry's own family is drawn (his wife), but not his daughter.
    expect(data.fams.map((f) => f.id).sort()).toEqual(['F10', 'F11', 'F6']);
    expect(data.fams.find((f) => f.id === 'F11')!.children).toEqual([]);
    expect(scopeCount(T, keep)).toBe(6);
  });
});

describe('reliability threshold', () => {
  // ДЕД (3) → ОТЕЦ (no QUAY) + МАТЬ (1) → КОРЕНЬ, БРАТ (0)
  // БРАТ + ЖЕНА (3); ДЯДЯ (no citation) is ДЕД's other son.
  const cited = (quay?: number) =>
    quay === undefined
      ? []
      : ['1 BIRT', '2 SOUR @S1@', ...(quay >= 0 ? [`3 QUAY ${quay}`] : [])];
  const quay = treeOf(
    doc7(
      '0 @S1@ SOUR',
      '1 TITL Книга',
      '0 @ROOT@ INDI',
      '1 NAME Корень',
      '1 FAMC @F1@',
      ...cited(2),
      '0 @FATHER@ INDI',
      '1 NAME Отец',
      '1 FAMC @F0@',
      '1 FAMS @F1@',
      ...cited(-1),
      '0 @MOTHER@ INDI',
      '1 NAME Мать',
      '1 FAMS @F1@',
      ...cited(1),
      '0 @BROTHER@ INDI',
      '1 NAME Брат',
      '1 FAMC @F1@',
      '1 FAMS @F2@',
      ...cited(0),
      '0 @WIFE@ INDI',
      '1 NAME Жена',
      '1 FAMS @F2@',
      ...cited(3),
      '0 @GRAND@ INDI',
      '1 NAME Дед',
      '1 FAMS @F0@',
      ...cited(3),
      '0 @UNCLE@ INDI',
      '1 NAME Дядя',
      '1 FAMC @F0@',
      '0 @F0@ FAM',
      '1 HUSB @GRAND@',
      '1 CHIL @FATHER@',
      '1 CHIL @UNCLE@',
      '0 @F1@ FAM',
      '1 HUSB @FATHER@',
      '1 WIFE @MOTHER@',
      '1 CHIL @ROOT@',
      '1 CHIL @BROTHER@',
      '0 @F2@ FAM',
      '1 HUSB @BROTHER@',
      '1 WIFE @WIFE@',
    ),
  );
  const at = (
    min: 'all' | '0' | '1' | '2' | '3',
    rootId = 'ROOT',
  ): {shown: string[]; dimmed: string[]} => {
    const {shown, dimmed} = chartPeople(
      quay,
      {...SETTINGS, minSourceQuality: min},
      {rootId, level: 'all', up: 12, down: 12},
    );
    return {shown: [...shown].sort(), dimmed: [...dimmed].sort()};
  };

  it('draws everyone at «all», with nobody dimmed', () => {
    const scope: ChartScope = {rootId: 'ROOT', level: 'all', up: 12, down: 12};
    const plain = scopeCount(quay, scopePeople(quay, SETTINGS, scope));
    expect(at('all').shown).toHaveLength(plain);
    expect(at('all').dimmed).toEqual([]);
  });

  it('hides those below it and dims only who links the others', () => {
    // ОТЕЦ has no QUAY but is the way to ДЕД; БРАТ (0) the way to ЖЕНА.
    expect(at('3')).toEqual({
      shown: ['BROTHER', 'FATHER', 'GRAND', 'ROOT', 'WIFE'],
      dimmed: ['BROTHER', 'FATHER', 'ROOT'],
    });
  });

  it('a citation without QUAY stays below any threshold', () => {
    const {shown, dimmed} = at('0');
    expect(shown).not.toContain('UNCLE');
    expect(dimmed).toEqual(['FATHER']);
  });

  it('always keeps the root, even with nobody else to show', () => {
    const lonely = treeOf(doc7('0 @A@ INDI', '1 NAME Анна'));
    const {shown, dimmed} = chartPeople(
      lonely,
      {...SETTINGS, minSourceQuality: '3'},
      {rootId: 'A', level: 'all', up: 12, down: 12},
    );
    expect([...shown]).toEqual(['A']);
    expect([...dimmed]).toEqual(['A']);
  });

  it('leaves out of the chart data whoever is hidden', () => {
    const settings = {...SETTINGS, minSourceQuality: '3' as const};
    const {keep, shown} = chartPeople(quay, settings, {
      rootId: 'ROOT',
      level: 'all',
      up: 12,
      down: 12,
    });
    const data = chartData(quay, settings, {keep, only: shown});
    expect(data.indis.map((i) => i.id).sort()).toEqual([...shown].sort());
    const f1 = data.fams.find((f) => f.id === 'F1')!;
    expect(f1.husb).toBe('FATHER');
    expect(f1.wife).toBeUndefined();
    expect(f1.children).toEqual(['ROOT', 'BROTHER']);
    expect(data.fams.find((f) => f.id === 'F0')?.children).toEqual(['FATHER']);
  });

  it('drops a family with nobody left to link', () => {
    const settings = {...SETTINGS, minSourceQuality: '3' as const};
    const data = chartData(quay, settings, {only: new Set(['GRAND'])});
    expect(data.fams).toEqual([]);
    expect(data.indis.map((i) => i.id)).toEqual(['GRAND']);
    expect(data.indis[0]?.fams).toEqual([]);
  });
});
