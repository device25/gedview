import {describe, expect, it} from 'vitest';
import {doc7, treeOf} from '../model/test-utils';
import {mediaEntries, portraitOf, titleYear} from './media';

const obje = (id: string, title: string) => [
  `0 @${id}@ OBJE`,
  `1 FILE https://images.example.test/${id}.jpg`,
  '2 FORM image/jpeg',
  `2 TITL ${title}`,
];

const tree = treeOf(
  doc7(
    '0 @I1@ INDI',
    '1 OBJE @O1@',
    '1 OBJE @O2@',
    '1 OBJE @O3@',
    '1 OBJE @O4@',
    '1 RESI',
    '2 DATE 1930',
    '2 OBJE @O5@',
    '1 FAMS @F1@',
    '0 @F1@ FAM',
    '1 HUSB @I1@',
    '1 MARR',
    '2 DATE 12 FEB 1912',
    '2 OBJE @O2@',
    ...obje('O1', 'Портрет'),
    ...obje('O2', 'Свадьба'),
    ...obje('O3', 'Школа, 1955 г.'),
    ...obje('O4', 'Справка от 23.01.1901'),
    ...obje('O5', 'Дом'),
  ),
);

describe('the order of a person’s media', () => {
  const entries = mediaEntries(tree, tree.indis.get('I1')!, {
    hide: true,
    allowRemote: true,
  });

  it('goes by year: the event’s, else the title’s; then the rest', () => {
    expect(entries.map((e) => [e.title, e.year])).toEqual([
      ['Справка от 23.01.1901', 1901],
      ['Свадьба', 1912],
      ['Дом', 1930],
      ['Школа, 1955 г.', 1955],
      ['Портрет', undefined],
    ]);
  });

  it('keeps the first image of the file as the portrait', () => {
    expect(portraitOf(entries)?.entry.title).toBe('Портрет');
  });
});

describe('titleYear', () => {
  it('finds the first year however it is written', () => {
    expect(titleYear('Школа, 1955 г.')).toBe(1955);
    expect(titleYear('23.01.2019, Москва')).toBe(2019);
    expect(titleYear('Служба 1975–1985 гг.')).toBe(1975);
    expect(titleYear('Дело № 812813')).toBeUndefined();
    expect(titleYear('Портрет')).toBeUndefined();
  });
});
