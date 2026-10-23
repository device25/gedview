import {describe, expect, it} from 'vitest';
import {doc5, doc7, treeOf} from './test-utils';

const events = (...lines: string[]) =>
  treeOf(doc7('0 @I1@ INDI', ...lines)).indis.get('I1')!.events;
const famEvents = (...lines: string[]) =>
  treeOf(doc7('0 @I1@ INDI', '0 @F1@ FAM', ...lines)).fams.get('F1')!.events;

describe('event details', () => {
  it('reads the common substructures', () => {
    const [e] = events(
      '1 DEAT Y',
      '2 TYPE deat type',
      '2 DATE 28 MAR 2022',
      '3 TIME 16:47',
      '3 PHRASE a phrase',
      '2 PLAC Somewhere',
      '2 AGE 8d',
      '3 PHRASE Age phrase',
      '2 AGNC Agency',
      '2 RELI Religion',
      '2 CAUS Cause of death',
      '2 RESN CONFIDENTIAL, LOCKED',
      '2 SDATE 29 MAR 2022',
      '2 UID u-1',
      '2 UID u-2',
      '2 NOTE Note text',
      '2 SOUR @VOID@',
      '3 PAGE 1',
    );
    expect(e).toMatchObject({
      tag: 'DEAT',
      value: 'Y',
      type: 'deat type',
      cause: 'Cause of death',
      agency: 'Agency',
      religion: 'Religion',
      restrictions: ['CONFIDENTIAL', 'LOCKED'],
      uids: ['u-1', 'u-2'],
      age: {raw: '8d', days: 8, phrase: 'Age phrase'},
    });
    expect(e!.date).toMatchObject({time: '16:47', phrase: 'a phrase'});
    expect(e!.sortDate!.raw).toBe('29 MAR 2022');
    expect(e!.place!.raw).toBe('Somewhere');
    expect(e!.notes).toHaveLength(1);
    expect(e!.citations).toHaveLength(1);
    expect(e!.node.tag).toBe('DEAT');
  });

  it('keeps attribute payloads and TYPE', () => {
    const list = events(
      '1 OCCU Волостной староста',
      '2 TYPE Должность',
      '1 FACT Fact',
      '2 TYPE Kind',
      '1 NCHI 3',
      '1 RELI Orthodox',
    );
    expect(list.map((e) => [e.tag, e.value, e.type])).toEqual([
      ['OCCU', 'Волостной староста', 'Должность'],
      ['FACT', 'Fact', 'Kind'],
      ['NCHI', '3', undefined],
      ['RELI', 'Orthodox', undefined],
    ]);
  });

  it('has no value for an event without payload', () => {
    expect(events('1 BIRT')[0]!.value).toBeUndefined();
  });

  it('reads the ages of the partners in family events', () => {
    const [e] = famEvents(
      '1 MARR Y',
      '2 HUSB',
      '3 AGE 25y',
      '4 PHRASE Adult',
      '2 WIFE',
      '3 AGE > 18y',
    );
    expect(e!.husbandAge).toEqual({raw: '25y', years: 25, phrase: 'Adult'});
    expect(e!.wifeAge).toEqual({raw: '> 18y', bound: '>', years: 18});
    expect(e!.age).toBeUndefined();
  });

  it('reads FAMC of BIRT, CHR and ADOP', () => {
    const list = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 BIRT',
        '2 FAMC @F1@',
        '1 ADOP',
        '2 FAMC @F2@',
        '3 ADOP BOTH',
        '4 PHRASE Adoption phrase',
        '1 ADOP',
        '2 FAMC @VOID@',
        '0 @F1@ FAM',
        '0 @F2@ FAM',
      ),
    ).indis.get('I1')!.events;
    expect(list.map((e) => [e.tag, e.famId, e.adoptedBy])).toEqual([
      ['BIRT', 'F1', undefined],
      ['ADOP', 'F2', 'BOTH'],
      ['ADOP', undefined, undefined],
    ]);
  });

  it('reads address, contacts, temple and status', () => {
    const [e] = events(
      '1 SLGC',
      '2 TEMP SLAKE',
      '2 STAT BIC',
      '3 DATE 27 MAR 2022',
      '2 ADDR 1 Main St',
      '3 CONT Town',
      '2 PHON 1',
      '2 EMAIL a@b',
      '2 WWW http://x',
    );
    expect(e).toMatchObject({
      tag: 'SLGC',
      temple: 'SLAKE',
      status: 'BIC',
      address: '1 Main St\nTown',
      contacts: [
        {kind: 'PHON', value: '1'},
        {kind: 'EMAIL', value: 'a@b'},
        {kind: 'WWW', value: 'http://x'},
      ],
    });
  });

  it('includes every individual event, attribute and ordinance, and nothing else', () => {
    const tags = [
      'ADOP',
      'BAPM',
      'BARM',
      'BASM',
      'BIRT',
      'BLES',
      'BURI',
      'CENS',
      'CHR',
      'CHRA',
      'CONF',
      'CREM',
      'DEAT',
      'EMIG',
      'FCOM',
      'GRAD',
      'IMMI',
      'NATU',
      'ORDN',
      'PROB',
      'RETI',
      'WILL',
      'CAST',
      'DSCR',
      'EDUC',
      'IDNO',
      'NATI',
      'NCHI',
      'NMR',
      'OCCU',
      'PROP',
      'RELI',
      'RESI',
      'SSN',
      'TITL',
      'BAPL',
      'CONL',
      'ENDL',
      'INIL',
      'SLGC',
    ];
    const list = events(
      '1 NAME x',
      '1 SEX M',
      ...tags.map((t) => `1 ${t} x`),
      '1 EVEN e',
      '2 TYPE t',
      '1 FACT f',
      '2 TYPE t',
      '1 NOTE n',
      '1 SOUR @VOID@',
      '1 NO DIV',
      '1 _EXT y',
    );
    expect(list.map((e) => e.tag).sort()).toEqual(
      [...tags, 'EVEN', 'FACT'].sort(),
    );
  });

  it('includes every family event, attribute and sealing', () => {
    const tags = [
      'ANUL',
      'CENS',
      'DIV',
      'DIVF',
      'ENGA',
      'MARB',
      'MARC',
      'MARL',
      'MARR',
      'MARS',
      'NCHI',
      'RESI',
      'SLGS',
    ];
    const list = famEvents(
      '1 HUSB @I1@',
      ...tags.map((t) => `1 ${t} Y`),
      '1 EVEN e',
      '2 TYPE t',
      '1 FACT f',
      '2 TYPE t',
      '1 NO MARR',
    );
    expect(list.map((e) => e.tag).sort()).toEqual(
      [...tags, 'EVEN', 'FACT'].sort(),
    );
  });
});

