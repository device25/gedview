import {describe, expect, it} from 'vitest';
import type {CalendarDate, ParsedDate} from '../gedcom/types';
import {getIntl} from '../i18n';
import {formatAge, formatDate, formatPlace, initials, lifeSpan} from './format';
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

const ru = {locale: 'ru', style: 'source'} as const;
const en = {locale: 'en', style: 'source'} as const;

describe('formatDate', () => {
  it('formats full Gregorian dates in Russian with the genitive month', () => {
    const d = exact(cal('GREGORIAN', 1889, 4, 6));
    expect(formatDate(d, ru)).toBe('6 апреля 1889');
    expect(formatDate(d, {...ru, short: true})).toBe('6 апр 1889');
  });

  it('formats full Gregorian dates in English', () => {
    const d = exact(cal('GREGORIAN', 1889, 4, 6));
    expect(formatDate(d, en)).toBe('6 April 1889');
    expect(formatDate(d, {...en, short: true})).toBe('6 Apr 1889');
  });

  it('uses the nominative month without a day, and a bare year', () => {
    expect(formatDate(exact(cal('GREGORIAN', 1889, 4)), ru)).toBe(
      'апрель 1889',
    );
    expect(formatDate(exact(cal('GREGORIAN', 1957)), ru)).toBe('1957');
  });

  it('prefixes qualifiers', () => {
    expect(formatDate(exact(cal('GREGORIAN', 1862), 'ABT'), ru)).toBe(
      'ок. 1862',
    );
    expect(formatDate(exact(cal('GREGORIAN', 1862), 'ABT'), en)).toBe(
      'abt 1862',
    );
    expect(formatDate(exact(cal('GREGORIAN', 1862), 'EST'), en)).toBe(
      'est 1862',
    );
  });

  it('adds the old-style marker to Julian dates', () => {
    const d = exact(cal('JULIAN', 1889, 4, 6));
    expect(formatDate(d, ru)).toBe('6 апреля 1889 ст. ст.');
    expect(formatDate(d, en)).toBe('6 April 1889 O.S.');
  });

  it('shows Julian dates as written for every date style until part E', () => {
    const d = exact(cal('JULIAN', 1889, 4, 6));
    expect(formatDate(d, {...ru, style: 'both'})).toBe('6 апреля 1889 ст. ст.');
    expect(formatDate(d, {...ru, style: 'gregorian'})).toBe(
      '6 апреля 1889 ст. ст.',
    );
  });

  it('shows other calendars with the month tag as written', () => {
    const d = exact(cal('FRENCH_R', 3, 1, 12, {month: 'VEND', monthIndex: 1}));
    expect(formatDate(d, en)).toBe('12 VEND 3 French Rep.');
  });

  it('keeps an unknown calendar name as a marker', () => {
    expect(formatDate(exact(cal('_MY_CAL', 5)), en)).toBe('5 MY CAL');
  });

  it('handles BCE and dual years', () => {
    expect(
      formatDate(exact(cal('GREGORIAN', 44, 3, 15, {bce: true})), en),
    ).toBe('15 March 44 BCE');
    expect(
      formatDate(
        exact(cal('GREGORIAN', 1699, undefined, undefined, {dualYear: '00'})),
        en,
      ),
    ).toBe('1699/00');
  });

  it('formats ranges and periods', () => {
    const a = cal('GREGORIAN', 1900);
    const b = cal('GREGORIAN', 1910);
    expect(
      formatDate(
        {raw: '', value: {kind: 'range', type: 'BET', from: a, to: b}},
        ru,
      ),
    ).toBe('между 1900 и 1910');
    expect(
      formatDate({raw: '', value: {kind: 'range', type: 'BEF', from: a}}, en),
    ).toBe('before 1900');
    expect(
      formatDate({raw: '', value: {kind: 'range', type: 'AFT', from: a}}, ru),
    ).toBe('после 1900');
    expect(
      formatDate({raw: '', value: {kind: 'period', from: a, to: b}}, ru),
    ).toBe('с 1900 по 1910');
    expect(formatDate({raw: '', value: {kind: 'period', from: a}}, en)).toBe(
      'from 1900',
    );
    expect(formatDate({raw: '', value: {kind: 'period', to: b}}, en)).toBe(
      'to 1910',
    );
  });

  it('puts one marker on a Julian range, one per date when calendars differ', () => {
    const j1 = cal('JULIAN', 1900);
    const j2 = cal('JULIAN', 1910);
    const g = cal('GREGORIAN', 1920);
    expect(
      formatDate(
        {raw: '', value: {kind: 'range', type: 'BET', from: j1, to: j2}},
        ru,
      ),
    ).toBe('между 1900 и 1910 ст. ст.');
    expect(
      formatDate(
        {raw: '', value: {kind: 'range', type: 'BET', from: j1, to: g}},
        ru,
      ),
    ).toBe('между 1900 ст. ст. и 1920');
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

describe('lifeSpan', () => {
  it('joins birth and death, with the Julian marker', () => {
    const ivan = mockTree.indis.get('I1');
    expect(ivan && lifeSpan(ivan, ru)).toBe('6 апр 1889 ст. ст. — 1957');
    expect(ivan && lifeSpan(ivan, en)).toBe('6 Apr 1889 O.S. — 1957');
  });

  it('handles an approximate birth', () => {
    const maria = mockTree.indis.get('I3');
    expect(maria && lifeSpan(maria, ru)).toBe('ок. 1862 — 1930');
  });

  it('never leaves a dangling dash', () => {
    const ivan = mockTree.indis.get('I1')!;
    const keep = (pred: (tag: string) => boolean) => ({
      ...ivan,
      events: ivan.events.filter((e) => pred(e.tag)),
    });
    const bornOnly = keep((t) => t === 'BIRT');
    expect(lifeSpan(bornOnly, ru)).toBe('6 апр 1889 ст. ст.');
    expect(lifeSpan(bornOnly, en)).toBe('6 Apr 1889 O.S.');
    const diedOnly = keep((t) => t === 'DEAT');
    expect(lifeSpan(diedOnly, ru)).toBe('? — 1957');
    expect(lifeSpan(diedOnly, en)).toBe('? — 1957');
    const deathUndated = {
      ...bornOnly,
      events: [
        ...bornOnly.events,
        ...ivan.events
          .filter((e) => e.tag === 'DEAT')
          .map((e) => ({...e, date: undefined})),
      ],
    };
    expect(lifeSpan(deathUndated, ru)).toBe('6 апр 1889 ст. ст. — ?');
    expect(
      lifeSpan(
        keep(() => false),
        ru,
      ),
    ).toBe('');
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
    expect(formatAge({raw: '7y', years: 7}, ru)).toBe('7 лет');
    expect(formatAge({raw: '22y', years: 22}, ru)).toBe('22 года');
    expect(formatAge({raw: '21y', years: 21}, ru)).toBe('21 год');
    expect(formatAge({raw: '1y', years: 1}, en)).toBe('1 year');
  });

  it('uses Russian plurals for months, weeks and days', () => {
    const ru = getIntl('ru');
    const age = (months: number, weeks: number, days: number) =>
      formatAge({raw: '', months, weeks, days}, ru);
    expect(age(1, 1, 1)).toBe('1 месяц 1 неделя 1 день');
    expect(age(2, 3, 4)).toBe('2 месяца 3 недели 4 дня');
    expect(age(5, 11, 12)).toBe('5 месяцев 11 недель 12 дней');
    expect(age(21, 22, 25)).toBe('21 месяц 22 недели 25 дней');
    expect(formatAge({raw: '', years: 0, days: 3}, ru)).toBe('0 лет 3 дня');
  });

  it('joins all parts in English', () => {
    expect(
      formatAge(
        {raw: '', years: 2, months: 1, weeks: 3, days: 1},
        getIntl('en'),
      ),
    ).toBe('2 years 1 month 3 weeks 1 day');
  });

  it('words the bounds and keeps the phrase', () => {
    const ru = getIntl('ru');
    expect(formatAge({raw: '> 7y', bound: '>', years: 7}, ru)).toBe(
      'больше 7 лет',
    );
    expect(formatAge({raw: '< 3m', bound: '<', months: 3}, ru)).toBe(
      'меньше 3 месяца',
    );
    expect(formatAge({raw: '< 3m', bound: '<', months: 3}, getIntl('en'))).toBe(
      'under 3 months',
    );
    expect(formatAge({raw: '5y', years: 5, phrase: 'около пяти'}, ru)).toBe(
      '5 лет («около пяти»)',
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
