import {describe, expect, it} from 'vitest';
import {gregorianToJdn, julianToJdn} from './calendar';
import {
  compareDates,
  dateSortKey,
  exactJdn,
  formatCalendarDate,
  formatDateEn,
  parseDate,
} from './date';
import type {CalendarDate, DateValue} from './types';

const parse = (raw: string) => parseDate(raw);
const value = (raw: string): DateValue => parse(raw).value;
const exact = (raw: string): CalendarDate => {
  const v = value(raw);
  if (v.kind !== 'exact') throw new Error(`${raw}: ${v.kind}`);
  return v.date;
};

describe('exact dates', () => {
  it('reads day month year in the default (Gregorian) calendar', () => {
    expect(exact('6 APR 1889')).toEqual({
      calendar: 'GREGORIAN',
      year: 1889,
      month: 'APR',
      monthIndex: 4,
      day: 6,
      bce: false,
    });
  });

  it('reads month year and year alone', () => {
    expect(exact('APR 1889')).toMatchObject({
      month: 'APR',
      monthIndex: 4,
      year: 1889,
    });
    expect(exact('APR 1889').day).toBeUndefined();
    const y = exact('1889');
    expect(y.month).toBeUndefined();
    expect(y.monthIndex).toBeUndefined();
    expect(y.year).toBe(1889);
  });

  it('keeps the text as written in raw', () => {
    expect(parse('6 APR 1889').raw).toBe('6 APR 1889');
    expect(parse('  6 APR 1889 ').raw).toBe('  6 APR 1889 ');
  });

  it('is case-insensitive and tolerant of extra spaces', () => {
    expect(exact('6  apr   1889')).toMatchObject({monthIndex: 4, day: 6});
  });

  it('reads BCE years', () => {
    expect(exact('44 BCE')).toMatchObject({year: 44, bce: true});
    expect(exact('15 MAR 44 BCE')).toMatchObject({
      year: 44,
      bce: true,
      day: 15,
      monthIndex: 3,
    });
    expect(exact('JULIAN 15 MAR 44 BCE')).toMatchObject({
      calendar: 'JULIAN',
      bce: true,
    });
  });

  it('reads the 5.5.1 dual year', () => {
    expect(exact('30 JAN 1648/49')).toMatchObject({year: 1648, dualYear: '49'});
    expect(exact('1699/00')).toMatchObject({year: 1699, dualYear: '00'});
  });

  it('rejects invalid text without throwing', () => {
    for (const bad of [
      '31 FOO 1900',
      'JAN',
      '6 1900', // day without month
      '1900-01-01',
      'JULIAN',
      '6 APR 1889 99',
      'BET 1900',
      'BET 1900 AND',
      'FROM',
      'ABT',
      'hello world',
      '6 APR',
    ]) {
      expect(value(bad), bad).toEqual({kind: 'unparsed'});
    }
  });
});

