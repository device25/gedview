import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {child, children} from './nodes';
import {parseGedcom} from './parse';
import {VOID_POINTER, type ParseWarning} from './types';

const FIXTURES = join(import.meta.dirname, '../../tests/fixtures/gedcom70');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

const doc7 = (...body: string[]) =>
  ['0 HEAD', '1 GEDC', '2 VERS 7.0', ...body, '0 TRLR'].join('\n');
const doc5 = (...body: string[]) =>
  [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    ...body,
    '0 TRLR',
  ].join('\n');

const codes = (warnings: ParseWarning[]) => warnings.map((w) => w.code);

describe('line terminators and framing', () => {
  const body = ['0 @I1@ INDI', '1 NAME John /Doe/', '1 SEX M'];

  for (const [label, eol] of [
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ] as const) {
    it(`reads ${label} files`, () => {
      const r = parseGedcom(
        doc7(...body)
          .split('\n')
          .join(eol),
      );
      expect(r.warnings).toEqual([]);
      const indi = r.byId.get('I1')!;
      expect(child(indi, 'NAME')?.value).toBe('John /Doe/');
      expect(child(indi, 'SEX')?.value).toBe('M');
      expect(indi.line).toBe(4);
    });
  }

  it('ignores a UTF-8 byte-order mark character and blank lines', () => {
    const r = parseGedcom(
      '﻿' + doc7(...body).replace('0 @I1@', '\n0 @I1@') + '\n\n',
    );
    expect(r.warnings).toEqual([]);
    expect(r.records.map((x) => x.tag)).toEqual(['HEAD', 'INDI', 'TRLR']);
  });

  it('numbers lines from 1 in the source file', () => {
    const r = parseGedcom(doc7('0 @I1@ INDI', '1 NAME A /B/'));
    expect(r.records[0]!.line).toBe(1);
    expect(r.byId.get('I1')!.children[0]!.line).toBe(5);
  });
});