describe('event order', () => {
  it('sorts by DATE, with undated events last, keeping file order among equals', () => {
    const list = events(
      '1 BURI',
      '1 DEAT',
      '2 DATE 1950',
      '1 BIRT',
      '2 DATE 1900',
      '1 CHR',
      '2 DATE 1900',
      '1 OCCU Smith',
      '1 GRAD',
      '2 DATE 1925',
    );
    expect(list.map((e) => e.tag)).toEqual([
      'BIRT',
      'CHR',
      'GRAD',
      'DEAT',
      'BURI',
      'OCCU',
    ]);
  });

  it('sorts by SDATE when there is one', () => {
    const list = events(
      '1 RESI A',
      '2 DATE BET 1880 AND 1890',
      '2 SDATE 1950',
      '1 DEAT',
      '2 DATE 1940',
      '1 BIRT',
      '2 DATE 1900',
    );
    expect(list.map((e) => e.tag)).toEqual(['BIRT', 'DEAT', 'RESI']);
  });

  it('sorts dates of different calendars correctly', () => {
    const list = events(
      '1 CHR',
      '2 DATE JULIAN 8 APR 1889', // = 20 APR 1889
      '1 BIRT',
      '2 DATE 18 APR 1889',
      '1 BAPM',
      '2 DATE JULIAN 6 APR 1889', // = 18 APR 1889: same day as BIRT
    );
    expect(list.map((e) => e.tag)).toEqual(['BIRT', 'BAPM', 'CHR']);
  });

  it('puts events with an unreadable date among the undated', () => {
    const list = events('1 DEAT', '2 DATE gibberish', '1 BIRT', '2 DATE 1900');
    expect(list.map((e) => e.tag)).toEqual(['BIRT', 'DEAT']);
  });

  it('sorts family events too', () => {
    const list = famEvents('1 DIV', '2 DATE 1920', '1 MARR', '2 DATE 1900');
    expect(list.map((e) => e.tag)).toEqual(['MARR', 'DIV']);
  });
});

describe('NO structures', () => {
  it('reads the event type, period, notes and citations', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 NO NATU',
        '2 DATE FROM 1700 TO 1800',
        '3 PHRASE No date phrase',
        '2 NOTE Note text',
        '2 SOUR @VOID@',
        '3 PAGE 1',
        '1 NO EMIG',
        '0 @F1@ FAM',
        '1 NO DIV',
      ),
    );
    const [natu, emig] = tree.indis.get('I1')!.nonEvents;
    expect(natu).toMatchObject({tag: 'NATU'});
    expect(natu!.date).toMatchObject({phrase: 'No date phrase'});
    expect(natu!.date!.value).toMatchObject({
      kind: 'period',
      from: {year: 1700},
      to: {year: 1800},
    });
    expect(natu!.notes.map((n) => n.text)).toEqual(['Note text']);
    expect(natu!.citations).toHaveLength(1);
    expect(emig).toEqual({tag: 'EMIG', notes: [], citations: []});
    expect(tree.fams.get('F1')!.nonEvents.map((n) => n.tag)).toEqual(['DIV']);
  });

  it('keeps NO out of the events', () => {
    expect(events('1 NO DIV')).toEqual([]);
  });
});

describe('5.5.1 events', () => {
  it('reads dates with calendar escapes, date phrases and AGE words', () => {
    const tree = treeOf(
      doc5(
        '0 @I1@ INDI',
        '1 BIRT',
        '2 DATE (about Easter)',
        '2 PLAC Tver',
        '1 CHR',
        '2 DATE @#DJULIAN@ 8 APR 1889',
        '2 AGE INFANT',
      ),
    );
    const [chr, birt] = tree.indis.get('I1')!.events;
    expect(chr!.tag).toBe('CHR');
    expect(chr!.date!.value).toMatchObject({
      kind: 'exact',
      date: {calendar: 'JULIAN', day: 8},
    });
    expect(chr!.age).toEqual({raw: 'INFANT', phrase: 'INFANT'});
    expect(birt!.date).toMatchObject({
      value: {kind: 'empty'},
      phrase: 'about Easter',
    });
  });
});