describe('calendars', () => {
  it('reads the four standard calendars', () => {
    expect(exact('JULIAN 6 APR 1889')).toMatchObject({
      calendar: 'JULIAN',
      monthIndex: 4,
      day: 6,
    });
    expect(exact('GREGORIAN 6 APR 1889').calendar).toBe('GREGORIAN');
    expect(exact('FRENCH_R 18 BRUM 8')).toMatchObject({
      calendar: 'FRENCH_R',
      month: 'BRUM',
      monthIndex: 2,
      day: 18,
      year: 8,
    });
    expect(exact('FRENCH_R 5 COMP 3')).toMatchObject({monthIndex: 13});
    expect(exact('HEBREW 15 NSN 5784')).toMatchObject({
      calendar: 'HEBREW',
      month: 'NSN',
      monthIndex: 8,
    });
    expect(exact('HEBREW 1 TSH 5785')).toMatchObject({monthIndex: 1});
    expect(exact('HEBREW 1 ADR 5784')).toMatchObject({monthIndex: 6});
    expect(exact('HEBREW 1 ADS 5784')).toMatchObject({monthIndex: 7});
  });

  it('rejects months that belong to another calendar', () => {
    expect(value('JULIAN 1 VEND 1800')).toEqual({kind: 'unparsed'});
    expect(value('FRENCH_R 1 JAN 8')).toEqual({kind: 'unparsed'});
    expect(value('HEBREW 1 MAR 5700')).toEqual({kind: 'unparsed'});
  });

  it('accepts extension calendars, months and epochs', () => {
    expect(exact('_CALENDAR 8 _MONTH 190 _EPOCH')).toMatchObject({
      calendar: '_CALENDAR',
      day: 8,
      month: '_MONTH',
      year: 190,
      epoch: '_EPOCH',
    });
    expect(exact('_CAL2 23 _MON2 88 _EP2')).toMatchObject({
      calendar: '_CAL2',
      day: 23,
      year: 88,
      epoch: '_EP2',
    });
    expect(exact('FRENCH_R 2 _JOUR 8')).toMatchObject({
      calendar: 'FRENCH_R',
      month: '_JOUR',
      day: 2,
      year: 8,
    });
    expect(exact('_CALENDRIER 4 COMP 8')).toMatchObject({
      calendar: '_CALENDRIER',
      month: 'COMP',
      year: 8,
    });
    expect(exactJdn(parse('_CAL2 23 _MON2 88 _EP2'))).toBeUndefined();
  });

  it('applies the calendar to one date only', () => {
    const v = value('FROM JULIAN 1670 TO 1800');
    expect(v).toMatchObject({
      kind: 'period',
      from: {calendar: 'JULIAN', year: 1670},
      to: {calendar: 'GREGORIAN', year: 1800},
    });
    const w = value('FROM 1670 TO JULIAN 1800');
    expect(w).toMatchObject({
      from: {calendar: 'GREGORIAN'},
      to: {calendar: 'JULIAN'},
    });
  });

  it('reads 5.5.1 calendar escapes as 7.0 calendars', () => {
    expect(exact('@#DJULIAN@ 6 APR 1889')).toMatchObject({
      calendar: 'JULIAN',
      monthIndex: 4,
      day: 6,
      year: 1889,
    });
    expect(exact('@#DGREGORIAN@ 6 APR 1889').calendar).toBe('GREGORIAN');
    expect(exact('@#DFRENCH R@ 18 BRUM 8')).toMatchObject({
      calendar: 'FRENCH_R',
      monthIndex: 2,
    });
    expect(exact('@#DHEBREW@ 15 NSN 5784')).toMatchObject({
      calendar: 'HEBREW',
      monthIndex: 8,
    });
    expect(exact('@#DROMAN@ 1 JAN 100').calendar).toBe('ROMAN');
    expect(exact('@#DUNKNOWN@ 1900').calendar).toBe('UNKNOWN');
    expect(value('BET @#DJULIAN@ 1890 AND @#DGREGORIAN@ 1892')).toMatchObject({
      kind: 'range',
      type: 'BET',
      from: {calendar: 'JULIAN', year: 1890},
      to: {calendar: 'GREGORIAN', year: 1892},
    });
    expect(value('ABT @#DJULIAN@ 1 JAN 50')).toMatchObject({
      kind: 'exact',
      qualifier: 'ABT',
      date: {calendar: 'JULIAN', year: 50},
    });
  });
});

