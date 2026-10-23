import {describe, expect, it} from 'vitest';
import type {CalendarDate, ParsedDate} from '../gedcom/types';
import {getIntl, getMessagesOf} from '../i18n';
import {
  chartDateFormatter,
  formatAge,
  formatDate,
  formatPlace,
  initials,
  joinRange,
  lifeSpan,
} from './format';
import {mockTree} from './mock/mockTree';

const cal = (
  calendar: string,
  year: number,
  month?: number,
  day?: number,
  extra: Partial<CalendarDate> = {},
): CalendarDate => ({
  calendar,
  year,
  month: month ? 'XXX' : undefined,
  monthIndex: month,
  day,
  bce: false,
  ...extra,
});

const exact = (
  date: CalendarDate,
  qualifier?: 'ABT' | 'CAL' | 'EST',
): ParsedDate => ({raw: '', value: {kind: 'exact', date, qualifier}});

/** Test strings mark each non-breaking space with "~". */
const nb = (s: string) => s.replaceAll('~', ' ');

const ru = {locale: 'ru', style: 'source'} as const;
const en = {locale: 'en', style: 'source'} as const;
const ruBoth = {locale: 'ru', style: 'both'} as const;
const enBoth = {locale: 'en', style: 'both'} as const;
const ruG = {locale: 'ru', style: 'gregorian'} as const;

const jul = (y: number, m?: number, d?: number, q?: 'ABT' | 'CAL' | 'EST') =>
  exact(cal('JULIAN', y, m, d), q);
const greg = (y: number, m?: number, d?: number) =>
  exact(cal('GREGORIAN', y, m, d));

describe('formatDate', () => {
  it('formats full Gregorian dates with the genitive month, never abbreviated', () => {
    const d = greg(1889, 4, 6);
    expect(formatDate(d, ru)).toBe(nb('6~апреля 1889'));
    expect(formatDate(d, en)).toBe(nb('6~April 1889'));
    // Months that abbreviate even in the long form of other locales.
    expect(formatDate(greg(1889, 9, 3), ru)).toBe(nb('3~сентября 1889'));
    expect(formatDate(greg(1889, 5, 3), en)).toBe(nb('3~May 1889'));
  });

  it('uses the nominative month without a day, and a bare year', () => {
    expect(formatDate(greg(1889, 4), ru)).toBe('апрель 1889');
    expect(formatDate(greg(1889, 4), en)).toBe('April 1889');
    expect(formatDate(greg(1957), ru)).toBe('1957');
  });

  it('writes qualifiers in words', () => {
    const q = (qualifier: 'ABT' | 'CAL' | 'EST') =>
      exact(cal('GREGORIAN', 1862), qualifier);
    expect(formatDate(q('ABT'), ru)).toBe(nb('около~1862'));
    expect(formatDate(q('CAL'), ru)).toBe(nb('по~расчёту~1862'));
    expect(formatDate(q('EST'), ru)).toBe(nb('по~оценке~1862'));
    expect(formatDate(q('ABT'), en)).toBe(nb('about~1862'));
    expect(formatDate(q('CAL'), en)).toBe(nb('calculated~1862'));
    expect(formatDate(q('EST'), en)).toBe(nb('estimated~1862'));
  });

  it('writes BCE with the established abbreviation', () => {
    const d = exact(cal('GREGORIAN', 44, 3, 15, {bce: true}));
    expect(formatDate(d, ru)).toBe(nb('15~марта 44~до~н.~э.'));
    expect(formatDate(d, en)).toBe(nb('15~March 44~BCE'));
  });

  it('keeps a dual year', () => {
    expect(
      formatDate(
        exact(cal('GREGORIAN', 1699, undefined, undefined, {dualYear: '00'})),
        en,
      ),
    ).toBe('1699/00');
  });

  it('formats ranges and periods in words', () => {
    const a = cal('GREGORIAN', 1900);
    const b = cal('GREGORIAN', 1910);
    const range = (
      type: 'BET' | 'BEF' | 'AFT',
      from?: CalendarDate,
      to?: CalendarDate,
    ) => ({raw: '', value: {kind: 'range', type, from, to}}) as ParsedDate;
    expect(formatDate(range('BET', a, b), ru)).toBe(nb('между 1900 и~1910'));
    expect(formatDate(range('BET', a, b), en)).toBe('between 1900 and 1910');
    expect(formatDate(range('BEF', undefined, a), ru)).toBe(nb('до~1900'));
    expect(formatDate(range('BEF', undefined, a), en)).toBe('before 1900');
    expect(formatDate(range('AFT', a), ru)).toBe(nb('после~1900'));
    expect(formatDate(range('AFT', a), en)).toBe('after 1900');
    const period = (from?: CalendarDate, to?: CalendarDate): ParsedDate => ({
      raw: '',
      value: {kind: 'period', from, to},
    });
    expect(formatDate(period(a, b), ru)).toBe(nb('с~1900 по~1910'));
    expect(formatDate(period(a, b), en)).toBe('from 1900 to 1910');
    expect(formatDate(period(a), en)).toBe('from 1900');
    expect(formatDate(period(undefined, b), ru)).toBe(nb('по~1910'));
    expect(formatDate(period(undefined, b), en)).toBe('to 1910');
  });

  it('uses an abbreviation nowhere in the date words', () => {
    const all = [
      ...Object.entries(getMessagesOf('ru')),
      ...Object.entries(getMessagesOf('en')),
    ].filter(([k]) => k.startsWith('date.') || k.startsWith('legend.'));
    for (const [key, text] of all) {
      expect(text, key).not.toMatch(
        /(?:^|\s)(?:ок|расч|оцен|abt|calc|est|O\.S|Rep)\./,
      );
    }
  });

  it('shows the phrase for an empty date and the raw text for unparsed ones', () => {
    expect(
      formatDate({raw: '', value: {kind: 'empty'}, phrase: 'весной'}, ru),
    ).toBe('весной');
    expect(formatDate({raw: 'lately', value: {kind: 'unparsed'}}, ru)).toBe(
      'lately',
    );
    expect(formatDate(undefined, ru)).toBe('');
  });
});

