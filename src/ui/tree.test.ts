import {describe, expect, it} from 'vitest';
import {mockTree} from './mock/mockTree';
import {buildIndex, searchPeople} from './search';
import {
  cardEvents,
  CitationIndex,
  listSources,
  relativesOf,
  treeTitle,
} from './treeInfo';

const ivan = mockTree.indis.get('I1')!;

describe('treeInfo', () => {
  it('takes the title from HEAD.FILE, else the file name', () => {
    expect(treeTitle(mockTree)).toBe('Соколовы');
    const noHead = {
      ...mockTree,
      parse: {...mockTree.parse, records: []},
      source: {kind: 'file' as const, name: 'my tree.ged'},
    };
    expect(treeTitle(noHead)).toBe('my tree');
  });

  it('lists sources by title', () => {
    expect(listSources(mockTree).map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
  });

  it('finds parents, spouse and children', () => {
    const rel = relativesOf(mockTree, ivan);
    expect(rel.parents[0]?.people.map((p) => p.id)).toEqual(['I2', 'I3']);
    expect(rel.parents[0]?.status).toBe('CHALLENGED');
    expect(rel.spouses.map((s) => s.spouse?.id)).toEqual(['I4']);
    expect(rel.children.map((c) => c.id)).toEqual(['I5', 'I6']);
  });

  it('inserts the family marriage before the first later-dated event', () => {
    const tags = cardEvents(mockTree, ivan).map((c) => c.event.tag);
    expect(tags).toEqual(['BIRT', 'CHR', 'CENS', 'EVEN', 'MARR', 'DEAT']);
    expect(cardEvents(mockTree, ivan).find((c) => c.famId)?.famId).toBe('F2');
  });

  it('numbers citations once per source and page', () => {
    const idx = new CitationIndex();
    const [a, b] = [
      ivan.events[0]!.citations[0]!,
      ivan.events[1]!.citations[0]!,
    ];
    expect(idx.add(a)).toBe(1);
    expect(idx.add(b)).toBe(1);
    expect(idx.add(ivan.events[2]!.citations[0]!)).toBe(2);
    expect(idx.items).toHaveLength(2);
  });
});

describe('search', () => {
  const index = buildIndex(mockTree, {locale: 'ru', style: 'source'});

  it('sorts by name', () => {
    expect(index[0]?.name).toBe('Александра Ивановна Соколова');
  });

  it('matches names, ignoring case and ё', () => {
    expect(searchPeople(index, 'соколов').length).toBe(5);
    expect(searchPeople(index, 'семен').map((e) => e.id)).toEqual(['I4', 'I9']);
  });

  it('requires every word and matches years and ids', () => {
    expect(searchPeople(index, 'иван 1889').map((e) => e.id)).toEqual(['I1']);
    expect(searchPeople(index, 'i10').map((e) => e.id)).toEqual(['I10']);
    expect(searchPeople(index, 'нет такого')).toEqual([]);
  });

  it('respects the limit and returns everyone for an empty query', () => {
    expect(searchPeople(index, '', 3)).toHaveLength(3);
    expect(searchPeople(index, '')).toHaveLength(10);
  });
});
