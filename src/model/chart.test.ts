import {describe, expect, it} from 'vitest';
import {parseDate} from '../gedcom/date';
import {buildChartData, toTopolaDate} from './chart';
import {doc7, SETTINGS, treeOf} from './test-utils';

const chart = (
  text: string,
  settings = {},
  media = new Map<string, string>(),
) => buildChartData(treeOf(text, media), {...SETTINGS, ...settings});
const indiOf = (data: ReturnType<typeof chart>, id: string) =>
  data.indis.find((i) => i.id === id)!;
const famOf = (data: ReturnType<typeof chart>, id: string) =>
  data.fams.find((f) => f.id === id)!;

describe('persons', () => {
  it('splits names into first and last name, with the maiden name', () => {
    const data = chart(
      doc7(
        '0 @I1@ INDI',
        '1 NAME Ванюша /Соколов/',
        '2 TYPE AKA',
        '1 NAME Мария Фёдоровна /Соколова/',
        '2 TYPE MARRIED',
        '1 NAME Мария Фёдоровна /Лаврова/',
        '2 TYPE MAIDEN',
        '1 SEX F',
      ),
    );
    expect(indiOf(data, 'I1')).toMatchObject({
      firstName: 'Мария Фёдоровна',
      lastName: 'Соколова',
      maidenName: 'Лаврова',
      sex: 'F',
    });
  });

  it('puts a suffix after the given names, keeps people without a name', () => {
    const data = chart(
      doc7(
        '0 @I1@ INDI',
        '1 NAME Joseph /de Allen/ jr.',
        '0 @I2@ INDI',
        '1 SEX X',
      ),
    );
    expect(indiOf(data, 'I1')).toMatchObject({
      firstName: 'Joseph jr.',
      lastName: 'de Allen',
    });
    const i2 = indiOf(data, 'I2');
    expect(i2.firstName).toBeUndefined();
    expect(i2.sex).toBeUndefined(); // topola knows only M and F
  });

  it('does not take the maiden name for the main name when it is the only one', () => {
    const data = chart(doc7('0 @I1@ INDI', '1 NAME A /B/', '2 TYPE MAIDEN'));
    expect(indiOf(data, 'I1')).toMatchObject({firstName: 'A', lastName: 'B'});
    expect(indiOf(data, 'I1').maidenName).toBeUndefined();
  });

  it('follows the display settings', () => {
    const text = doc7('0 @I1@ INDI');
    expect(
      indiOf(chart(text, {showIds: false, sexColors: false}), 'I1'),
    ).toMatchObject({hideId: true, hideSex: true});
    expect(
      indiOf(chart(text, {showIds: true, sexColors: true}), 'I1'),
    ).toMatchObject({hideId: false, hideSex: false});
  });

  it('works with individuals only', () => {
    const data = chart(
      doc7('0 @I1@ INDI', '1 NAME A /B/', '0 @I2@ INDI', '1 NAME C /D/'),
    );
    expect(data.fams).toEqual([]);
    expect(data.indis.map((i) => [i.id, i.fams, i.famc])).toEqual([
      ['I1', [], undefined],
      ['I2', [], undefined],
    ]);
  });
});

