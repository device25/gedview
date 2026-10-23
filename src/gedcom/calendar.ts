// Calendar arithmetic: Julian Day Numbers for the four calendars of
// FamilySearch GEDCOM 7.0 (GREGORIAN, JULIAN, FRENCH_R, HEBREW) and the
// inverse conversions. Pure functions, no I/O.
//
// A Julian Day Number (JDN) is the integer number of the civil day, so equal
// JDNs mean the same day in any calendar. Gregorian 1 JAN 2000 = 2451545.

import type {Calendar, CalendarDate, ToJdn} from './types';

export const GREGORIAN_MONTHS = [
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
] as const;

export const FRENCH_R_MONTHS = [
  'VEND',
  'BRUM',
  'FRIM',
  'NIVO',
  'PLUV',
  'VENT',
  'GERM',
  'FLOR',
  'PRAI',
  'MESS',
  'THER',
  'FRUC',
  'COMP',
] as const;

/** Hebrew month tags in the order the specification lists them. Both ADR
 *  (Adar I) and ADS (Adar II / Adar) exist; in a common year they are the
 *  same month. */
export const HEBREW_MONTHS = [
  'TSH',
  'CSH',
  'KSL',
  'TVT',
  'SHV',
  'ADR',
  'ADS',
  'NSN',
  'IYR',
  'SVN',
  'TMZ',
  'AAV',
  'ELL',
] as const;

/** Month tags of a standard calendar; undefined for extension calendars. */
export function monthTags(calendar: Calendar): readonly string[] | undefined {
  switch (calendar) {
    case 'GREGORIAN':
    case 'JULIAN':
      return GREGORIAN_MONTHS;
    case 'FRENCH_R':
      return FRENCH_R_MONTHS;
    case 'HEBREW':
      return HEBREW_MONTHS;
    default:
      return undefined;
  }
}

/** 1-based index of a month tag within its calendar. */
export function monthIndexOf(
  calendar: Calendar,
  tag: string,
): number | undefined {
  const tags = monthTags(calendar);
  if (!tags) return undefined;
  const i = tags.indexOf(tag);
  return i < 0 ? undefined : i + 1;
}

export function isStandardCalendar(calendar: Calendar): boolean {
  return (
    calendar === 'GREGORIAN' ||
    calendar === 'JULIAN' ||
    calendar === 'FRENCH_R' ||
    calendar === 'HEBREW'
  );
}

const floor = Math.floor;
const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Proleptic year number used by the formulas: 1 BCE is year 0. */
function astronomicalYear(d: {year: number; bce: boolean}): number {
  return d.bce ? 1 - d.year : d.year;
}

// ------------------------------------------------- Gregorian and Julian

export const isGregorianLeap = (y: number) =>
  mod(y, 4) === 0 && (mod(y, 100) !== 0 || mod(y, 400) === 0);
export const isJulianLeap = (y: number) => mod(y, 4) === 0;

/** `year` is astronomical (1 BCE = 0). */
export function gregorianToJdn(
  year: number,
  month: number,
  day: number,
): number {
  const a = floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    floor((153 * m + 2) / 5) +
    365 * y +
    floor(y / 4) -
    floor(y / 100) +
    floor(y / 400) -
    32045
  );
}

/** `year` is astronomical (1 BCE = 0). */
export function julianToJdn(year: number, month: number, day: number): number {
  const a = floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - 32083;
}

interface Ymd {
  year: number; // astronomical
  month: number;
  day: number;
}

// Richards' algorithm (Explanatory Supplement to the Astronomical Almanac).
function jdnToYmd(jdn: number, gregorian: boolean): Ymd {
  const f = gregorian
    ? jdn + 1401 + floor((floor((4 * jdn + 274277) / 146097) * 3) / 4) - 38
    : jdn + 1401;
  const e = 4 * f + 3;
  const g = floor(mod(e, 1461) / 4);
  const h = 5 * g + 2;
  const day = floor(mod(h, 153) / 5) + 1;
  const month = mod(floor(h / 153) + 2, 12) + 1;
  const year = floor(e / 1461) - 4716 + floor((14 - month) / 12);
  return {year, month, day};
}

