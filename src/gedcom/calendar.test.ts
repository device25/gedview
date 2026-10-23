import {describe, expect, it} from 'vitest';
import {
  convertCalendarDate,
  daysInMonth,
  gregorianToJdn,
  jdnToCalendarDate,
  julianGregorianGap,
  julianToJdn,
  startJdn,
  toJdn,
} from './calendar';
import type {CalendarDate} from './types';

const cd = (
  calendar: string,
  year: number,
  monthIndex?: number,
  day?: number,
  bce = false,
): CalendarDate => ({calendar, year, monthIndex, day, bce});

describe('Julian Day Number', () => {
  it('matches known reference values', () => {
    expect(gregorianToJdn(2000, 1, 1)).toBe(2451545);
    expect(gregorianToJdn(1858, 11, 17)).toBe(2400001); // MJD epoch
    expect(julianToJdn(-4712, 1, 1)).toBe(0); // 1 JAN 4713 BCE Julian
    expect(julianToJdn(1582, 10, 5)).toBe(gregorianToJdn(1582, 10, 15));
  });

  it('JULIAN 6 APR 1889 is GREGORIAN 18 APR 1889', () => {
    const g = convertCalendarDate(cd('JULIAN', 1889, 4, 6), 'GREGORIAN')!;
    expect([g.year, g.monthIndex, g.day, g.month]).toEqual([
      1889,
      4,
      18,
      'APR',
    ]);
  });

  it('JULIAN 1 FEB 1918 is GREGORIAN 14 FEB 1918', () => {
    const g = convertCalendarDate(cd('JULIAN', 1918, 2, 1), 'GREGORIAN')!;
    expect([g.year, g.monthIndex, g.day]).toEqual([1918, 2, 14]);
  });

  it('the gap is 12 days in the 19th century and 13 in 1900-1918', () => {
    expect(julianGregorianGap(toJdn(cd('JULIAN', 1800, 6, 1))!)).toBe(12);
    expect(julianGregorianGap(toJdn(cd('JULIAN', 1889, 4, 6))!)).toBe(12);
    expect(julianGregorianGap(toJdn(cd('JULIAN', 1899, 12, 31))!)).toBe(12);
    expect(julianGregorianGap(toJdn(cd('JULIAN', 1900, 3, 1))!)).toBe(13);
    expect(julianGregorianGap(toJdn(cd('JULIAN', 1918, 1, 31))!)).toBe(13);
  });

  it('JULIAN 29 FEB 1900 exists, GREGORIAN 29 FEB 1900 does not', () => {
    const j = cd('JULIAN', 1900, 2, 29);
    expect(toJdn(j)).toBeDefined();
    const g = convertCalendarDate(j, 'GREGORIAN')!;
    expect([g.year, g.monthIndex, g.day]).toEqual([1900, 3, 13]);
    expect(toJdn(cd('GREGORIAN', 1900, 2, 29))).toBeUndefined();
    expect(toJdn(cd('GREGORIAN', 2000, 2, 29))).toBeDefined();
    expect(toJdn(cd('GREGORIAN', 2100, 2, 29))).toBeUndefined();
    expect(toJdn(cd('JULIAN', 2100, 2, 29))).toBeDefined();
    expect(toJdn(cd('JULIAN', 1900, 2, 30))).toBeUndefined();
  });

  it('days follow each other across month, year and era boundaries', () => {
    expect(
      toJdn(cd('JULIAN', 1900, 3, 1))! - toJdn(cd('JULIAN', 1900, 2, 29))!,
    ).toBe(1);
    expect(
      toJdn(cd('GREGORIAN', 1, 1, 1))! -
        toJdn(cd('GREGORIAN', 1, 12, 31, true))!,
    ).toBe(1);
    expect(
      toJdn(cd('JULIAN', 1, 1, 1))! - toJdn(cd('JULIAN', 1, 12, 31, true))!,
    ).toBe(1);
    // 1 BCE is a leap year in the Julian calendar (astronomical year 0)
    expect(toJdn(cd('JULIAN', 1, 2, 29, true))).toBeDefined();
    expect(toJdn(cd('JULIAN', 2, 2, 29, true))).toBeUndefined();
    expect(toJdn(cd('JULIAN', 5, 2, 29, true))).toBeDefined(); // astronomical -4
  });

  it('round-trips through every standard calendar over several centuries', () => {
    const start = gregorianToJdn(1790, 1, 1);
    const end = gregorianToJdn(2030, 12, 31);
    for (let jdn = start; jdn <= end; jdn += 7) {
      for (const cal of [
        'GREGORIAN',
        'JULIAN',
        'HEBREW',
        'FRENCH_R',
      ] as const) {
        const d = jdnToCalendarDate(jdn, cal);
        if (cal === 'FRENCH_R' && jdn < gregorianToJdn(1792, 9, 22)) {
          expect(d).toBeUndefined();
          continue;
        }
        expect(d, `${cal} ${jdn}`).toBeDefined();
        expect(toJdn(d!), `${cal} ${jdn}`).toBe(jdn);
      }
    }
    // ~350,000 conversions: slow on shared CI runners.
  }, 30_000);

  it('round-trips far back for the western calendars', () => {
    for (let y = -4800; y < 3000; y += 37) {
      for (const cal of ['GREGORIAN', 'JULIAN'] as const) {
        const jdn = (cal === 'GREGORIAN' ? gregorianToJdn : julianToJdn)(
          y,
          3,
          9,
        );
        const d = jdnToCalendarDate(jdn, cal)!;
        expect(toJdn(d)).toBe(jdn);
        expect(d.bce).toBe(y <= 0);
      }
    }
  });
});