describe('qualifiers, ranges and periods', () => {
  it('reads ABT, CAL and EST', () => {
    for (const q of ['ABT', 'CAL', 'EST'] as const) {
      expect(value(`${q} 1900`)).toMatchObject({
        kind: 'exact',
        qualifier: q,
        date: {year: 1900},
      });
    }
    expect(value('abt 1900')).toMatchObject({qualifier: 'ABT'});
  });

  it('reads BET .. AND, BEF and AFT', () => {
    expect(value('BET 1 JAN 1900 AND 31 DEC 1910')).toMatchObject({
      kind: 'range',
      type: 'BET',
      from: {year: 1900, day: 1},
      to: {year: 1910, day: 31},
    });
    expect(value('BEF 1900')).toMatchObject({
      kind: 'range',
      type: 'BEF',
      to: {year: 1900},
    });
    expect(value('BEF 1900')).not.toHaveProperty('from');
    expect(value('AFT 1900')).toMatchObject({
      kind: 'range',
      type: 'AFT',
      from: {year: 1900},
    });
    expect(value('AFT 1900')).not.toHaveProperty('to');
  });

  it('reads FROM .. TO, FROM and TO', () => {
    expect(value('FROM 1900 TO 1910')).toMatchObject({
      kind: 'period',
      from: {year: 1900},
      to: {year: 1910},
    });
    expect(value('FROM 667 BCE TO 324')).toMatchObject({
      from: {year: 667, bce: true},
      to: {year: 324, bce: false},
    });
    const from = value('FROM 1900');
    expect(from).toMatchObject({kind: 'period', from: {year: 1900}});
    expect(from).not.toHaveProperty('to');
    const to = value('TO 1900');
    expect(to).toMatchObject({kind: 'period', to: {year: 1900}});
    expect(to).not.toHaveProperty('from');
  });
});

describe('empty dates, phrases and times', () => {
  it('reads an empty DATE', () => {
    expect(parse('')).toEqual({raw: '', value: {kind: 'empty'}});
    expect(parse('   ').value).toEqual({kind: 'empty'});
  });

  it('carries PHRASE and TIME from the substructures', () => {
    expect(parseDate('', {phrase: '5 January (year unknown)'})).toEqual({
      raw: '',
      value: {kind: 'empty'},
      phrase: '5 January (year unknown)',
    });
    const d = parseDate('27 MAR 2022', {phrase: 'Afternoon', time: '16:02'});
    expect(d).toMatchObject({phrase: 'Afternoon', time: '16:02'});
    expect(d.value.kind).toBe('exact');
  });

  it('reads 5.5.1 phrases: "(phrase)" and "INT date (phrase)"', () => {
    expect(parse('(before the war)')).toEqual({
      raw: '(before the war)',
      value: {kind: 'empty'},
      phrase: 'before the war',
    });
    const int = parse('INT 6 APR 1889 (Easter Saturday)');
    expect(int.phrase).toBe('Easter Saturday');
    expect(int.value).toMatchObject({
      kind: 'exact',
      date: {year: 1889, day: 6},
    });
    expect(parse('INT 1900').value).toMatchObject({
      kind: 'exact',
      date: {year: 1900},
    });
    expect(parse('ABT 1900 (about)').phrase).toBe('about');
  });

  it('an explicit PHRASE substructure wins over text in parentheses', () => {
    expect(parseDate('1900 (x)', {phrase: 'y'}).phrase).toBe('y');
  });
});

