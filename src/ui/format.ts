import type {
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
  style: DateStyle;
  /** Abbreviated month ("апр") for one-line life spans. */
  short?: boolean;
}

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

/** Localised month name. "genitive" is the form used after a day number. */
function monthName(
  locale: string,
  index: number,
  form: 'genitive' | 'standalone',
  short: boolean,
): string {
  const key = `${locale}|${index}|${form}|${short}`;
  let name = monthCache.get(key);
  if (name === undefined) {
    const date = new Date(Date.UTC(2001, index - 1, 15));
    const fmt = new Intl.DateTimeFormat(locale, {
      month: short ? 'short' : 'long',
      ...(form === 'genitive' ? {day: 'numeric'} : {}),
      timeZone: 'UTC',
    });
    const part = fmt.formatToParts(date).find((p) => p.type === 'month');
    name = (part?.value ?? MONTH_TAGS[index - 1] ?? '').replace(/\.$/, '');
    monthCache.set(key, name);
  }
  return name;
}

function monthIndexOf(c: CalendarDate): number | undefined {
  if (c.monthIndex) return c.monthIndex;
  const i = c.month ? MONTH_TAGS.indexOf(c.month) : -1;
  return i >= 0 ? i + 1 : undefined;
}

const isGregorian = (c: CalendarDate) => c.calendar === 'GREGORIAN';
/** Julian months have the same names as Gregorian ones. */
const hasCommonMonths = (c: CalendarDate) =>
  isGregorian(c) || c.calendar === 'JULIAN';

/** Short marker for a non-Gregorian calendar ("ст. ст." for Julian). */
export function calendarMarker(calendar: string, intl: IntlShape): string {
  if (calendar === 'GREGORIAN') return '';
  const id = `date.calendar.${calendar}`;
  if (id in intl.messages) return intl.formatMessage({id});
  return calendar.replace(/^_/, '').replace(/_/g, ' ');
}

function formatParts(c: CalendarDate, o: DateFormatOptions): string {
  const intl = getIntl(o.locale);
  const parts: string[] = [];
  const common = hasCommonMonths(c);
  const mi = monthIndexOf(c);
  if (c.day) parts.push(String(c.day));
  if (c.month || mi) {
    if (common && mi) {
      parts.push(
        monthName(o.locale, mi, c.day ? 'genitive' : 'standalone', !!o.short),
      );
    } else {
      parts.push(c.month ?? String(mi));
    }
  }
  let year = String(c.year);
  if (c.dualYear) year += `/${c.dualYear}`;
  if (c.bce) year += ` ${intl.formatMessage({id: 'date.bce'})}`;
  parts.push(year);
  return parts.join(' ');
}

/**
 * Text of one calendar date, without calendar marker.
 * TODO(part E): for JULIAN with style "both"/"gregorian" append / replace
 * with the Gregorian date (needs JDN conversion, not done here).
 */
export function formatCalendarDate(
  c: CalendarDate,
  o: DateFormatOptions,
): string {
  return formatParts(c, o);
}

function withMarker(
  text: string,
  dates: Array<CalendarDate | undefined>,
  o: DateFormatOptions,
): string {
  const present = dates.filter((d): d is CalendarDate => !!d);
  const first = present[0];
  if (!first || isGregorian(first)) return text;
  const intl = getIntl(o.locale);
  // One marker for the whole expression when every date shares the calendar.
  const marker = calendarMarker(first.calendar, intl);
  return marker ? `${text} ${marker}` : text;
}

/**
 * Human-readable text of a GEDCOM date for the given UI language.
 * Gregorian dates are fully localised. Other calendars are shown as written
 * with a calendar marker.
 */
export function formatDate(
  date: ParsedDate | undefined,
  o: DateFormatOptions,
): string {
  if (!date) return '';
  const intl = getIntl(o.locale);
  const v = date.value;
  const one = (c?: CalendarDate) => (c ? formatCalendarDate(c, o) : '');
  const mixed = (list: Array<CalendarDate | undefined>) => {
    const cals = new Set(list.filter(Boolean).map((c) => c?.calendar));
    return cals.size > 1;
  };
  // Dates of mixed calendars carry their own marker.
  const each = (c?: CalendarDate) => (c ? withMarker(one(c), [c], o) : '');

  switch (v.kind) {
    case 'exact': {
      let text = withMarker(one(v.date), [v.date], o);
      if (v.qualifier) {
        text = `${intl.formatMessage({id: `date.qualifier.${v.qualifier}`})} ${text}`;
      }
      return text;
    }
    case 'range': {
      if (v.type === 'BET') {
        const list = [v.from, v.to];
        const [a, b] = mixed(list)
          ? [each(v.from), each(v.to)]
          : [one(v.from), one(v.to)];
        const text = intl.formatMessage({id: 'date.between'}, {a, b});
        return mixed(list) ? text : withMarker(text, list, o);
      }
      const single = v.from ?? v.to;
      const text = intl.formatMessage(
        {id: v.type === 'BEF' ? 'date.before' : 'date.after'},
        {a: one(single)},
      );
      return withMarker(text, [single], o);
    }
    case 'period': {
      const list = [v.from, v.to];
      const m = mixed(list);
      const a = m ? each(v.from) : one(v.from);
      const b = m ? each(v.to) : one(v.to);
      let text: string;
      if (v.from && v.to)
        text = intl.formatMessage({id: 'date.fromTo'}, {a, b});
      else if (v.from) text = intl.formatMessage({id: 'date.from'}, {a});
      else text = intl.formatMessage({id: 'date.to'}, {b});
      return m ? text : withMarker(text, list, o);
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

/** "6 апр 1889 ст. ст. — 1957"; empty when nothing is known. */
export function lifeSpan(indi: IndiView, o: DateFormatOptions): string {
  const opts = {...o, short: true};
  const born = eventOf(indi, ['BIRT', 'CHR', 'BAPM']);
  const died = eventOf(indi, ['DEAT', 'BURI']);
  const b = formatDate(born?.date, opts);
  const d = formatDate(died?.date, opts);
  const deathKnown = indi.events.some(
    (e) => e.tag === 'DEAT' || e.tag === 'BURI',
  );
  const words = LIFE_WORDS[o.locale.slice(0, 2)] ?? LIFE_WORDS.en!;
  if (b && d) return `${b} — ${d}`;
  // Died, date unknown: keep the dash but say so instead of leaving it open.
  if (b && deathKnown) return `${b} — ?`;
  if (b) return `${words.born} ${b}`;
  if (d) return `${words.died} ${d}`;
  return '';
}

// Life-span prefixes are part of a compact date string built outside React,
// so they live here rather than in the message catalogues.
const LIFE_WORDS: Record<string, {born: string; died: string}> = {
  en: {born: 'b.', died: 'd.'},
  ru: {born: 'род.', died: 'ум.'},
};

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
