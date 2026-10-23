import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {doc5, doc7, treeOf} from './test-utils';

const fixture = (name: string) =>
  readFileSync(
    join(import.meta.dirname, '../../tests/fixtures/gedcom70', name),
    'utf8',
  );

describe('IndiView', () => {
  it('reads sex, defaulting to undefined for unknown values', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 SEX M',
        '0 @I2@ INDI',
        '1 SEX f',
        '0 @I3@ INDI',
        '1 SEX X',
        '0 @I4@ INDI',
        '1 SEX U',
        '0 @I5@ INDI',
        '1 SEX Q',
        '0 @I6@ INDI',
      ),
    );
    expect([...tree.indis.values()].map((i) => i.sex)).toEqual([
      'M',
      'F',
      'X',
      'U',
      undefined,
      undefined,
    ]);
  });

  it('reads FAMC with PEDI and STAT, each with PHRASE', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 FAMC @F1@',
        '2 PEDI OTHER',
        '3 PHRASE Other type',
        '2 STAT CHALLENGED',
        '3 PHRASE Phrase',
        '1 FAMC @F2@',
        '2 PEDI ADOPTED',
        '2 STAT PROVEN',
        '1 FAMC @F3@',
        '2 PEDI birth',
        '2 STAT disproven',
        '1 FAMC @F4@',
        '2 STAT strange',
        '1 FAMC @VOID@',
        '2 PEDI ADOPTED',
        '1 FAMC @F99@',
        '0 @F1@ FAM',
        '0 @F2@ FAM',
        '0 @F3@ FAM',
        '0 @F4@ FAM',
      ),
    );
    const famc = tree.indis.get('I1')!.famc;
    expect(famc.map((l) => l.famId)).toEqual(['F1', 'F2', 'F3', 'F4']); // VOID and dangling dropped
    expect(famc[0]).toMatchObject({
      pedigree: 'OTHER',
      pedigreePhrase: 'Other type',
      status: 'CHALLENGED',
      statusPhrase: 'Phrase',
    });
    expect(famc[1]).toMatchObject({pedigree: 'ADOPTED', status: 'PROVEN'});
    expect(famc[2]).toMatchObject({pedigree: 'BIRTH', status: 'DISPROVEN'});
    expect(famc[3]!.status).toBeUndefined();
  });

  it('lists FAMS without duplicates, VOID or dangling pointers', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 FAMS @F1@',
        '1 FAMS @VOID@',
        '2 NOTE x',
        '1 FAMS @F1@',
        '1 FAMS @F9@',
        '1 FAMS @I1@',
        '0 @F1@ FAM',
      ),
    );
    expect(tree.indis.get('I1')!.fams).toEqual(['F1']);
  });

  it('lists extensions with their SCHMA URI', () => {
    const tree = treeOf(
      [
        '0 HEAD',
        '1 GEDC',
        '2 VERS 7.0',
        '1 SCHMA',
        '2 TAG _DOC https://example.com/doc',
        '0 @I1@ INDI',
        '1 _DOC a',
        '2 SUB b',
        '1 _OTHER c',
        '0 TRLR',
      ].join('\n'),
    );
    const ext = tree.indis.get('I1')!.extensions;
    expect(ext.map((e) => [e.tag, e.uri, e.node.value])).toEqual([
      ['_DOC', 'https://example.com/doc', 'a'],
      ['_OTHER', undefined, 'c'],
    ]);
  });

  it('has a link to the raw record', () => {
    const tree = treeOf(doc7('0 @I1@ INDI', '1 NAME a'));
    expect(tree.indis.get('I1')!.node!.xref).toBe('I1');
  });

  it('skips INDI records without id', () => {
    const tree = treeOf(doc7('0 INDI', '1 NAME x', '0 @I1@ INDI'));
    expect([...tree.indis.keys()]).toEqual(['I1']);
  });
});