describe('families', () => {
  const people = ['0 @I1@ INDI', '0 @I2@ INDI', '0 @I3@ INDI', '0 @I4@ INDI'];

  it('lists partners, children and the marriage', () => {
    const data = chart(
      doc7(
        ...people,
        '0 @F1@ FAM',
        '1 HUSB @I1@',
        '1 WIFE @I2@',
        '1 CHIL @I3@',
        '1 CHIL @VOID@',
        '1 MARR',
        '2 DATE 1900',
        '2 PLAC Tver',
      ),
    );
    expect(famOf(data, 'F1')).toEqual({
      id: 'F1',
      husb: 'I1',
      wife: 'I2',
      children: ['I3'],
      marriage: {date: {year: 1900}, place: 'Tver', confirmed: true},
    });
    expect(indiOf(data, 'I1').fams).toEqual(['F1']);
    expect(indiOf(data, 'I3').famc).toBe('F1');
  });

  it('copes with a single partner and same-sex partners', () => {
    const data = chart(
      doc7(
        ...people,
        '0 @F1@ FAM',
        '1 WIFE @I2@',
        '1 CHIL @I3@',
        '0 @F2@ FAM',
        '1 HUSB @I1@',
        '1 WIFE @I4@',
      ),
    );
    expect(famOf(data, 'F1')).toMatchObject({wife: 'I2', children: ['I3']});
    expect(famOf(data, 'F1').husb).toBeUndefined();
    expect(famOf(data, 'F2')).toMatchObject({husb: 'I1', wife: 'I4'});
  });

  it('keeps several marriages in the order the person lists them', () => {
    const data = chart(
      doc7(
        '0 @I1@ INDI',
        '1 FAMS @F2@',
        '1 FAMS @F1@',
        '0 @F1@ FAM',
        '1 HUSB @I1@',
        '0 @F2@ FAM',
        '1 HUSB @I1@',
      ),
    );
    expect(indiOf(data, 'I1').fams).toEqual(['F2', 'F1']);
  });

  it('chooses the first non-disproven FAMC, preferring BIRTH or no PEDI', () => {
    const text = doc7(
      '0 @I1@ INDI',
      '1 FAMC @F1@',
      '2 PEDI ADOPTED',
      '1 FAMC @F2@',
      '2 STAT DISPROVEN',
      '1 FAMC @F3@',
      '2 PEDI BIRTH',
      '1 FAMC @F4@',
      '0 @F1@ FAM',
      '0 @F2@ FAM',
      '0 @F3@ FAM',
      '0 @F4@ FAM',
      '0 @I2@ INDI',
      '1 FAMC @F1@',
      '2 PEDI FOSTER',
      '1 FAMC @F2@',
      '2 PEDI ADOPTED',
      '2 STAT DISPROVEN',
    );
    const data = chart(text);
    expect(indiOf(data, 'I1').famc).toBe('F3');
    expect(indiOf(data, 'I2').famc).toBe('F1'); // the first live link when none is BIRTH
    // the adoptive family still lists the child
    expect(famOf(data, 'F1').children).toEqual(['I1', 'I2']);
    expect(famOf(data, 'F4').children).toEqual(['I1']);
  });

  it('a link without PEDI is as good as BIRTH', () => {
    const data = chart(
      doc7(
        '0 @I1@ INDI',
        '1 FAMC @F1@',
        '2 PEDI ADOPTED',
        '1 FAMC @F2@',
        '0 @F1@ FAM',
        '0 @F2@ FAM',
      ),
    );
    expect(indiOf(data, 'I1').famc).toBe('F2');
  });

  const disproven = doc7(
    '0 @I1@ INDI',
    '1 FAMC @F1@',
    '2 STAT DISPROVEN',
    '0 @I2@ INDI',
    '1 FAMC @F1@',
    '2 STAT DISPROVEN',
    '1 FAMC @F2@',
    '0 @I3@ INDI',
    '1 FAMC @F1@',
    '2 STAT CHALLENGED',
    '0 @F1@ FAM',
    '1 CHIL @I1@',
    '0 @F2@ FAM',
  );

  it('hides DISPROVEN links when asked to', () => {
    const data = chart(disproven, {disproven: 'hide'});
    expect(famOf(data, 'F1').children).toEqual(['I3']);
    expect(indiOf(data, 'I1').famc).toBeUndefined();
    expect(indiOf(data, 'I2').famc).toBe('F2');
    expect(famOf(data, 'F2').children).toEqual(['I2']);
    expect(indiOf(data, 'I3').famc).toBe('F1'); // CHALLENGED is still drawn
  });

  it('draws DISPROVEN links when asked to (dotted)', () => {
    const data = chart(disproven, {disproven: 'dotted'});
    expect(famOf(data, 'F1').children!.sort()).toEqual(['I1', 'I2', 'I3']);
    expect(indiOf(data, 'I1').famc).toBe('F1'); // the only link there is
    expect(indiOf(data, 'I2').famc).toBe('F2'); // a live link still comes first
  });

  it('cuts a loop of parents and children', () => {
    const data = chart(
      doc7(
        '0 @I1@ INDI',
        '0 @I2@ INDI',
        '0 @I3@ INDI',
        '0 @F1@ FAM',
        '1 HUSB @I1@',
        '1 CHIL @I2@',
        '0 @F2@ FAM',
        '1 HUSB @I2@',
        '1 CHIL @I3@',
        '0 @F3@ FAM',
        '1 HUSB @I3@',
        '1 CHIL @I1@',
        '0 @F4@ FAM',
        '1 HUSB @I3@',
        '1 CHIL @I3@',
      ),
    );
    const all = data.fams.flatMap((f) =>
      (f.children ?? []).map((c) => `${f.id}>${c}`),
    );
    // exactly one link of the loop and the self-link are gone
    expect(all).toHaveLength(2);
    expect(famOf(data, 'F4').children).toEqual([]);
    for (const i of data.indis) {
      const seen = new Set<string>();
      let current: string | undefined = i.id;
      while (current && !seen.has(current)) {
        seen.add(current);
        const fam = data.fams.find(
          (f) => f.id === data.indis.find((x) => x.id === current)!.famc,
        );
        current = fam?.husb;
      }
      expect(current, `ancestors of ${i.id} end`).toBeUndefined();
    }
  });
});