describe('Julian dates', () => {
  it('shows the recorded day, then the new style day: 6 (18) апреля 1889', () => {
    const d = jul(1889, 4, 6);
    expect(formatDate(d, ruBoth)).toBe(nb('6~(18)~апреля 1889'));
    expect(formatDate(d, enBoth)).toBe(nb('6~(18)~April 1889'));
  });

  it('shows only the recorded date in "source" style, only the new style in "gregorian"', () => {
    const d = jul(1889, 4, 6);
    expect(formatDate(d, ru)).toBe(nb('6~апреля 1889'));
    expect(formatDate(d, ruG)).toBe(nb('18~апреля 1889'));
    expect(formatDate(d, {...en, style: 'gregorian'})).toBe(
      nb('18~April 1889'),
    );
  });

  it('writes both full dates across a year, and shares the year otherwise', () => {
    // Year rollover.
    expect(formatDate(jul(1899, 12, 20), ruBoth)).toBe(
      nb('20~декабря 1899 (1~января 1900)'),
    );
    expect(formatDate(jul(1899, 12, 20), enBoth)).toBe(
      nb('20~December 1899 (1~January 1900)'),
    );
    // Month rollover within a year.
    expect(formatDate(jul(1889, 3, 25), ruBoth)).toBe(
      nb('25~марта (6~апреля) 1889'),
    );
  });

  it('uses the 12-day gap in the 19th century and 13 days from March 1900', () => {
    // Julian 17 FEB 1900 = Gregorian 1 MAR 1900 (gap still 12).
    expect(formatDate(jul(1900, 2, 17), ruBoth)).toBe(
      nb('17~февраля (1~марта) 1900'),
    );
    // 29 FEB 1900 exists in the Julian calendar only.
    expect(formatDate(jul(1900, 2, 29), ruBoth)).toBe(
      nb('29~февраля (13~марта) 1900'),
    );
    expect(formatDate(jul(1900, 3, 1), ruBoth)).toBe(nb('1~(14)~марта 1900'));
    expect(formatDate(jul(1899, 3, 1), ruBoth)).toBe(nb('1~(13)~марта 1899'));
  });

  it('converts Julian 1918 dates with the 13-day gap', () => {
    // The Soviet decree: 31 JAN 1918 (O.S.) was followed by 14 FEB 1918.
    expect(formatDate(jul(1918, 1, 31), ruBoth)).toBe(
      nb('31~января (13~февраля) 1918'),
    );
    expect(formatDate(jul(1918, 2, 1), ruBoth)).toBe(nb('1~(14)~февраля 1918'));
  });

  it('accounts for the Julian leap day when converting to the new style', () => {
    expect(formatDate(jul(1900, 2, 28), ruG)).toBe(nb('12~марта 1900'));
    expect(formatDate(jul(1800, 2, 29), ruG)).toBe(nb('12~марта 1800'));
  });

  it('never converts partial dates', () => {
    for (const o of [ru, ruBoth, ruG]) {
      expect(formatDate(jul(1889, 4), o)).toBe('апрель 1889');
      expect(formatDate(jul(1889), o)).toBe('1889');
    }
  });

  it('leaves impossible dates and BCE dual years as recorded', () => {
    expect(formatDate(jul(1899, 2, 30), ruBoth)).toBe(nb('30~февраля 1899'));
    expect(
      formatDate(exact(cal('JULIAN', 1699, 1, 30, {dualYear: '00'})), ruBoth),
    ).toBe(nb('30~января 1699/00'));
  });

  it('puts the qualifier before the whole notation and handles ranges', () => {
    expect(formatDate(jul(1889, 4, 6, 'ABT'), ruBoth)).toBe(
      nb('около~6~(18)~апреля 1889'),
    );
    const j1 = cal('JULIAN', 1889, 4, 6);
    const j2 = cal('JULIAN', 1905);
    expect(
      formatDate(
        {raw: '', value: {kind: 'range', type: 'BET', from: j1, to: j2}},
        ruBoth,
      ),
    ).toBe(nb('между 6~(18)~апреля 1889 и~1905'));
  });

  it('uses no "ст. ст." marker anywhere', () => {
    expect(formatDate(jul(1889, 4, 6), ru)).not.toMatch(/ст\./);
    expect(formatDate(jul(1889, 4, 6), en)).not.toMatch(/O\.S/);
  });
});