describe('FamView', () => {
  it('reads partners and children with their phrases and placeholders', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '0 @I2@ INDI',
        '0 @I4@ INDI',
        '0 @F1@ FAM',
        '1 HUSB @I1@',
        '2 PHRASE Husband phrase',
        '1 WIFE @I2@',
        '1 CHIL @I4@',
        '2 PHRASE First child',
        '1 CHIL @VOID@',
        '2 PHRASE Second child',
        '1 CHIL @I99@',
      ),
    );
    const fam = tree.fams.get('F1')!;
    expect(fam.partners).toEqual([
      {role: 'HUSB', indiId: 'I1', phrase: 'Husband phrase'},
      {role: 'WIFE', indiId: 'I2'},
    ]);
    expect(fam.children).toEqual([
      {indiId: 'I4', phrase: 'First child'},
      {phrase: 'Second child'},
      {},
    ]);
  });

  it('keeps two husbands (7.0 does not imply sex)', () => {
    const tree = treeOf(fixture('same-sex-marriage.ged'));
    const fam = tree.fams.get('F1')!;
    expect(fam.partners.map((p) => [p.role, p.indiId])).toEqual([
      ['HUSB', 'I1'],
      ['WIFE', 'I2'],
    ]);
    expect(tree.indis.get('I1')!.sex).toBe('M');
    expect(tree.indis.get('I2')!.sex).toBe('M');
  });

  it('keeps a VOID partner as a partner with a phrase', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '0 @F1@ FAM',
        '1 HUSB @I1@',
        '1 WIFE @VOID@',
        '2 PHRASE Unknown wife',
      ),
    );
    expect(tree.fams.get('F1')!.partners[1]).toEqual({
      role: 'WIFE',
      phrase: 'Unknown wife',
    });
  });

  it('reads family events, NO, attributes and the rest', () => {
    const tree = treeOf(
      doc7(
        '0 @F1@ FAM',
        '1 RESN CONFIDENTIAL',
        '1 NCHI 2',
        '1 MARR Y',
        '2 DATE 1900',
        '1 NO DIV',
        '1 NOTE n',
        '1 SOUR @VOID@',
        '2 PAGE 1',
        '1 ASSO @VOID@',
        '2 ROLE OTHER',
        '1 UID u',
        '1 EXID 1',
        '2 TYPE http://example.com',
        '1 _X y',
      ),
    );
    const fam = tree.fams.get('F1')!;
    expect(fam.events.map((e) => e.tag)).toEqual(['MARR', 'NCHI']);
    expect(fam.nonEvents.map((n) => n.tag)).toEqual(['DIV']);
    expect(fam.restrictions).toEqual(['CONFIDENTIAL']);
    expect(fam.notes).toHaveLength(1);
    expect(fam.citations).toHaveLength(1);
    expect(fam.associations).toHaveLength(1);
    expect(fam.uids).toEqual(['u']);
    expect(fam.exids).toHaveLength(1);
    expect(fam.extensions!.map((e) => e.tag)).toEqual(['_X']);
  });
});

