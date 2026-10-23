import {
  convertCalendarDate,
  hebrewLeap,
  isStandardCalendar,
  monthIndexOf as tagToMonthIndex,
  monthTags,
} from '../gedcom/calendar';
import type {
  Calendar,
  CalendarDate,
  DateStyle,
  EventDetail,
  IndiView,
  ParsedAge,
  ParsedDate,
  Place,
} from '../gedcom/types';
import {getIntl} from '../i18n';
import type {IntlShape} from 'react-intl';

export interface DateFormatOptions {
  locale: string;
  /**
   * How dates of other calendars are shown. "source": as recorded. "both":
   * as recorded with the Gregorian date in brackets ("6 (18) апреля 1889").
   * "gregorian": only the Gregorian date. Dates that cannot be converted
   * (no day or month, impossible day) are always shown as recorded.
   */
  style: DateStyle;
}

/** Non-breaking space: keeps a day with its month, a number with its noun. */
export const NBSP = ' ';

const MONTH_TAGS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

const monthCache = new Map<string, string>();

/** Localised Gregorian month name, never abbreviated. "genitive" is the form
 *  used after a day number ("6 апреля"). */
function monthName(
  locale: string,
  index: number,
  form: 'genitive' | 'standalone',
): string {
  const key = `${locale}|${index}|${form}`;
  let name = monthCache.get(key);
  if (name === undefined) {
    const date = new Date(Date.UTC(2001, index - 1, 15));
    const fmt = new Intl.DateTimeFormat(locale, {
      month: 'long',
      ...(form === 'genitive' ? {day: 'numeric'} : {}),
      timeZone: 'UTC',
    });
    const part = fmt.formatToParts(date).find((p) => p.type === 'month');
    name = part?.value ?? MONTH_TAGS[index - 1] ?? '';
    monthCache.set(key, name);
  }
  return name;
}

function monthIndexOf(c: CalendarDate): number | undefined {
  if (c.monthIndex) return c.monthIndex;
  return c.month ? tagToMonthIndex(c.calendar as Calendar, c.month) : undefined;
}

/** Month name of the French Republican and Hebrew calendars from the
 *  message files; falls back to the tag as written. */
function calendarMonthName(
  c: CalendarDate,
  index: number | undefined,
  genitive: boolean,
  intl: IntlShape,
): string {
  let tag =
    c.month ?? (index ? monthTags(c.calendar as Calendar)?.[index - 1] : '');
  if (!tag) return '';
  // Adar I and II exist only in a leap year; otherwise it is just "Adar".
  const plainAdar =
    c.calendar === 'HEBREW' &&
    (tag === 'ADR' || tag === 'ADS') &&
    !hebrewLeap(c.year);
  if (plainAdar) tag = 'ADAR';
  const ids = [
    `${genitive ? 'monthGen' : 'month'}.${c.calendar}.${tag}`,
    `month.${c.calendar}.${tag}`,
  ];
  const id = ids.find((i) => i in intl.messages);
  return id ? intl.formatMessage({id}) : tag;
}

/** The date as recorded: "6 апреля 1889", "апрель 1889", "1889", "12 VEND 3". */
function formatParts(c: CalendarDate, o: DateFormatOptions): string {
  const intl = getIntl(o.locale);
  const mi = monthIndexOf(c);
  let monthText = '';
  if (c.month || mi) {
    if (c.calendar === 'GREGORIAN' || c.calendar === 'JULIAN') {
      monthText = mi
        ? monthName(o.locale, mi, c.day ? 'genitive' : 'standalone')
        : (c.month ?? '');
    } else if (isStandardCalendar(c.calendar)) {
      monthText = calendarMonthName(c, mi, !!c.day, intl);
    } else {
      monthText = c.month ?? String(mi);
    }
  }
  let year = String(c.year);
  if (c.dualYear) year += `/${c.dualYear}`;
  if (c.bce) year += `${NBSP}${intl.formatMessage({id: 'date.bce'})}`;
  const dayMonth = [c.day, monthText].filter(Boolean).join(NBSP);
  return [dayMonth, year].filter(Boolean).join(' ');
}

/** Julian dates written as "6 (18) апреля 1889": the day of the new style is
 *  in brackets when it falls in the same month and year. */
function formatJulianBoth(
  c: CalendarDate,
  g: CalendarDate,
  o: DateFormatOptions,
): string {
  const recorded = formatParts(c, o);
  const sameMonth =
    !c.bce &&
    !g.bce &&
    g.year === c.year &&
    g.monthIndex === c.monthIndex &&
    c.day !== undefined &&
    g.day !== undefined;
  if (!sameMonth) return `${recorded} (${formatParts(g, o)})`;
  const month = monthName(o.locale, c.monthIndex!, 'genitive');
  return `${c.day}${NBSP}(${g.day})${NBSP}${month} ${c.year}`;
}

/** The date in the Gregorian calendar when it can be converted exactly. A
 *  month without a day cannot be: it would hide a shift of up to 13 days. */
function toGregorian(c: CalendarDate): CalendarDate | undefined {
  if (c.calendar === 'GREGORIAN' || !isStandardCalendar(c.calendar))
    return undefined;
  if (c.dualYear !== undefined || c.epoch !== undefined) return undefined;
  return convertCalendarDate(c, 'GREGORIAN');
}

/**
 * Text of one calendar date. Gregorian dates are fully localised. Julian
 * dates follow the Russian tradition: the recorded date, the new style in
 * brackets ("6 (18) апреля 1889", "20 декабря 1899 (1 января 1900)"). French
 * Republican and Hebrew dates are shown as recorded with the Gregorian date
 * in brackets. Partial dates are never converted.
 */
