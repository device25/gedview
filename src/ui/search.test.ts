import {describe, expect, it} from 'vitest';
import {buildIndex, searchPeople} from './search';
import {mockTree} from './mock/mockTree';

describe('search by date text', () => {
  it('finds a person by the month word despite non-breaking spaces', () => {
    const index = buildIndex(mockTree, {locale: 'ru', style: 'both'});
    const found = searchPeople(index, 'апреля 1889').map((e) => e.id);
    expect(found).toContain('I1');
    expect(searchPeople(index, '6 апреля').map((e) => e.id)).toContain('I1');
  });
});
