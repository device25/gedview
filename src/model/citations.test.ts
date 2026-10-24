import {describe, expect, it} from 'vitest';
import {personCitations} from './citations';
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