describe('Hebrew calendar', () => {
  it('knows the Rosh Hashanah dates', () => {
    const rosh = (year: number) => toJdn(cd('HEBREW', year, 1, 1))!;
    expect(rosh(5783)).toBe(gregorianToJdn(2022, 9, 26));
    expect(rosh(5784)).toBe(gregorianToJdn(2023, 9, 16));
    expect(rosh(5785)).toBe(gregorianToJdn(2024, 10, 3));
  });

  it('knows Passover 5784 (15 Nisan = 23 APR 2024)', () => {
    expect(toJdn(cd('HEBREW', 5784, 8, 15))).toBe(gregorianToJdn(2024, 4, 23));
  });

  it('has Adar I only in leap years', () => {
    expect(daysInMonth('HEBREW', 5784, false, 6)).toBe(30); // 5784 is a leap year
    expect(daysInMonth('HEBREW', 5785, false, 6)).toBeUndefined();
    // Adar II 5784 starts the day after Adar I ends
    expect(
      toJdn(cd('HEBREW', 5784, 7, 1))! - toJdn(cd('HEBREW', 5784, 6, 30))!,
    ).toBe(1);
    // plain Adar of a common year is reported as ADS
    const d = jdnToCalendarDate(toJdn(cd('HEBREW', 5785, 7, 10))!, 'HEBREW')!;
    expect([d.month, d.day]).toEqual(['ADS', 10]);
  });
});

describe('French Republican calendar', () => {
  it('starts on 22 SEP 1792', () => {
    expect(toJdn(cd('FRENCH_R', 1, 1, 1))).toBe(gregorianToJdn(1792, 9, 22));
  });

  it('18 Brumaire VIII is 9 NOV 1799', () => {
    expect(toJdn(cd('FRENCH_R', 8, 2, 18))).toBe(gregorianToJdn(1799, 11, 9));
  });

  it('13th month has 5 days, 6 in sextile years', () => {
    expect(daysInMonth('FRENCH_R', 2, false, 13)).toBe(5);
    expect(daysInMonth('FRENCH_R', 3, false, 13)).toBe(6);
    expect(toJdn(cd('FRENCH_R', 3, 13, 6))).toBeDefined();
    expect(toJdn(cd('FRENCH_R', 2, 13, 6))).toBeUndefined();
  });

  it('is abolished on 1 JAN 1806 = 11 Nivose XIV', () => {
    expect(toJdn(cd('FRENCH_R', 14, 4, 11))).toBe(gregorianToJdn(1806, 1, 1));
  });
});

describe('lenient start day', () => {
  it('uses the first day of an incomplete date', () => {
    expect(startJdn(cd('GREGORIAN', 1900))).toBe(gregorianToJdn(1900, 1, 1));
    expect(startJdn(cd('JULIAN', 1900, 5))).toBe(julianToJdn(1900, 5, 1));
    expect(toJdn(cd('GREGORIAN', 1900, 5))).toBeUndefined();
    expect(startJdn(cd('_MY', 1900))).toBeUndefined();
  });
});
