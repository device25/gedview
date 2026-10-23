import {describe, expect, it} from 'vitest';
import {mockTree} from './mock/mockTree';
import {buildIndex, searchPeople} from './search';
import {
  cardEvents,
  CitationIndex,
  hidingMarks,
  listSources,
  relativesOf,
  splitByResn,
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
    expect(listSources(mockTree).map((s) => s.id)).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
    ]);
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
    expect(tags).toEqual([
      'BIRT',
      'CHR',
      'CENS',
      'MARR',
      'RESI',
      'OCCU',
      'EVEN',
      'DEAT',
    ]);
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

describe('card data', () => {
  it('groups parents per FAMC with pedigree and status', () => {
    const groups = relativesOf(mockTree, ivan).parents;
    expect(groups.map((g) => [g.famId, g.pedigree, g.status])).toEqual([
      ['F1', 'BIRTH', 'CHALLENGED'],
      ['F4', 'ADOPTED', undefined],
      ['F5', 'BIRTH', 'DISPROVEN'],
    ]);
    expect(groups[1]?.pedigreePhrase).toBe('усыновлён отчимом');
    expect(groups[2]?.statusPhrase).toContain('опровергнуто');
    // A disproven link is still listed.
    expect(groups[2]?.people.map((p) => p.id)).toEqual(['I9']);
  });

  it('lists the children under their own family', () => {
    const rel = relativesOf(mockTree, ivan);
    expect(rel.spouses[0]?.children.map((c) => c.indi.id)).toEqual([
      'I5',
      'I6',
    ]);
    const semyon = relativesOf(mockTree, mockTree.indis.get('I9')!);
    const disproven = semyon.spouses
      .flatMap((s) => s.children)
      .find((c) => c.indi.id === 'I1');
    expect(disproven?.link?.status).toBe('DISPROVEN');
  });

  it('orders events by the model (SDATE), not by DATE', () => {
    const tags = ivan.events.map((e) => e.tag);
    expect(tags.indexOf('RESI')).toBeLessThan(tags.indexOf('OCCU'));
    expect(ivan.events.find((e) => e.tag === 'RESI')?.sortDate).toBeDefined();
  });

  it('splits RESN CONFIDENTIAL and PRIVACY, but not LOCKED', () => {
    const items = [
      {restrictions: ['CONFIDENTIAL']},
      {restrictions: ['PRIVACY']},
      {restrictions: ['LOCKED']},
      {},
    ];
    const hidden = splitByResn(items, (i) => i, true);
    expect(hidden.hidden).toHaveLength(2);
    expect(hidden.visible).toHaveLength(2);
    expect(splitByResn(items, (i) => i, false).hidden).toHaveLength(0);
    expect(hidingMarks(items)).toEqual(['CONFIDENTIAL', 'PRIVACY']);
    expect(hidingMarks([{restrictions: ['LOCKED']}])).toEqual([]);
  });

  it('numbers every distinct citation once, in order of first use', () => {
    const idx = new CitationIndex();
    const all = ivan.events.flatMap((e) => e.citations);
    const nums = all.map((c) => idx.add(c));
    expect(nums).toEqual([1, 1, 2, 3, 4, 5]);
    expect(idx.add(all[0]!)).toBe(1);
    expect(idx.items).toHaveLength(5);
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
