import {describe, expect, it} from 'vitest';
import {buildChartData} from './chart';
import {scopeCount, scopePeople, type ChartScope} from './scope';
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