describe('dates', () => {
  const birth = (date: string, settings = {}) =>
    indiOf(
      chart(doc7('0 @I1@ INDI', '1 BIRT', `2 DATE ${date}`), settings),
      'I1',
    ).birth;

  it('hands Gregorian dates to topola as numbers', () => {
    expect(birth('6 APR 1889')!.date).toEqual({day: 6, month: 4, year: 1889});
    expect(birth('APR 1889')!.date).toEqual({month: 4, year: 1889});
    expect(birth('1889')!.date).toEqual({year: 1889});
    expect(birth('ABT 1889')!.date).toEqual({qualifier: 'abt', year: 1889});
    expect(birth('CAL 1889')!.date).toEqual({qualifier: 'cal', year: 1889});
    expect(birth('EST 1889')!.date).toEqual({qualifier: 'est', year: 1889});
  });

  it('converts ranges and periods', () => {
    expect(birth('BET 1890 AND 1892')!.dateRange).toEqual({
      from: {year: 1890},
      to: {year: 1892},
    });
    expect(birth('BEF 1890')!.dateRange).toEqual({to: {year: 1890}});
    expect(birth('AFT 1890')!.dateRange).toEqual({from: {year: 1890}});
    expect(birth('FROM 1890 TO 1892')!.dateRange).toEqual({
      from: {year: 1890},
      to: {year: 1892},
    });
    expect(birth('FROM 1890')!.dateRange).toEqual({from: {year: 1890}});
    expect(birth('TO 1892')!.dateRange).toEqual({to: {year: 1892}});
  });

  it('writes other calendars as text so that topola cannot get them wrong', () => {
    expect(birth('JULIAN 6 APR 1889')!.date).toEqual({
      text: '6 Apr 1889 (Julian)',
    });
    expect(birth('ABT JULIAN 1889')!.date).toEqual({
      qualifier: 'abt',
      text: '1889 (Julian)',
    });
    expect(birth('HEBREW 15 NSN 5784')!.date).toEqual({
      text: '15 NSN 5784 (Hebrew)',
    });
    expect(birth('44 BCE')!.date).toEqual({text: '44 BCE'});
    expect(birth('30 JAN 1648/49')!.date).toEqual({text: '30 Jan 1648/49'});
    expect(birth('BET JULIAN 1890 AND 1892')!.dateRange).toEqual({
      from: {text: '1890 (Julian)'},
      to: {year: 1892},
    });
  });

  it('does not choke on extension calendars', () => {
    expect(birth('_CAL2 23 _MON2 88 _EP2')!.date).toEqual({
      text: '23 _MON2 88 _EP2 (_CAL2)',
    });
  });

  it('can show Gregorian dates for old-style ones', () => {
    expect(birth('JULIAN 6 APR 1889', {dateStyle: 'gregorian'})!.date).toEqual({
      day: 18,
      month: 4,
      year: 1889,
    });
    expect(birth('JULIAN 1 FEB 1918', {dateStyle: 'gregorian'})!.date).toEqual({
      day: 14,
      month: 2,
      year: 1918,
    });
    // a year alone cannot be converted exactly: it stays as written
    expect(birth('JULIAN 1889', {dateStyle: 'gregorian'})!.date).toEqual({
      text: '1889 (Julian)',
    });
  });

  it('can show both', () => {
    expect(birth('JULIAN 6 APR 1889', {dateStyle: 'both'})!.date).toEqual({
      text: '6 Apr 1889 (Julian) = 18 Apr 1889',
    });
    expect(birth('6 APR 1889', {dateStyle: 'both'})!.date).toEqual({
      day: 6,
      month: 4,
      year: 1889,
    });
  });

  it('takes a formatter from the caller', () => {
    const data = buildChartData(
      treeOf(doc7('0 @I1@ INDI', '1 BIRT', '2 DATE JULIAN 6 APR 1889')),
      SETTINGS,
      {
        formatDate: (d, style) =>
          `${d.day}.${d.monthIndex}.${d.year} ст.ст. [${style}]`,
      },
    );
    expect(data.indis[0]!.birth!.date).toEqual({
      text: '6.4.1889 ст.ст. [source]',
    });
  });

  it('shows the phrase of an empty date and the text of an unreadable one', () => {
    const text = doc7(
      '0 @I1@ INDI',
      '1 BIRT',
      '2 DATE',
      '3 PHRASE spring of the year the river froze',
      '1 DEAT',
      '2 DATE sometime',
    );
    const i = indiOf(chart(text), 'I1');
    expect(i.birth!.date).toEqual({text: 'spring of the year the river froze'});
    expect(i.death!.date).toEqual({text: 'sometime'});
  });

  it('toTopolaDate on its own', () => {
    expect(toTopolaDate(undefined, 'source')).toBeUndefined();
    expect(toTopolaDate(parseDate(''), 'source')).toBeUndefined();
  });

  it('keeps places, and Y events', () => {
    const data = chart(
      doc7(
        '0 @I1@ INDI',
        '1 BIRT',
        '2 PLAC Tver',
        '1 DEAT Y',
        '0 @I2@ INDI',
        '1 BIRT',
        '2 TYPE x',
        '1 DEAT',
      ),
    );
    expect(indiOf(data, 'I1').birth).toEqual({place: 'Tver', confirmed: true});
    expect(indiOf(data, 'I1').death).toEqual({confirmed: true});
    expect(indiOf(data, 'I2').birth).toBeUndefined();
    expect(indiOf(data, 'I2').death).toBeUndefined();
  });
});