describe('line grammar', () => {
  it('keeps everything after the single delimiter as the value', () => {
    const r = parseGedcom(
      doc7('0 @I1@ INDI', '1 NOTE  two leading spaces and trailing  '),
    );
    expect(child(r.byId.get('I1')!, 'NOTE')?.value).toBe(
      ' two leading spaces and trailing  ',
    );
  });

  it('reads a tag without value', () => {
    const r = parseGedcom(doc7('0 @I1@ INDI', '1 BIRT', '1 DEAT '));
    const indi = r.byId.get('I1')!;
    expect(child(indi, 'BIRT')?.value).toBeUndefined();
    expect(child(indi, 'DEAT')?.value).toBeUndefined();
  });

  it('accepts records without an xref', () => {
    const r = parseGedcom(doc7('0 INDI', '1 NOTE x'));
    expect(r.records[1]!.tag).toBe('INDI');
    expect(r.records[1]!.xref).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('accepts long and unusual xref ids', () => {
    const r = parseGedcom(
      doc7('0 @0XFFFFFFFF@ INDI', '0 @_@ INDI', '0 @1@ INDI'),
    );
    expect([...r.byId.keys()].sort()).toEqual(['0XFFFFFFFF', '1', '_']);
  });

  it('warns about lines that are not GEDCOM and skips them', () => {
    const r = parseGedcom(
      doc7(
        '0 @I1@ INDI',
        'this is not a line',
        '1 NAME A /B/',
        'x 1 BIRT',
        '1 @@ FOO',
        '1 BIRT still',
      ),
    );
    expect(
      r.warnings.filter((w) => w.code === 'BAD_LINE').length,
    ).toBeGreaterThanOrEqual(3);
    expect(child(r.byId.get('I1')!, 'NAME')?.value).toBe('A /B/');
    for (const w of r.warnings) expect(w.line).toBeGreaterThan(0);
  });

  it('warns about a level jump and reads the line one level below its parent', () => {
    const r = parseGedcom(doc7('0 @I1@ INDI', '1 BIRT', '3 DATE 1900'));
    expect(codes(r.warnings)).toEqual(['LEVEL_JUMP']);
    expect(r.warnings[0]!.line).toBe(6);
    expect(child(child(r.byId.get('I1')!, 'BIRT')!, 'DATE')?.value).toBe(
      '1900',
    );
  });

  it('skips lines before the first record and lines without a parent', () => {
    const r = parseGedcom(
      ['1 NAME x', '0 HEAD', '0 @I1@ INDI', '1 BIRT', '2 DATE 1900'].join('\n'),
    );
    expect(codes(r.warnings)).toContain('BAD_LINE');
    expect(r.records.map((x) => x.tag)).toEqual(['HEAD', 'INDI']);
  });

  it('refuses absurd nesting without blowing the stack', () => {
    const lines = ['0 @I1@ INDI'];
    for (let level = 1; level <= 5000; level++) lines.push(`${level} NOTE x`);
    const r = parseGedcom(doc7(...lines));
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.byId.has('I1')).toBe(true);
  });

  it('tolerates tabs as delimiters with a warning', () => {
    const r = parseGedcom(doc7('0\t@I1@\tINDI', '1\tNAME\tJohn /Doe/'));
    expect(r.byId.get('I1')).toBeDefined();
    expect(child(r.byId.get('I1')!, 'NAME')?.value).toBe('John /Doe/');
    expect(codes(r.warnings)).toEqual(['TAB_DELIMITER', 'TAB_DELIMITER']);
  });

  it('keeps tabs inside values without a warning', () => {
    const r = parseGedcom(doc7('0 @I1@ INDI', '1 NOTE a\tb'));
    expect(child(r.byId.get('I1')!, 'NOTE')?.value).toBe('a\tb');
    expect(r.warnings).toEqual([]);
  });

  it('tolerates leading whitespace: silently in 5.5.1, with a warning in 7.0', () => {
    const lines = ['  0 @I1@ INDI', ' 1 NAME A /B/'];
    const r7 = parseGedcom(doc7(...lines));
    expect(codes(r7.warnings)).toEqual([
      'LEADING_WHITESPACE',
      'LEADING_WHITESPACE',
    ]);
    expect(child(r7.byId.get('I1')!, 'NAME')?.value).toBe('A /B/');
    const r5 = parseGedcom(doc5(...lines));
    expect(codes(r5.warnings)).toEqual([
      'LEADING_WHITESPACE',
      'LEADING_WHITESPACE',
    ]);
  });

  it('warns about a duplicated xref and keeps the first record', () => {
    const r = parseGedcom(
      doc7(
        '0 @I1@ INDI',
        '1 NAME First /X/',
        '0 @I1@ INDI',
        '1 NAME Second /X/',
      ),
    );
    expect(codes(r.warnings)).toEqual(['DUPLICATE_XREF']);
    expect(child(r.byId.get('I1')!, 'NAME')?.value).toBe('First /X/');
  });

  it('never throws on garbage', () => {
    const noise =
      '\u0000\u0001ÿþ0 HEAD\n\r\r\n@@@\n1\n 1 \n0 @\n0 @@ X\n'.repeat(50);
    expect(() => parseGedcom(noise)).not.toThrow();
    expect(() => parseGedcom('')).not.toThrow();
    expect(parseGedcom('').records).toEqual([]);
    expect(() => parseGedcom('﻿')).not.toThrow();
  });
});

describe('CONT and CONC', () => {
  it('merges CONT into the value with line feeds and keeps empty lines', () => {
    const r = parseGedcom(
      doc7(
        '0 @I1@ INDI',
        '1 NOTE first',
        '2 CONT second',
        '2 CONT',
        '2 CONT   fourth with spaces',
        '1 SEX M',
      ),
    );
    const note = child(r.byId.get('I1')!, 'NOTE')!;
    expect(note.value).toBe('first\nsecond\n\n  fourth with spaces');
    expect(note.children).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(child(r.byId.get('I1')!, 'SEX')?.value).toBe('M');
  });

  it('merges CONT into a payload that starts with a line break', () => {
    const r = parseGedcom(doc7('0 @I1@ INDI', '1 NOTE', '2 CONT second'));
    expect(child(r.byId.get('I1')!, 'NOTE')?.value).toBe('\nsecond');
  });

  it('merges CONC in 5.5.1 without a warning', () => {
    const r = parseGedcom(
      doc5(
        '0 @I1@ INDI',
        '1 NOTE Hello wor',
        '2 CONC ld, and goodb',
        '2 CONC ye',
        '2 CONT next line',
      ),
    );
    expect(child(r.byId.get('I1')!, 'NOTE')?.value).toBe(
      'Hello world, and goodbye\nnext line',
    );
    expect(r.warnings).toEqual([]);
  });

  it('merges CONC in 7.0 with one CONC_IN_V7 warning', () => {
    const r = parseGedcom(
      doc7(
        '0 @I1@ INDI',
        '1 NOTE Hello wor',
        '2 CONC ld',
        '1 SOUR @S1@',
        '0 @S1@ SOUR',
        '1 TEXT a',
        '2 CONC b',
      ),
    );
    expect(child(r.byId.get('I1')!, 'NOTE')?.value).toBe('Hello world');
    expect(codes(r.warnings)).toEqual(['CONC_IN_V7']);
  });

  it('keeps the substructures that follow a continued value', () => {
    const r = parseGedcom(
      doc7(
        '0 @I1@ INDI',
        '1 NOTE a',
        '2 CONT b',
        '2 MIME text/plain',
        '2 LANG ru',
      ),
    );
    const note = child(r.byId.get('I1')!, 'NOTE')!;
    expect(note.value).toBe('a\nb');
    expect(note.children.map((c) => c.tag)).toEqual(['MIME', 'LANG']);
  });

  it('drops anything that hangs below a continuation line', () => {
    const r = parseGedcom(
      doc7('0 @I1@ INDI', '1 NOTE a', '2 CONT b', '3 DATE 1900', '2 LANG ru'),
    );
    const note = child(r.byId.get('I1')!, 'NOTE')!;
    expect(note.children.map((c) => c.tag)).toEqual(['LANG']);
  });
});

describe('@ escapes and pointers', () => {
  it('7.0 un-doubles only the leading @ of each line', () => {
    const r = parseGedcom(fixture('escapes.ged'));
    const note = child(r.byId.get('I1')!, 'NOTE')!;
    expect(note.value).toBe(
      [
        'me@example.com is an example email address.',
        '@me and @I are example social media handles.',
        '@@@@ has four @ characters where only the first is escaped.',
      ].join('\n'),
    );
    const value = (id: string) => r.byId.get(id)!.value;
    expect(value('N01')).toBe('@ one leading');
    expect(value('N02')).toBe('@one leading no space');
    expect(value('N05')).toBe(
      'doubled @@ internal has two @ characters, not escaped',
    );
    expect(value('N06')).toBe('doubled@@internal no space');
    expect(value('N07')).toBe('single @ internal');
    expect(value('N08')).toBe('single@internal no space');
    expect(value('N19')).toBe(
      "@ at at front and @ inside line and \n@ at after CONT and @ inside CONT's line too.",
    );
    expect(r.warnings).toEqual([]);
  });

  it('5.5.1 un-doubles every @@', () => {
    const r = parseGedcom(
      doc5(
        '0 @I1@ INDI',
        '1 NOTE write to me@@example.com',
        '2 CONT @@handle and a@@@@b',
      ),
    );
    expect(child(r.byId.get('I1')!, 'NOTE')?.value).toBe(
      'write to me@example.com\n@handle and a@@b',
    );
  });

  it('reads pointers without the @ signs', () => {
    const r = parseGedcom(
      doc7('0 @I1@ INDI', '1 FAMS @F1@', '0 @F1@ FAM', '1 HUSB @I1@'),
    );
    const fams = child(r.byId.get('I1')!, 'FAMS')!;
    expect(fams.pointer).toBe(true);
    expect(fams.value).toBe('F1');
    expect(r.warnings).toEqual([]);
  });

  it('reads @VOID@ as a pointer with the VOID value and does not warn', () => {
    const r = parseGedcom(fixture('voidptr.ged'));
    const i1 = r.byId.get('I1')!;
    const [voidFams, realFams] = children(i1, 'FAMS');
    expect(voidFams).toMatchObject({pointer: true, value: VOID_POINTER});
    expect(voidFams!.children[0]!.tag).toBe('NOTE');
    expect(realFams).toMatchObject({pointer: true, value: 'F1'});
    expect(child(i1, 'FAMC')).toMatchObject({
      pointer: true,
      value: VOID_POINTER,
    });
    expect(r.warnings).toEqual([]);
  });

  it('does not take a date escape for a pointer', () => {
    const r = parseGedcom(
      doc5('0 @I1@ INDI', '1 BIRT', '2 DATE @#DJULIAN@ 1 JAN 1900'),
    );
    const date = child(child(r.byId.get('I1')!, 'BIRT')!, 'DATE')!;
    expect(date.pointer).toBeUndefined();
    expect(date.value).toBe('@#DJULIAN@ 1 JAN 1900');
  });

  it('warns about pointers to missing records', () => {
    const r = parseGedcom(
      doc7('0 @I1@ INDI', '1 FAMS @F9@', '1 SOUR @VOID@', '2 PAGE 3'),
    );
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({code: 'UNDEFINED_XREF', line: 5});
    expect(r.warnings[0]!.message).toContain('F9');
  });
});

describe('header', () => {
  it('reads the version, SCHMA, place form and language', () => {
    const r = parseGedcom(
      [
        '0 HEAD',
        '1 GEDC',
        '2 VERS 7.0.18',
        '1 LANG ru',
        '1 PLAC',
        '2 FORM City,  County , State, Country',
        '1 SCHMA',
        '2 TAG _FOO https://example.com/foo',
        '2 TAG _BAR https://example.com/bar  ',
        '0 @I1@ INDI',
        '1 _FOO x',
        '0 TRLR',
      ].join('\n'),
    );
    expect(r.version).toEqual({raw: '7.0.18', major: '7'});
    expect(r.language).toBe('ru');
    expect(r.placeForm).toEqual(['City', 'County', 'State', 'Country']);
    expect([...r.schema]).toEqual([
      ['_FOO', 'https://example.com/foo'],
      ['_BAR', 'https://example.com/bar'],
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('classifies 5.5.1, 5.5 and unknown versions', () => {
    expect(parseGedcom(doc5()).version).toEqual({raw: '5.5.1', major: '5'});
    expect(
      parseGedcom(['0 HEAD', '1 GEDC', '2 VERS 5.5', '0 TRLR'].join('\n'))
        .version.major,
    ).toBe('5');
    expect(
      parseGedcom(['0 HEAD', '1 GEDC', '2 VERS 4.0', '0 TRLR'].join('\n'))
        .version.major,
    ).toBe('unknown');
    expect(parseGedcom(['0 HEAD', '0 TRLR'].join('\n')).version).toEqual({
      major: 'unknown',
    });
    expect(
      parseGedcom(['0 HEAD', '1 CHAR ASCII', '0 TRLR'].join('\n')).version,
    ).toEqual({major: '5'});
  });

  it('empty language / place form / schema when absent', () => {
    const r = parseGedcom(doc7());
    expect(r.language).toBeUndefined();
    expect(r.placeForm).toEqual([]);
    expect(r.schema.size).toBe(0);
  });
});

describe('extensions and values', () => {
  it('reports an undocumented extension tag once, not a documented one', () => {
    const r = parseGedcom(
      [
        '0 HEAD',
        '1 GEDC',
        '2 VERS 7.0',
        '1 SCHMA',
        '2 TAG _DOC https://example.com/doc',
        '0 @I1@ INDI',
        '1 _DOC a',
        '1 _UNDOC a',
        '1 _UNDOC b',
        '2 _INNER c',
        '0 TRLR',
      ].join('\n'),
    );
    expect(r.warnings.map((w) => [w.code, w.line])).toEqual([
      ['UNDOCUMENTED_EXTENSION', 8],
    ]);
  });

  it('does not report extension tags in 5.5.1 files, which cannot declare them', () => {
    const r = parseGedcom(doc5('0 @I1@ INDI', '1 _FSFTID X1'));
    expect(r.warnings).toEqual([]);
  });

  it('does not judge the contents of extension structures', () => {
    const r = parseGedcom(
      doc7('0 @I1@ INDI', '1 _FOO bar', '2 DATE not a date', '2 AGE nonsense'),
    );
    expect(codes(r.warnings)).toEqual(['UNDOCUMENTED_EXTENSION']);
  });

  it('warns about unreadable dates and ages', () => {
    const r = parseGedcom(
      doc7(
        '0 @I1@ INDI',
        '1 BIRT',
        '2 DATE 31 FOO 1900',
        '2 AGE 5 years',
        '1 DEAT',
        '2 DATE BET 1900',
        '1 CHR',
        '2 DATE JULIAN 1 JAN 1900',
        '2 AGE < 3m 2w',
      ),
    );
    expect(r.warnings.map((w) => [w.code, w.line])).toEqual([
      ['BAD_DATE', 6],
      ['BAD_AGE', 7],
      ['BAD_DATE', 9],
    ]);
  });

  it('cuts a flood of warnings', () => {
    const lines = ['0 @I1@ INDI'];
    for (let i = 0; i < 5000; i++) lines.push('1 DATE nonsense');
    const r = parseGedcom(doc7(...lines));
    expect(r.warnings.length).toBeLessThan(2100);
    expect(r.warnings.at(-1)!.code).toBe('TOO_MANY_WARNINGS');
  });
});