describe('links agree from both sides', () => {
  it('adds a CHIL-only child to FAMC and a FAMC-only child to the family', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '0 @I2@ INDI',
        '1 FAMC @F1@',
        '0 @I3@ INDI',
        '0 @F1@ FAM',
        '1 HUSB @I1@',
        '1 CHIL @I3@',
      ),
    );
    expect(tree.indis.get('I1')!.fams).toEqual(['F1']);
    expect(tree.indis.get('I3')!.famc.map((l) => l.famId)).toEqual(['F1']);
    expect(tree.fams.get('F1')!.children.map((c) => c.indiId)).toEqual([
      'I3',
      'I2',
    ]);
  });

  it('does not list a DISPROVEN child among the children of the family', () => {
    const tree = treeOf(
      doc7('0 @I1@ INDI', '1 FAMC @F1@', '2 STAT DISPROVEN', '0 @F1@ FAM'),
    );
    expect(tree.fams.get('F1')!.children).toEqual([]);
    expect(tree.childLinkStatus.get('F1|I1')).toEqual({status: 'DISPROVEN'});
  });

  it('collects FAMC.STAT for the chart styling, with phrases', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 FAMC @F1@',
        '2 STAT CHALLENGED',
        '3 PHRASE Not found',
        '0 @I2@ INDI',
        '1 FAMC @F1@',
        '2 STAT PROVEN',
        '0 @I3@ INDI',
        '1 FAMC @F1@',
        '0 @F1@ FAM',
      ),
    );
    expect([...tree.childLinkStatus]).toEqual([
      ['F1|I1', {status: 'CHALLENGED', phrase: 'Not found'}],
      ['F1|I2', {status: 'PROVEN'}],
    ]);
  });

  it('a second, undisputed link to the same family outweighs a disproven one', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 FAMC @F1@',
        '2 PEDI ADOPTED',
        '2 STAT PROVEN',
        '1 FAMC @F1@',
        '2 PEDI BIRTH',
        '2 STAT DISPROVEN',
        '0 @F1@ FAM',
        '1 CHIL @I1@',
      ),
    );
    expect(tree.childLinkStatus.get('F1|I1')).toEqual({status: 'PROVEN'});
  });

  it('works for files with persons only', () => {
    const tree = treeOf(fixture('xref.ged'));
    expect(tree.fams.size).toBe(0);
    expect(tree.indis.size).toBe(6);
    expect(tree.childLinkStatus.size).toBe(0);
  });
});

describe('SourceView', () => {
  it('reads titles, text, repositories and call numbers', () => {
    const tree = treeOf(fixture('maximal70.ged'));
    const s1 = tree.sources!.get('S1')!;
    expect(s1).toMatchObject({
      id: 'S1',
      title: 'Title',
      author: 'Author',
      abbreviation: 'Abbreviation',
      publication: 'Publication info',
      agency: 'Agency name',
    });
    expect(s1.text).toMatchObject({
      text: 'Source text',
      mime: 'text/plain',
      lang: 'en-US',
    });
    expect(s1.events).toHaveLength(2);
    expect(s1.events[0]!.types).toEqual(['BIRT', 'DEAT']);
    expect(s1.events[0]!.date).toMatchObject({phrase: '18th century'});
    expect(s1.events[0]!.place).toMatchObject({
      latitude: 18.150944,
      longitude: 168.150944,
    });
    expect(s1.repositories).toHaveLength(2);
    expect(s1.repositories[0]).toMatchObject({
      repoId: 'R1',
      name: 'Repository 1',
    });
    expect(s1.repositories[0]!.callNumbers).toEqual([
      {value: 'Call number', medium: 'BOOK'},
    ]);
    expect(s1.repositories[1]!.callNumbers).toHaveLength(10);
    expect(s1.exids).toHaveLength(2);
    expect(s1.media).toHaveLength(2);
    expect(tree.sources!.get('S2')!.title).toBe('Source Two');
  });

  it('keeps a repository id that does not exist without a name', () => {
    const tree = treeOf(doc7('0 @S1@ SOUR', '1 REPO @R9@', '2 CALN 12'));
    expect(tree.sources!.get('S1')!.repositories[0]).toEqual({
      callNumbers: [{value: '12'}],
      notes: [],
    });
  });

  it('5.5.1: reads sources like 7.0 ones', () => {
    const tree = treeOf(
      doc5(
        '0 @S1@ SOUR',
        '1 TITL A title',
        '1 TEXT Long',
        '2 CONC  text',
        '1 REPO @R1@',
        '2 CALN 5',
        '3 MEDI book',
        '0 @R1@ REPO',
        '1 NAME Archive',
      ),
    );
    const s = tree.sources!.get('S1')!;
    expect(s.text!.text).toBe('Long text');
    expect(s.repositories[0]).toMatchObject({
      name: 'Archive',
      callNumbers: [{value: '5', medium: 'BOOK'}],
    });
  });
});