// ------------------------------------------------------ French Republican

/** Gregorian dates of 1 Vendémiaire of years 1..14 as they were actually
 *  observed (autumnal equinox in Paris); the calendar was abolished on
 *  1 JAN 1806 = 11 Nivôse XIV. */
const FRENCH_YEAR_STARTS = [
  [1792, 9, 22],
  [1793, 9, 22],
  [1794, 9, 22],
  [1795, 9, 23],
  [1796, 9, 22],
  [1797, 9, 22],
  [1798, 9, 22],
  [1799, 9, 23],
  [1800, 9, 23],
  [1801, 9, 23],
  [1802, 9, 23],
  [1803, 9, 24],
  [1804, 9, 23],
  [1805, 9, 23],
] as const;
const FRENCH_START_JDN = FRENCH_YEAR_STARTS.map(([y, m, d]) =>
  gregorianToJdn(y, m, d),
);

/** JDN of 1 Vendémiaire. Years beyond 14 never existed; they are
 *  extrapolated with Romme's arithmetic rule so that sorting stays sane. */
function frenchYearStart(year: number): number | undefined {
  if (!Number.isInteger(year) || year < 1) return undefined;
  const known = FRENCH_START_JDN[year - 1];
  if (known !== undefined) return known;
  let jdn = FRENCH_START_JDN[13]! + 365; // start of year 15 if year 14 had 365 days
  for (let y = 15; y < year; y++) {
    jdn += 365 + (isGregorianLeap(y) ? 1 : 0);
  }
  return jdn;
}

function frenchToJdn(
  year: number,
  month: number,
  day: number,
): number | undefined {
  const start = frenchYearStart(year);
  return start === undefined ? undefined : start + (month - 1) * 30 + day - 1;
}

function frenchDaysInMonth(year: number, month: number): number | undefined {
  if (month < 13) return 30;
  const a = frenchYearStart(year);
  const b = frenchYearStart(year + 1);
  return a === undefined || b === undefined ? undefined : b - a - 360;
}

function jdnToFrench(jdn: number): Ymd | undefined {
  if (jdn < FRENCH_START_JDN[0]!) return undefined;
  let year = 1;
  while (frenchYearStart(year + 1)! <= jdn) year++;
  const offset = jdn - frenchYearStart(year)!;
  return {year, month: floor(offset / 30) + 1, day: (offset % 30) + 1};
}

// ------------------------------------------------------------ Hebrew
// Algorithm after Calendrical Calculations, with month numbers counted from
// Nisan = 1 (so Tishrei = 7, Adar II = 13) as in the reference code.

const HEBREW_EPOCH_JDN = 347996;

const hebrewLeap = (year: number) => mod(year * 7 + 1, 19) < 7;
const hebrewYearMonths = (year: number) => (hebrewLeap(year) ? 13 : 12);

function hebrewDelay1(year: number): number {
  const months = floor((235 * year - 234) / 19);
  const parts = 12084 + 13753 * months;
  let day = months * 29 + floor(parts / 25920);
  if (mod(3 * (day + 1), 7) < 3) day++;
  return day;
}

function hebrewDelay2(year: number): number {
  const last = hebrewDelay1(year - 1);
  const present = hebrewDelay1(year);
  const next = hebrewDelay1(year + 1);
  if (next - present === 356) return 2;
  if (present - last === 382) return 1;
  return 0;
}

function hebrewYearDays(year: number): number {
  return hebrewToJdnRaw(year + 1, 7, 1) - hebrewToJdnRaw(year, 7, 1);
}

function hebrewMonthDays(year: number, month: number): number {
  if (
    month === 2 ||
    month === 4 ||
    month === 6 ||
    month === 10 ||
    month === 13
  ) {
    return 29;
  }
  if (month === 12 && !hebrewLeap(year)) return 29;
  if (month === 8 && mod(hebrewYearDays(year), 10) !== 5) return 29;
  if (month === 9 && mod(hebrewYearDays(year), 10) === 3) return 29;
  return 30;
}