describe('other calendars', () => {
  const fr = (y: number, m: number, d?: number, tag = 'VEND') =>
    exact(cal('FRENCH_R', y, m, d, {month: tag}));

  it('shows a French Republican date as recorded, with the Gregorian one in brackets', () => {
    const d = fr(10, 1, 1);
    expect(formatDate(d, ruBoth)).toBe(
      nb('1~вандемьера 10 (23~сентября 1801)'),
    );
    expect(formatDate(d, enBoth)).toBe(
      nb('1~Vendémiaire 10 (23~September 1801)'),
    );
    expect(formatDate(d, ru)).toBe(nb('1~вандемьера 10'));
    expect(formatDate(d, ruG)).toBe(nb('23~сентября 1801'));
  });

  it('names French months standalone in the nominative and skips partial conversion', () => {
    expect(formatDate(fr(3, 2, undefined, 'BRUM'), ruBoth)).toBe('брюмер 3');
    expect(formatDate(fr(12, 13, 2, 'COMP'), enBoth)).toContain(
      'Sansculottides',
    );
  });

  it('shows a Hebrew date as recorded with the Gregorian one in brackets', () => {
    // 15 Nisan 5700 = 23 April 1940 (first day of Passover).
    const d = exact(cal('HEBREW', 5700, 8, 15, {month: 'NSN'}));
    expect(formatDate(d, ruBoth)).toBe(nb('15~нисана 5700 (23~апреля 1940)'));
    expect(formatDate(d, enBoth)).toBe(nb('15~Nisan 5700 (23~April 1940)'));
  });

  it('names Adar by the year: plain in a common year, I and II in a leap year', () => {
    // 5701 is a common year, 5700 a leap year.
    const adar = (year: number, tag: string, idx: number) =>
      exact(cal('HEBREW', year, idx, 1, {month: tag}));
    expect(formatDate(adar(5701, 'ADS', 7), ru)).toBe(nb('1~адара 5701'));
    expect(formatDate(adar(5700, 'ADR', 6), ru)).toBe(nb('1~адара I 5700'));
    expect(formatDate(adar(5700, 'ADS', 7), en)).toBe(nb('1~Adar II 5700'));
  });

  it('keeps an unknown calendar name', () => {
    expect(formatDate(exact(cal('_MY_CAL', 5)), en)).toBe('5 MY CAL');
  });
});