export function formatCalendarDate(
  c: CalendarDate,
  o: DateFormatOptions,
): string {
  let text: string;
  const g = o.style === 'source' ? undefined : toGregorian(c);
  if (!g) text = formatParts(c, o);
  else if (o.style === 'gregorian') text = formatParts(g, o);
  else if (c.calendar === 'JULIAN') text = formatJulianBoth(c, g, o);
  else text = `${formatParts(c, o)} (${formatParts(g, o)})`;
  // A calendar we know nothing about keeps its name.
  if (!isStandardCalendar(c.calendar)) {
    const name = c.calendar.replace(/^_/, '').replace(/_/g, ' ');
    return `${text} ${name}`;
  }
  return text;
}

/** A date formatter for the chart model (`ChartDataOptions.formatDate`). */
export function chartDateFormatter(
  locale: string,
): (date: CalendarDate, style: DateStyle) => string {
  return (date, style) => formatCalendarDate(date, {locale, style});
}

/**
 * Human-readable text of a GEDCOM date for the given UI language, with
 * qualifiers and ranges in words, never abbreviated.
 */
export function formatDate(
  date: ParsedDate | undefined,
  o: DateFormatOptions,
): string {
  if (!date) return '';
  const intl = getIntl(o.locale);
  const v = date.value;
  const one = (c?: CalendarDate) => (c ? formatCalendarDate(c, o) : '');

  switch (v.kind) {
    case 'exact': {
      const text = one(v.date);
      if (!v.qualifier) return text;
      const word = intl.formatMessage({id: `date.qualifier.${v.qualifier}`});
      return `${word}${NBSP}${text}`;
    }
    case 'range': {
      if (v.type === 'BET') {
        return intl.formatMessage(
          {id: 'date.between'},
          {a: one(v.from), b: one(v.to)},
        );
      }
      return intl.formatMessage(
        {id: v.type === 'BEF' ? 'date.before' : 'date.after'},
        {a: one(v.from ?? v.to)},
      );
    }
    case 'period': {
      const a = one(v.from);
      const b = one(v.to);
      if (v.from && v.to)
        return intl.formatMessage({id: 'date.fromTo'}, {a, b});
      if (v.from) return intl.formatMessage({id: 'date.from'}, {a});
      return intl.formatMessage({id: 'date.to'}, {b});
    }
    case 'empty':
      return date.phrase ?? '';
    case 'unparsed':
      return date.raw;
  }
}

function eventOf(indi: IndiView, tags: string[]): EventDetail | undefined {
  for (const tag of tags) {
    const e = indi.events.find((ev) => ev.tag === tag && ev.date);
    if (e) return e;
  }
  return undefined;
}

/**
 * Two ends of a range with the dash of the language (Russian norm: the long
 * dash; no spaces between simple numbers, spaces around it when either side
 * has spaces: "1858—1921", "6 апреля 1889 — 1957").
 */
export function joinRange(a: string, b: string, locale: string): string {
  const dash = getIntl(locale).formatMessage({id: 'date.rangeDash'});
  return /\s/.test(a) || /\s/.test(b)
    ? `${a}${NBSP}${dash} ${b}`
    : `${a}${dash}${b}`;
}

/** "6 апреля 1889 — 1957", "1858—1921"; empty when nothing is known. */
export function lifeSpan(indi: IndiView, o: DateFormatOptions): string {
  const born = eventOf(indi, ['BIRT', 'CHR', 'BAPM']);
  const died = eventOf(indi, ['DEAT', 'BURI']);
  const b = formatDate(born?.date, o);
  const d = formatDate(died?.date, o);
  const deathKnown = indi.events.some(
    (e) => e.tag === 'DEAT' || e.tag === 'BURI',
  );
  if (b && d) return joinRange(b, d, o.locale);
  // Death recorded without a date: say it is unknown rather than end on a dash.
  if (b) return deathKnown ? joinRange(b, '?', o.locale) : b;
  if (d) return joinRange('?', d, o.locale);
  return '';
}

export function displayName(indi: IndiView | undefined, fallback = ''): string {
  return indi?.names[0]?.display || fallback || indi?.id || '';
}

/** Two capital letters from the first and last words of a name. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** "7 years", "3 months 2 days", "over 7 years"; the phrase is appended. */
export function formatAge(age: ParsedAge, intl: IntlShape): string {
  const part = (id: string, n: number | undefined) =>
    n === undefined ? [] : [intl.formatMessage({id}, {n})];
  let text = [
    ...part('age.years', age.years),
    ...part('age.months', age.months),
    ...part('age.weeks', age.weeks),
    ...part('age.days', age.days),
  ].join(' ');
  if (!text) return age.phrase || age.raw;
  if (age.bound) {
    text = intl.formatMessage(
      {id: age.bound === '>' ? 'age.greater' : 'age.less'},
      {age: text},
    );
  }
  return age.phrase ? `${text} («${age.phrase}»)` : text;
}

/**
 * Place for display. GEDCOM 7.0 keeps empty jurisdictions to stay aligned
 * with PLAC.FORM ("Town, , Region"); they are skipped here, never shown as
 * ", ,". The full form stays in `place.raw` / `place.parts`.
 */
export function formatPlace(place: Pick<Place, 'raw' | 'parts'>): string {
  const parts = place.parts.length ? place.parts : place.raw.split(',');
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');
}