function hebrewToJdnRaw(year: number, month: number, day: number): number {
  const months = hebrewYearMonths(year);
  let jdn =
    HEBREW_EPOCH_JDN + hebrewDelay1(year) + hebrewDelay2(year) + day + 1;
  if (month < 7) {
    for (let m = 7; m <= months; m++) jdn += hebrewMonthDays(year, m);
    for (let m = 1; m < month; m++) jdn += hebrewMonthDays(year, m);
  } else {
    for (let m = 7; m < month; m++) jdn += hebrewMonthDays(year, m);
  }
  return jdn;
}

/** GEDCOM month index (1 = TSH … 13 = ELL, see HEBREW_MONTHS) to the
 *  Nisan-based month number for a given year. */
function hebrewMonthNumber(year: number, gedcomIndex: number): number {
  switch (gedcomIndex) {
    case 1:
      return 7; // TSH
    case 2:
      return 8; // CSH
    case 3:
      return 9; // KSL
    case 4:
      return 10; // TVT
    case 5:
      return 11; // SHV
    case 6:
      return 12; // ADR (Adar I in a leap year, plain Adar otherwise)
    case 7:
      return hebrewLeap(year) ? 13 : 12; // ADS
    case 8:
      return 1; // NSN
    case 9:
      return 2; // IYR
    case 10:
      return 3; // SVN
    case 11:
      return 4; // TMZ
    case 12:
      return 5; // AAV
    default:
      return 6; // ELL
  }
}

/** Inverse of hebrewMonthNumber. A common-year Adar is reported as ADS, as
 *  the specification recommends. */
function hebrewGedcomIndex(year: number, month: number): number {
  const table = [8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 7, 7];
  if (month === 12 && hebrewLeap(year)) return 6;
  return table[month - 1]!;
}

function hebrewToJdn(
  year: number,
  gedcomMonth: number,
  day: number,
): number | undefined {
  if (!Number.isInteger(year) || year < 1) return undefined;
  return hebrewToJdnRaw(year, hebrewMonthNumber(year, gedcomMonth), day);
}

function hebrewDaysInMonth(
  year: number,
  gedcomMonth: number,
): number | undefined {
  if (!Number.isInteger(year) || year < 1) return undefined;
  if (gedcomMonth === 6 && !hebrewLeap(year)) return undefined; // no Adar I
  return hebrewMonthDays(year, hebrewMonthNumber(year, gedcomMonth));
}

function jdnToHebrew(jdn: number): Ymd | undefined {
  if (jdn < HEBREW_EPOCH_JDN) return undefined;
  const count = floor(((jdn - HEBREW_EPOCH_JDN) * 98496) / 35975351);
  let year = count - 1;
  for (let i = count; jdn >= hebrewToJdnRaw(i, 7, 1); i++) year++;
  const first = jdn < hebrewToJdnRaw(year, 1, 1) ? 7 : 1;
  let month = first;
  while (jdn > hebrewToJdnRaw(year, month, hebrewMonthDays(year, month))) {
    month++;
  }
  const day = jdn - hebrewToJdnRaw(year, month, 1) + 1;
  return {year, month: hebrewGedcomIndex(year, month), day};
}

// ------------------------------------------------------------ public API

/** Number of days in the month of a calendar year, when it is known. */
export function daysInMonth(
  calendar: Calendar,
  year: number,
  bce: boolean,
  monthIndex: number,
): number | undefined {
  switch (calendar) {
    case 'GREGORIAN':
    case 'JULIAN': {
      if (monthIndex < 1 || monthIndex > 12) return undefined;
      const y = astronomicalYear({year, bce});
      if (monthIndex === 2) {
        const leap =
          calendar === 'GREGORIAN' ? isGregorianLeap(y) : isJulianLeap(y);
        return leap ? 29 : 28;
      }
      return [4, 6, 9, 11].includes(monthIndex) ? 30 : 31;
    }
    case 'FRENCH_R':
      if (bce || monthIndex < 1 || monthIndex > 13) return undefined;
      return frenchDaysInMonth(year, monthIndex);
    case 'HEBREW':
      if (bce || monthIndex < 1 || monthIndex > 13) return undefined;
      return hebrewDaysInMonth(year, monthIndex);
    default:
      return undefined;
  }
}