describe('chartDateFormatter', () => {
  it('formats a calendar date for the chart model', () => {
    const f = chartDateFormatter('ru');
    expect(f(cal('JULIAN', 1889, 4, 6), 'both')).toBe(nb('6~(18)~апреля 1889'));
    expect(f(cal('JULIAN', 1889, 4, 6), 'source')).toBe(nb('6~апреля 1889'));
  });
});

describe('joinRange', () => {
  it('uses the long dash without spaces between simple numbers (ru)', () => {
    expect(joinRange('1858', '1921', 'ru')).toBe('1858—1921');
    expect(joinRange('?', '1968', 'ru')).toBe('?—1968');
    expect(joinRange('1889', '?', 'ru')).toBe('1889—?');
  });

  it('puts spaces around the dash when a side has spaces (ru)', () => {
    expect(joinRange(nb('6~апреля 1889'), '1957', 'ru')).toBe(
      nb('6~апреля 1889~— 1957'),
    );
    expect(joinRange('?', nb('около~1930'), 'ru')).toBe(nb('?~— около~1930'));
  });

  it('uses the en dash in English, spaced for full dates', () => {
    expect(joinRange('1858', '1921', 'en')).toBe('1858–1921');
    expect(joinRange('?', '1968', 'en')).toBe('?–1968');
    expect(joinRange(nb('6~April 1889'), '1957', 'en')).toBe(
      nb('6~April 1889~– 1957'),
    );
  });
});

describe('lifeSpan', () => {
  it('joins birth and death, showing the Julian birth in both styles', () => {
    const ivan = mockTree.indis.get('I1');
    expect(ivan && lifeSpan(ivan, ruBoth)).toBe(
      nb('6~(18)~апреля 1889~— 1957'),
    );
    expect(ivan && lifeSpan(ivan, enBoth)).toBe(nb('6~(18)~April 1889~– 1957'));
    expect(ivan && lifeSpan(ivan, ru)).toBe(nb('6~апреля 1889~— 1957'));
  });

  it('writes a year range with a bare long dash', () => {
    const petr = mockTree.indis.get('I2');
    expect(petr && lifeSpan(petr, ru)).toBe('1858—1921');
    expect(petr && lifeSpan(petr, en)).toBe('1858–1921');
  });

  it('handles an approximate birth in words', () => {
    const maria = mockTree.indis.get('I3');
    expect(maria && lifeSpan(maria, ru)).toBe(nb('около~1862~— 1930'));
    expect(maria && lifeSpan(maria, en)).toBe(nb('about~1862~– 1930'));
  });

  it('can give the years only, without abbreviations', () => {
    const ivan = mockTree.indis.get('I1')!;
    expect(lifeSpan(ivan, ru, {years: true})).toBe('1889—1957');
    const maria = mockTree.indis.get('I3')!;
    expect(lifeSpan(maria, ru, {years: true})).toBe(nb('около~1862~— 1930'));
  });

  it('never leaves a dangling dash', () => {
    const ivan = mockTree.indis.get('I1')!;
    const keep = (pred: (tag: string) => boolean) => ({
      ...ivan,
      events: ivan.events.filter((e) => pred(e.tag)),
    });
    const bornOnly = keep((t) => t === 'BIRT');
    expect(lifeSpan(bornOnly, ruBoth)).toBe(nb('6~(18)~апреля 1889'));
    expect(lifeSpan(bornOnly, enBoth)).toBe(nb('6~(18)~April 1889'));
    const diedOnly = keep((t) => t === 'DEAT');
    expect(lifeSpan(diedOnly, ru)).toBe('?—1957');
    expect(lifeSpan(diedOnly, en)).toBe('?–1957');
    const deathUndated = {
      ...bornOnly,
      events: [
        ...bornOnly.events,
        ...ivan.events
          .filter((e) => e.tag === 'DEAT')
          .map((e) => ({...e, date: undefined})),
      ],
    };
    expect(lifeSpan(deathUndated, ruBoth)).toBe(nb('6~(18)~апреля 1889~— ?'));
    expect(
      lifeSpan(
        keep(() => false),
        ru,
      ),
    ).toBe('');
  });

  it('writes an undated death after a bare year as 1889—?', () => {
    const base = mockTree.indis.get('I2')!;
    const born = base.events.filter((e) => e.tag === 'BIRT');
    const death = base.events
      .filter((e) => e.tag === 'DEAT')
      .map((e) => ({...e, date: undefined}));
    expect(lifeSpan({...base, events: [...born, ...death]}, ru)).toBe('1858—?');
  });
});

