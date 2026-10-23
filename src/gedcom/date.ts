// GEDCOM date parsing (FamilySearch GEDCOM 7.0 DateValue / DatePeriod /
// DateExact grammar plus the legacy 5.5.1 forms), sorting and a plain
// English formatter. Pure functions.

import {isStandardCalendar, monthIndexOf, startJdn, toJdn} from './calendar';
import type {
  Calendar,
  CalendarDate,
  DateQualifier,
  DateValue,
  ParsedDate,
} from './types';

const QUALIFIERS: readonly string[] = ['ABT', 'CAL', 'EST'];

// Calendars that 5.5.1 could name but 7.0 does not define.
const LEGACY_CALENDARS: readonly string[] = ['ROMAN', 'UNKNOWN'];

const isNumber = (s: string) => /^\d+$/.test(s);
const isExtTag = (s: string) => /^_[A-Z0-9_]+$/.test(s);

/** Parses one `date` production: [calendar] [[day] month] year [epoch].
 *  Tokens are already upper-cased and the 5.5.1 @#D…@ escapes rewritten. */
function parseCalendarDate(input: string[]): CalendarDate | undefined {
  const tokens = [...input];
  let calendar: Calendar = 'GREGORIAN';
  const first = tokens[0];
  if (
    first !== undefined &&
    tokens.length >= 2 &&
    (isStandardCalendar(first) ||
      LEGACY_CALENDARS.includes(first) ||
      isExtTag(first))
  ) {
    calendar = first;
    tokens.shift();
  }

  let bce = false;
  let epoch: string | undefined;
  const last = tokens[tokens.length - 1];
  if (last === 'BCE') {
    bce = true;
    tokens.pop();
  } else if (
    last !== undefined &&
    isExtTag(last) &&
    tokens.length >= 2 &&
    /^\d+(\/\d+)?$/.test(tokens[tokens.length - 2]!)
  ) {
    epoch = last;
    tokens.pop();
  }

  const yearToken = tokens.pop();
  const yearMatch = yearToken && /^(\d+)(?:\/(\d+))?$/.exec(yearToken);
  if (!yearMatch) return undefined;
  const result: CalendarDate = {
    calendar,
    year: Number(yearMatch[1]),
    bce,
  };
  if (yearMatch[2] !== undefined) result.dualYear = yearMatch[2];
  if (epoch) result.epoch = epoch;

  const monthToken = tokens[tokens.length - 1];
  if (monthToken !== undefined && !isNumber(monthToken)) {
    tokens.pop();
    result.month = monthToken;
    const index = monthIndexOf(calendar, monthToken);
    if (index !== undefined) {
      result.monthIndex = index;
    } else if (isStandardCalendar(calendar) && !isExtTag(monthToken)) {
      return undefined; // not a month of this calendar
    }
    const dayToken = tokens[tokens.length - 1];
    if (dayToken !== undefined && isNumber(dayToken)) {
      tokens.pop();
      result.day = Number(dayToken);
    }
  }
  return tokens.length === 0 ? result : undefined;
}

/** Splits `tokens` at the first token equal to `word`. */
function splitAt(
  tokens: string[],
  word: string,
): [string[], string[]] | undefined {
  const i = tokens.indexOf(word);
  return i < 0 ? undefined : [tokens.slice(0, i), tokens.slice(i + 1)];
}

function parseTokens(tokens: string[]): DateValue {
  const unparsed: DateValue = {kind: 'unparsed'};
  if (tokens.length === 0) return {kind: 'empty'};
  const head = tokens[0]!;
  const rest = tokens.slice(1);

  if (QUALIFIERS.includes(head)) {
    const date = parseCalendarDate(rest);
    return date
      ? {kind: 'exact', date, qualifier: head as DateQualifier}
      : unparsed;
  }
  switch (head) {
    case 'BEF':
    case 'AFT': {
      const date = parseCalendarDate(rest);
      if (!date) return unparsed;
      return head === 'BEF'
        ? {kind: 'range', type: 'BEF', to: date}
        : {kind: 'range', type: 'AFT', from: date};
    }
    case 'BET': {
      const parts = splitAt(rest, 'AND');
      if (!parts) return unparsed;
      const from = parseCalendarDate(parts[0]);
      const to = parseCalendarDate(parts[1]);
      return from && to ? {kind: 'range', type: 'BET', from, to} : unparsed;
    }
    case 'FROM': {
      const parts = splitAt(rest, 'TO');
      if (!parts) {
        const from = parseCalendarDate(rest);
        return from ? {kind: 'period', from} : unparsed;
      }
      const from = parseCalendarDate(parts[0]);
      const to = parseCalendarDate(parts[1]);
      return from && to ? {kind: 'period', from, to} : unparsed;
    }
    case 'TO': {
      const to = parseCalendarDate(rest);
      return to ? {kind: 'period', to} : unparsed;
    }
    default: {
      const date = parseCalendarDate(tokens);
      return date ? {kind: 'exact', date} : unparsed;
    }
  }
}

