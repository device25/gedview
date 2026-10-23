import {describe, expect, it} from 'vitest';
import {displayName, splitName, surnameOf} from './names';
import {doc5, doc7, treeOf} from './test-utils';

const names = (text: string) => treeOf(text).indis.get('I1')!.names;

describe('name helpers', () => {
  it('displays without slashes and collapses spaces', () => {
    expect(displayName('Lt. Cmndr. Joseph "John" /de Allen/ jr.')).toBe(
      'Lt. Cmndr. Joseph "John" de Allen jr.',
    );
    expect(displayName('  Иван   /Соколов/ ')).toBe('Иван Соколов');
    expect(displayName('/Doe/')).toBe('Doe');
    expect(displayName('')).toBe('');
  });

  it('finds the surname between the slashes', () => {
    expect(surnameOf('John /Doe/')).toBe('Doe');
    expect(surnameOf('John //')).toBeUndefined();
    expect(surnameOf('John Doe')).toBeUndefined();
    expect(surnameOf('/de Allen/ jr.')).toBe('de Allen');
  });

  it('splits around the surname', () => {
    expect(splitName('Lt. Joseph /de Allen/ jr.')).toEqual({
      before: 'Lt. Joseph',
      surname: 'de Allen',
      after: 'jr.',
    });
    expect(splitName('Aka')).toEqual({before: 'Aka', after: ''});
    expect(splitName('John //')).toEqual({before: 'John', after: ''});
  });
});

describe('NAME structures', () => {
  it('reads pieces, TYPE with PHRASE and TRAN with LANG', () => {
    const [n] = names(
      doc7(
        '0 @I1@ INDI',
        '1 NAME Lt. Cmndr. Joseph "John" /de Allen/ jr.',
        '2 TYPE OTHER',
        '3 PHRASE Name type phrase',
        '2 NPFX Lt. Cmndr.',
        '2 GIVN Joseph',
        '2 NICK John',
        '2 SPFX de',
        '2 SURN Allen',
        '2 NSFX jr.',
        '2 TRAN npfx John /spfx Doe/ nsfx',
        '3 LANG en-GB',
        '3 GIVN John',
        '3 SURN Doe',
        '2 TRAN John /Doe/',
        '3 LANG en-CA',
      ),
    );
    expect(n).toMatchObject({
      raw: 'Lt. Cmndr. Joseph "John" /de Allen/ jr.',
      display: 'Lt. Cmndr. Joseph "John" de Allen jr.',
      surname: 'de Allen',
      type: 'OTHER',
      typePhrase: 'Name type phrase',
      pieces: {
        npfx: 'Lt. Cmndr.',
        givn: 'Joseph',
        nick: 'John',
        spfx: 'de',
        surn: 'Allen',
        nsfx: 'jr.',
      },
    });
    expect(n!.translations).toEqual([
      {
        raw: 'npfx John /spfx Doe/ nsfx',
        display: 'npfx John spfx Doe nsfx',
        lang: 'en-GB',
        pieces: {givn: 'John', surn: 'Doe'},
      },
      {raw: 'John /Doe/', display: 'John Doe', lang: 'en-CA', pieces: {}},
    ]);
    expect(n!.node.tag).toBe('NAME');
  });

  it('keeps names in file order with their types', () => {
    const list = names(
      doc7(
        '0 @I1@ INDI',
        '1 NAME John /Doe/',
        '2 TYPE BIRTH',
        '1 NAME Aka',
        '2 TYPE AKA',
        '1 NAME Plain /Name/',
        '1 NAME X',
        '2 TYPE _MYTYPE',
      ),
    );
    expect(list.map((n) => [n.display, n.type])).toEqual([
      ['John Doe', 'BIRTH'],
      ['Aka', 'AKA'],
      ['Plain Name', undefined],
      ['X', '_MYTYPE'],
    ]);
  });

  it('joins repeated pieces', () => {
    const [n] = names(
      doc7('0 @I1@ INDI', '1 NAME A B /C/', '2 GIVN A', '2 GIVN B'),
    );
    expect(n!.pieces.givn).toBe('A B');
  });

  it('5.5.1: upper-cases TYPE, reads FONE and ROMN', () => {
    const list = names(
      doc5(
        '0 @I1@ INDI',
        '1 NAME Maria /Smith/',
        '2 TYPE maiden',
        '1 NAME Mary /Smith/',
        '2 TYPE religious',
        '2 ROMN Mari /Smits/',
        '3 TYPE user_defined',
        '2 FONE マリア',
      ),
    );
    expect(list.map((n) => n.type)).toEqual(['MAIDEN', 'RELIGIOUS']);
    expect(list[1]!.translations.map((t) => t.display)).toEqual([
      'Mari Smits',
      'マリア',
    ]);
    expect(list[1]!.translations[0]!.lang).toBeUndefined();
  });

  it('handles odd payloads', () => {
    const list = names(
      doc7(
        '0 @I1@ INDI',
        '1 NAME',
        '2 GIVN Only',
        '1 NAME //',
        '1 NAME /Only/',
      ),
    );
    expect(list.map((n) => n.display)).toEqual(['', '', 'Only']);
    expect(list[0]!.pieces.givn).toBe('Only');
  });
});