describe('sorting', () => {
  const key = (raw: string) => dateSortKey(parse(raw));

  it('sorts by Julian Day Number across calendars', () => {
    expect(key('JULIAN 6 APR 1889')).toBe(key('18 APR 1889'));
    expect(key('JULIAN 6 APR 1889')).toBe(julianToJdn(1889, 4, 6));
    expect(key('18 APR 1889')).toBe(gregorianToJdn(1889, 4, 18));
    expect(key('JULIAN 1 JAN 1900')).toBe(key('13 JAN 1900'));
    expect(key('FRENCH_R 1 VEND 1')).toBe(gregorianToJdn(1792, 9, 22));
  });

  it('sorts ranges and periods by their start, approximate dates by the date', () => {
    expect(key('BET 1 JAN 1900 AND 1 JAN 1950')).toBe(key('1 JAN 1900'));
    expect(key('AFT 1900')).toBe(key('1900'));
    expect(key('BEF 1900')).toBe(key('1900'));
    expect(key('FROM 1900 TO 1950')).toBe(key('1900'));
    expect(key('TO 1950')).toBe(key('1950'));
    expect(key('ABT 1900')).toBe(key('1900'));
  });

  it('treats a missing day or month as the first', () => {
    expect(key('1900')).toBe(gregorianToJdn(1900, 1, 1));
    expect(key('MAR 1900')).toBe(gregorianToJdn(1900, 3, 1));
  });

  it('puts BCE before CE', () => {
    expect(key('44 BCE')!).toBeLessThan(key('44')!);
    expect(key('100 BCE')!).toBeLessThan(key('44 BCE')!);
  });

  it('gives no key to empty, unparsed and extension-calendar dates', () => {
    expect(key('')).toBeUndefined();
    expect(key('nonsense')).toBeUndefined();
    expect(key('_CAL 1 _M 5')).toBeUndefined();
    expect(dateSortKey(undefined)).toBeUndefined();
  });

  it('compareDates orders chronologically and puts unknown dates last', () => {
    const raws = [
      '',
      'nonsense',
      '1950',
      'JULIAN 1 FEB 1918',
      '1918',
      'BET 1800 AND 1900',
      '14 FEB 1918',
    ];
    const sorted = raws
      .map((r) => parse(r))
      .sort(compareDates)
      .map((d) => d.raw);
    expect(sorted).toEqual([
      'BET 1800 AND 1900',
      '1918',
      'JULIAN 1 FEB 1918',
      '14 FEB 1918',
      '1950',
      '',
      'nonsense',
    ]);
    expect(compareDates(parse('1900'), undefined)).toBeLessThan(0);
    expect(compareDates(undefined, parse('1900'))).toBeGreaterThan(0);
    expect(compareDates(undefined, undefined)).toBe(0);
    expect(compareDates(parse(''), parse('x'))).toBe(0);
  });

  it('exactJdn needs a complete exact date', () => {
    expect(exactJdn(parse('JULIAN 6 APR 1889'))).toBe(julianToJdn(1889, 4, 6));
    expect(exactJdn(parse('APR 1889'))).toBeUndefined();
    expect(exactJdn(parse('ABT 6 APR 1889'))).toBe(gregorianToJdn(1889, 4, 6));
    expect(exactJdn(parse('BEF 6 APR 1889'))).toBeUndefined();
    expect(exactJdn(parse('31 APR 1889'))).toBeUndefined();
  });
});

describe('English formatting', () => {
  it('formats calendar dates', () => {
    expect(formatCalendarDate(exact('6 APR 1889'))).toBe('6 Apr 1889');
    expect(formatCalendarDate(exact('APR 1889'))).toBe('Apr 1889');
    expect(formatCalendarDate(exact('44 BCE'))).toBe('44 BCE');
    expect(formatCalendarDate(exact('30 JAN 1648/49'))).toBe('30 Jan 1648/49');
    expect(formatCalendarDate(exact('FRENCH_R 18 BRUM 8'))).toBe('18 BRUM 8');
  });

  it('formats whole dates', () => {
    expect(formatDateEn(parse('JULIAN 6 APR 1889'))).toBe(
      '6 Apr 1889 (Julian)',
    );
    expect(formatDateEn(parse('JULIAN 6 APR 1889'), false)).toBe('6 Apr 1889');
    expect(formatDateEn(parse('ABT 1900'))).toBe('about 1900');
    expect(formatDateEn(parse('BET 1890 AND 1892'))).toBe(
      'between 1890 and 1892',
    );
    expect(formatDateEn(parse('BEF 1890'))).toBe('before 1890');
    expect(formatDateEn(parse('AFT 1890'))).toBe('after 1890');
    expect(formatDateEn(parse('FROM 1890 TO 1892'))).toBe('from 1890 to 1892');
    expect(formatDateEn(parse('TO 1892'))).toBe('until 1892');
    expect(formatDateEn(parseDate('', {phrase: 'spring'}))).toBe('spring');
    expect(formatDateEn(parse('what'))).toBe('what');
  });
});
