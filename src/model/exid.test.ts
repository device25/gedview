import {describe, expect, it} from 'vitest';
import {exidType, knownExidTypes, makeExternalId} from './exid';

describe('EXID registry', () => {
  it('builds the URLs of the registry', () => {
    const url = (type: string, id: string) => makeExternalId(id, type).url;
    expect(
      url('https://gedcom.io/exid-type/FamilySearch-PersonId', 'KWCD-123'),
    ).toBe(
      'https://www.familysearch.org/en/search/tree/results?q.personId=KWCD-123',
    );
    expect(
      url('https://gedcom.io/exid-type/FamilySearch-MemoryId', '1234-5678'),
    ).toBe('https://www.familysearch.org/en/memories/memory/1234-5678');
    expect(url('https://www.findagrave.com/memorial/', '123456')).toBe(
      'https://www.findagrave.com/memorial/123456',
    );
    expect(url('https://www.findagrave.com/cemetery/', '77')).toBe(
      'https://www.findagrave.com/cemetery/77',
    );
    expect(url('https://www.wikitree.com/wiki/', 'Smith-123')).toBe(
      'https://www.wikitree.com/wiki/Smith-123',
    );
    expect(url('https://gov.genealogy.net/', 'HAMBURGJO53KS')).toBe(
      'https://gov.genealogy.net/item/show/HAMBURGJO53KS',
    );
    expect(url('https://gedcom.io/exid-type/FamilySearch-PlaceId', '1')).toBe(
      'https://www.familysearch.org/en/research/places/?focusedId=1',
    );
    expect(
      url(
        'https://gedcom.io/exid-type/FamilySearch-SourceDescriptionId',
        'MMMM-1',
      ),
    ).toBe('https://www.familysearch.org/en/tree/sources/viewedit/MMMM-1');
    expect(url('https://www.billiongraves.com/grave/name/', '9')).toBe(
      'https://www.billiongraves.com/grave/name/9',
    );
    expect(url('https://www.billiongraves.com/cemetery/name/', '9')).toBe(
      'https://www.billiongraves.com/cemetery/name/9',
    );
  });

  it('has labels for the types without a URL', () => {
    for (const [type, label] of [
      ['https://gedcom.io/terms/v7/AFN', 'Ancestral File Number'],
      ['https://gedcom.io/terms/v7/RFN', 'Record File Number'],
      ['https://gedcom.io/terms/v7/RIN', 'Record ID Number'],
      [
        'https://gedcom.io/exid-type/FamilySearch-UserId',
        'FamilySearch User ID',
      ],
    ] as const) {
      const id = makeExternalId('x', type);
      expect(id.label).toBe(label);
      expect(id.url).toBeUndefined();
    }
  });

  it('percent-encodes ids', () => {
    const id = makeExternalId('a b/c?d#e&f', 'https://www.wikitree.com/wiki/');
    expect(id.url).toBe('https://www.wikitree.com/wiki/a%20b%2Fc%3Fd%23e%26f');
    expect(
      makeExternalId('  X-1  ', 'https://www.wikitree.com/wiki/').url,
    ).toBe('https://www.wikitree.com/wiki/X-1');
    expect(makeExternalId('Ä', 'https://www.wikitree.com/wiki/').url).toBe(
      'https://www.wikitree.com/wiki/%C3%84',
    );
  });

  it('gives no label and no URL to unknown or missing types', () => {
    expect(makeExternalId('1', 'http://example.com')).toEqual({
      value: '1',
      type: 'http://example.com',
    });
    expect(makeExternalId('1')).toEqual({value: '1'});
    expect(exidType(undefined)).toBeUndefined();
    expect(exidType('')).toBeUndefined();
  });

  it('ignores fragments and a missing trailing slash or http/https', () => {
    expect(exidType('https://gedcom.io/terms/v7/RIN#MyProgram')?.label).toBe(
      'Record ID Number',
    );
    expect(exidType('https://www.findagrave.com/memorial')?.label).toBe(
      'FindAGrave Memorial ID',
    );
    expect(exidType('http://www.findagrave.com/memorial/')?.label).toBe(
      'FindAGrave Memorial ID',
    );
  });

  it('lists the 14 registered types', () => {
    const types = knownExidTypes();
    expect(types).toHaveLength(14);
    expect(new Set(types.map((t) => t.type)).size).toBe(14);
    for (const t of types)
      expect(
        t.urlPrefix === undefined || t.urlPrefix.startsWith('https://'),
      ).toBe(true);
  });
});