describe('helpers', () => {
  it('takes initials from the first and last word', () => {
    expect(initials('Иван Петрович Соколов')).toBe('ИС');
    expect(initials('Cher')).toBe('C');
    expect(initials('')).toBe('');
  });

  it('formats ages with plurals', () => {
    const ru = getIntl('ru');
    const en = getIntl('en');
    expect(formatAge({raw: '7y', years: 7}, ru)).toBe(nb('7~лет'));
    expect(formatAge({raw: '22y', years: 22}, ru)).toBe(nb('22~года'));
    expect(formatAge({raw: '21y', years: 21}, ru)).toBe(nb('21~год'));
    expect(formatAge({raw: '1y', years: 1}, en)).toBe(nb('1~year'));
  });

  it('uses Russian plurals for months, weeks and days', () => {
    const ru = getIntl('ru');
    const age = (months: number, weeks: number, days: number) =>
      formatAge({raw: '', months, weeks, days}, ru);
    expect(age(1, 1, 1)).toBe(nb('1~месяц 1~неделя 1~день'));
    expect(age(2, 3, 4)).toBe(nb('2~месяца 3~недели 4~дня'));
    expect(age(5, 11, 12)).toBe(nb('5~месяцев 11~недель 12~дней'));
    expect(age(21, 22, 25)).toBe(nb('21~месяц 22~недели 25~дней'));
    expect(formatAge({raw: '', years: 0, days: 3}, ru)).toBe(nb('0~лет 3~дня'));
  });

  it('joins all parts in English', () => {
    expect(
      formatAge(
        {raw: '', years: 2, months: 1, weeks: 3, days: 1},
        getIntl('en'),
      ),
    ).toBe(nb('2~years 1~month 3~weeks 1~day'));
  });

  it('words the bounds and keeps the phrase', () => {
    const ru = getIntl('ru');
    expect(formatAge({raw: '> 7y', bound: '>', years: 7}, ru)).toBe(
      nb('больше 7~лет'),
    );
    expect(formatAge({raw: '< 3m', bound: '<', months: 3}, ru)).toBe(
      nb('меньше 3~месяца'),
    );
    expect(formatAge({raw: '< 3m', bound: '<', months: 3}, getIntl('en'))).toBe(
      nb('under 3~months'),
    );
    expect(formatAge({raw: '5y', years: 5, phrase: 'около пяти'}, ru)).toBe(
      nb('5~лет («около пяти»)'),
    );
    expect(formatAge({raw: '', phrase: 'в младенчестве'}, ru)).toBe(
      'в младенчестве',
    );
  });
});

describe('formatPlace', () => {
  it('skips empty jurisdictions, never rendering ", ,"', () => {
    const parts = ['г. Калинин', '', 'Калининская область', ' ', 'СССР'];
    expect(formatPlace({raw: parts.join(', '), parts})).toBe(
      'г. Калинин, Калининская область, СССР',
    );
    expect(formatPlace({raw: 'a, , b', parts: []})).toBe('a, b');
  });
});