describe('restricted data', () => {
  const text = doc7(
    '0 @I1@ INDI',
    '1 NAME Secret /Person/',
    '1 RESN CONFIDENTIAL',
    '1 BIRT',
    '2 DATE 1900',
    '2 PLAC Tver',
    '1 OBJE @O1@',
    '0 @I2@ INDI',
    '1 NAME Open /Person/',
    '1 BIRT',
    '2 DATE 1901',
    '1 DEAT',
    '2 DATE 1950',
    '2 RESN PRIVACY',
    '1 OBJE @O1@',
    '1 OBJE @O2@',
    '0 @F1@ FAM',
    '1 HUSB @I1@',
    '1 WIFE @I2@',
    '1 RESN CONFIDENTIAL',
    '1 MARR',
    '2 DATE 1925',
    '0 @O1@ OBJE',
    '1 FILE https://example.com/a.jpg',
    '2 FORM image/jpeg',
    '0 @O2@ OBJE',
    '1 RESN PRIVACY',
    '1 FILE https://example.com/b.jpg',
    '2 FORM image/jpeg',
  );

  it('keeps names but drops dates, places and pictures of restricted persons', () => {
    const data = chart(text, {hideRestricted: true});
    const i1 = indiOf(data, 'I1');
    expect(i1).toMatchObject({firstName: 'Secret', lastName: 'Person'});
    expect(i1.birth).toBeUndefined();
    expect(i1.images).toBeUndefined();
    expect(i1.fams).toEqual(['F1']);
  });

  it('drops restricted events, restricted pictures and restricted marriages only', () => {
    const data = chart(text, {hideRestricted: true});
    const i2 = indiOf(data, 'I2');
    expect(i2.birth!.date).toEqual({year: 1901});
    expect(i2.death).toBeUndefined();
    expect(i2.images).toEqual([{url: 'https://example.com/a.jpg'}]);
    expect(famOf(data, 'F1').marriage).toBeUndefined();
    expect(famOf(data, 'F1')).toMatchObject({husb: 'I1', wife: 'I2'});
  });

  it('shows everything when hiding is off', () => {
    const data = chart(text, {hideRestricted: false});
    expect(indiOf(data, 'I1').birth).toEqual({
      date: {year: 1900},
      place: 'Tver',
      confirmed: true,
    });
    expect(indiOf(data, 'I2').death!.date).toEqual({year: 1950});
    expect(indiOf(data, 'I2').images).toHaveLength(2);
    expect(famOf(data, 'F1').marriage!.date).toEqual({year: 1925});
  });

  it('LOCKED alone is not a reason to hide', () => {
    const data = chart(
      doc7('0 @I1@ INDI', '1 RESN LOCKED', '1 BIRT', '2 DATE 1900'),
      {hideRestricted: true},
    );
    expect(indiOf(data, 'I1').birth).toBeDefined();
  });
});

describe('images', () => {
  const text = doc7(
    '0 @I1@ INDI',
    '1 OBJE @O1@',
    '2 TITL Link title',
    '1 OBJE @O2@',
    '1 OBJE @O3@',
    '1 OBJE @O4@',
    '1 OBJE @O5@',
    '0 @O1@ OBJE',
    '1 FILE media/a%20b.jpg',
    '2 FORM image/jpeg',
    '2 TITL File title',
    '0 @O2@ OBJE',
    '1 FILE media/song.mp3',
    '2 FORM audio/mpeg',
    '0 @O3@ OBJE',
    '1 FILE javascript:alert(1)',
    '2 FORM image/jpeg',
    '0 @O4@ OBJE',
    '1 FILE https://example.com/c.png',
    '0 @O5@ OBJE',
    '1 FILE media/missing.jpg',
    '2 FORM image/jpeg',
  );

  it('uses the link title, else the file title; takes only safe images with a URL', () => {
    const media = new Map([['media/a b.jpg', 'blob:abc']]);
    const data = chart(text, {}, media);
    expect(indiOf(data, 'I1').images).toEqual([
      {url: 'blob:abc', title: 'Link title'},
      {url: 'https://example.com/c.png'},
    ]);
  });
});