function ymdToJdn(
  calendar: Calendar,
  year: number,
  bce: boolean,
  month: number,
  day: number,
): number | undefined {
  switch (calendar) {
    case 'GREGORIAN':
      return gregorianToJdn(astronomicalYear({year, bce}), month, day);
    case 'JULIAN':
      return julianToJdn(astronomicalYear({year, bce}), month, day);
    case 'FRENCH_R':
      return bce ? undefined : frenchToJdn(year, month, day);
    case 'HEBREW':
      return bce ? undefined : hebrewToJdn(year, month, day);
    default:
      return undefined;
  }
}

/** JDN of a fully specified date (day and month present and valid).
 *  Undefined for incomplete dates, impossible days and extension calendars. */
export const toJdn: ToJdn = (d: CalendarDate) => {
  if (d.day === undefined || d.monthIndex === undefined) return undefined;
  const max = daysInMonth(d.calendar, d.year, d.bce, d.monthIndex);
  if (max === undefined || d.day < 1 || d.day > max) return undefined;
  return ymdToJdn(d.calendar, d.year, d.bce, d.monthIndex, d.day);
};

/** JDN of the first day the date can mean: a missing day or month counts as
 *  the first. For sorting only. */
export function startJdn(d: CalendarDate): number | undefined {
  const month = d.monthIndex ?? 1;
  const day = d.day ?? 1;
  const max = daysInMonth(d.calendar, d.year, d.bce, month);
  if (max === undefined) return undefined;
  return ymdToJdn(d.calendar, d.year, d.bce, month, Math.min(day, max));
}

/** Calendar date of a JDN, in a standard calendar. */
export function jdnToCalendarDate(
  jdn: number,
  calendar: Calendar,
): CalendarDate | undefined {
  let ymd: Ymd | undefined;
  switch (calendar) {
    case 'GREGORIAN':
      ymd = jdnToYmd(jdn, true);
      break;
    case 'JULIAN':
      ymd = jdnToYmd(jdn, false);
      break;
    case 'FRENCH_R':
      ymd = jdnToFrench(jdn);
      break;
    case 'HEBREW':
      ymd = jdnToHebrew(jdn);
      break;
    default:
      return undefined;
  }
  if (!ymd) return undefined;
  const bce =
    ymd.year <= 0 && (calendar === 'GREGORIAN' || calendar === 'JULIAN');
  const tags = monthTags(calendar)!;
  return {
    calendar,
    year: bce ? 1 - ymd.year : ymd.year,
    month: tags[ymd.month - 1],
    monthIndex: ymd.month,
    day: ymd.day,
    bce,
  };
}

/** Converts a fully specified date to another standard calendar. Returns
 *  undefined when the date is incomplete (a month cannot be converted
 *  without its day) or a calendar is unsupported. */
export function convertCalendarDate(
  d: CalendarDate,
  to: Calendar,
): CalendarDate | undefined {
  if (d.calendar === to) return d;
  const jdn = toJdn(d);
  return jdn === undefined ? undefined : jdnToCalendarDate(jdn, to);
}

/** Difference in days between the Julian and the Gregorian calendar on a
 *  given day (Gregorian minus Julian): 12 in the 19th century, 13 from
 *  1 MAR 1900 (Gregorian) until 1 MAR 2100. */
export function julianGregorianGap(jdn: number): number {
  const g = jdnToYmd(jdn, true);
  return (
    julianToJdn(g.year, g.month, g.day) - gregorianToJdn(g.year, g.month, g.day)
  );
}
