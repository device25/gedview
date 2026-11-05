import {describe, expect, it} from 'vitest';
import {meetsQuality, personCitations, personMeetsQuality} from './citations';
import {runChecks, todayJdn} from './checks';
import {doc7, treeOf} from './test-utils';

const tree = treeOf(
  doc7(
    '0 @S1@ SOUR',
    '1 TITL Рассказ бабушки',
    '0 @S2@ SOUR',
    '1 TITL Метрическая книга',
    '0 @I1@ INDI',
    '1 NAME Анна /Тестова/',
    '1 NOTE Со слов бабушки',
    '2 SOUR @S1@',
    '3 PAGE запись 2019 года',
    '1 BIRT',
    '2 DATE 1912',
    '2 NOTE Крестили дома',
    '3 SOUR @S2@',
    '0 @I2@ INDI',
    '1 NAME Пётр /Тестов/',
  ),
);

describe('the citations of a person', () => {
  it('include those on the person’s notes and on their events’ notes', () => {
    const indi = tree.indis.get('I1')!;
    const cited = personCitations(indi, indi.events).map((c) => c.sourceId);
    expect(cited.sort()).toEqual(['S1', 'S2']);
  });

  it('count for «без источников»: a source on a note is a source', () => {
    const found = runChecks(tree, todayJdn()).noSources.map((f) => f.id);
    expect(found).toEqual(['I2']);
  });
});

describe('meetsQuality', () => {
  it('passes QUAY at or above the threshold', () => {
    expect(meetsQuality({quality: 2}, '2')).toBe(true);
    expect(meetsQuality({quality: 3}, '2')).toBe(true);
    expect(meetsQuality({quality: 1}, '2')).toBe(false);
    expect(meetsQuality({quality: 0}, '0')).toBe(true);
  });

  it('lets a citation without QUAY through only at «all»', () => {
    expect(meetsQuality({}, 'all')).toBe(true);
    expect(meetsQuality({}, '0')).toBe(false);
    expect(meetsQuality({}, '3')).toBe(false);
  });
});

describe('personMeetsQuality', () => {
  const quality = treeOf(
    doc7(
      '0 @S1@ SOUR',
      '1 TITL Книга',
      '0 @F1@ FAM',
      '1 HUSB @I3@',
      '1 SOUR @S1@',
      '2 QUAY 3',
      '0 @I1@ INDI',
      '1 NAME Имя /С цитатой/',
      '2 SOUR @S1@',
      '3 QUAY 2',
      '0 @I2@ INDI',
      '1 NAME Заметка /С цитатой/',
      '1 NOTE Со слов',
      '2 SOUR @S1@',
      '3 QUAY 3',
      '0 @I3@ INDI',
      '1 NAME Цитата /Семьи/',
      '1 FAMS @F1@',
    ),
  );
  const meets = (id: string, min: '2' | '3') =>
    personMeetsQuality(quality.indis.get(id)!, min);

  it('counts citations on names and notes', () => {
    expect(meets('I1', '2')).toBe(true);
    expect(meets('I1', '3')).toBe(false);
    expect(meets('I2', '3')).toBe(true);
  });

  it('does not count the citations of a family', () => {
    expect(meets('I3', '2')).toBe(false);
  });
});
