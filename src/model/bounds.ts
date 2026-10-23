// The days a date can mean, as Julian Day Numbers: the first and the last.
// "1889" is the whole year, "APR 1889" the whole month, "BET 1880 AND 1885"
// both years and everything between. Approximate dates (ABT, CAL, EST) have
// no bounds: nothing about them is certain.

import {daysInMonth, startJdn} from '../gedcom/calendar';
import type {CalendarDate, ParsedDate} from '../gedcom/types';

export interface Bounds {
  /** First possible day; undefined = open (BEF …). */
  lo?: number;
  /** Last possible day; undefined = open (AFT …). */
  hi?: number;
}

function first(d: CalendarDate): number | undefined {
  return startJdn(d);
}

function last(d: CalendarDate): number | undefined {
  if (d.day !== undefined) return startJdn(d);
  if (d.monthIndex !== undefined) {
    const days = daysInMonth(d.calendar, d.year, d.bce, d.monthIndex);
    return days === undefined ? undefined : startJdn({...d, day: days});
  }
  // The day before the next year begins (BCE years count down).
  const next = first({
    ...d,
    year: d.bce ? d.year - 1 : d.year + 1,
    bce: d.bce && d.year > 1,
  });
  return next === undefined ? undefined : next - 1;
}

export function dateBounds(date: ParsedDate | undefined): Bounds | undefined {
  const v = date?.value;
  if (!v) return undefined;
  switch (v.kind) {
    case 'exact': {
      if (v.qualifier) return undefined;
      const lo = first(v.date);
      const hi = last(v.date);
      return lo === undefined || hi === undefined ? undefined : {lo, hi};
    }
    case 'range':
    case 'period': {
      const lo = v.from ? first(v.from) : undefined;
      const hi = v.to ? last(v.to) : undefined;
      if (lo === undefined && hi === undefined) return undefined;
      // A FROM/TO period that has only one end says nothing of the other.
      return {lo, hi};
    }
    default:
      return undefined;
  }
}

/** True when `a` certainly ends before `b` begins. */
export function certainlyBefore(a?: Bounds, b?: Bounds): boolean {
  return a?.hi !== undefined && b?.lo !== undefined && a.hi < b.lo;
}

/** Year of a date for counting (births per decade): the first year it can
 *  mean, approximate dates included. */
export function yearOf(date: ParsedDate | undefined): number | undefined {
  const v = date?.value;
  if (!v) return undefined;
  const d =
    v.kind === 'exact'
      ? v.date
      : v.kind === 'range' || v.kind === 'period'
        ? (v.from ?? v.to)
        : undefined;
  if (!d || d.bce) return undefined;
  return d.year;
}