/** Parses a DATE payload. `phrase` and `time` come from the PHRASE and TIME
 *  substructures. 5.5.1 forms are normalised: `@#DJULIAN@` becomes the
 *  JULIAN calendar, `(phrase)` and `INT date (phrase)` put the text into
 *  `phrase`. Never throws; invalid text gives kind "unparsed". */
export function parseDate(
  raw: string,
  extra: {phrase?: string; time?: string} = {},
): ParsedDate {
  let text = raw.trim();
  let phrase = extra.phrase;

  // 5.5.1: trailing "(phrase)", also as "INT date (phrase)" or a bare "(phrase)".
  const paren = /^(.*?)\s*\(([^()]*)\)$/s.exec(text);
  if (paren) {
    text = paren[1]!.trim();
    phrase ??= paren[2]!.trim();
  }
  text = text.replace(/^INT(\s+|$)/i, '');

  const normalised = text
    .replace(/@#D([^@]*)@/gi, (_m, name: string) => {
      return ` ${name.trim().replace(/\s+/g, '_')} `;
    })
    .trim()
    .toUpperCase();
  const tokens = normalised === '' ? [] : normalised.split(/\s+/);

  const result: ParsedDate = {raw, value: parseTokens(tokens)};
  if (phrase) result.phrase = phrase;
  if (extra.time) result.time = extra.time;
  return result;
}

// ---------------------------------------------------------------- sorting

/** The CalendarDate a sort should start from. */
function sortDate(value: DateValue): CalendarDate | undefined {
  switch (value.kind) {
    case 'exact':
      return value.date;
    case 'range':
      return value.from ?? value.to;
    case 'period':
      return value.from ?? value.to;
    default:
      return undefined;
  }
}

/** Julian Day Number a date sorts by: the first day it can mean, ranges by
 *  their start. Undefined for empty, invalid and extension-calendar dates. */
export function dateSortKey(date: ParsedDate | undefined): number | undefined {
  if (!date) return undefined;
  const d = sortDate(date.value);
  return d ? startJdn(d) : undefined;
}

/** Orders dates chronologically; dates without a usable key come last and
 *  compare equal to each other (so a stable sort keeps their order). */
export function compareDates(
  a: ParsedDate | undefined,
  b: ParsedDate | undefined,
): number {
  const ka = dateSortKey(a);
  const kb = dateSortKey(b);
  if (ka === undefined) return kb === undefined ? 0 : 1;
  if (kb === undefined) return -1;
  return ka - kb;
}

/** Julian Day Number of an exact, fully specified date; undefined otherwise. */
export function exactJdn(date: ParsedDate | undefined): number | undefined {
  if (date?.value.kind !== 'exact') return undefined;
  return toJdn(date.value.date);
}

// ------------------------------------------------------------- formatting

const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const CALENDAR_NAMES_EN: Record<string, string> = {
  GREGORIAN: 'Gregorian',
  JULIAN: 'Julian',
  FRENCH_R: 'French Republican',
  HEBREW: 'Hebrew',
};

export function calendarNameEn(calendar: Calendar): string {
  return CALENDAR_NAMES_EN[calendar] ?? calendar;
}

/** "6 Apr 1889", "Apr 1889", "1889", "44 BCE", "30 Jan 1648/49". Gregorian
 *  and Julian months are shown in English; other calendars keep their tag. */
export function formatCalendarDate(d: CalendarDate): string {
  const western = d.calendar === 'GREGORIAN' || d.calendar === 'JULIAN';
  const month =
    d.month === undefined
      ? undefined
      : western && d.monthIndex !== undefined
        ? MONTHS_EN[d.monthIndex - 1]
        : d.month;
  const year =
    d.dualYear === undefined ? `${d.year}` : `${d.year}/${d.dualYear}`;
  return [d.day, month, year, d.bce ? 'BCE' : d.epoch]
    .filter((x) => x !== undefined)
    .join(' ');
}

/** English text of a whole date, e.g. "about 6 Apr 1889", "between 1890 and
 *  1892". The calendar is added in brackets for non-Gregorian dates when
 *  `withCalendar` is set. Falls back to the phrase, then to the raw text. */
export function formatDateEn(date: ParsedDate, withCalendar = true): string {
  const one = (d: CalendarDate) =>
    withCalendar && d.calendar !== 'GREGORIAN'
      ? `${formatCalendarDate(d)} (${calendarNameEn(d.calendar)})`
      : formatCalendarDate(d);
  const v = date.value;
  switch (v.kind) {
    case 'exact': {
      const q = {ABT: 'about', CAL: 'calculated', EST: 'estimated'};
      return [v.qualifier && q[v.qualifier], one(v.date)]
        .filter(Boolean)
        .join(' ');
    }
    case 'range':
      if (v.type === 'BET') return `between ${one(v.from!)} and ${one(v.to!)}`;
      return v.type === 'BEF'
        ? `before ${one(v.to!)}`
        : `after ${one(v.from!)}`;
    case 'period':
      return [
        v.from && `from ${one(v.from)}`,
        v.to && `${v.from ? 'to' : 'until'} ${one(v.to)}`,
      ]
        .filter(Boolean)
        .join(' ');
    case 'empty':
      return date.phrase ?? '';
    case 'unparsed':
      return date.raw.trim();
  }
}
