import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {isValidAge, parseAge} from './age';
import {parseGedcom} from './parse';

describe('parseAge', () => {
  it('reads years, months, weeks and days', () => {
    expect(parseAge('99y 11m 3w 6d')).toEqual({
      raw: '99y 11m 3w 6d',
      years: 99,
      months: 11,
      weeks: 3,
      days: 6,
    });
    expect(parseAge('7y')).toEqual({raw: '7y', years: 7});
    expect(parseAge('8d')).toEqual({raw: '8d', days: 8});
    expect(parseAge('0y 0m')).toEqual({raw: '0y 0m', years: 0, months: 0});
  });

  it('reads the < and > bounds with or without a space', () => {
    expect(parseAge('> 10y 2m 3w 1d')).toEqual({
      raw: '> 10y 2m 3w 1d',
      bound: '>',
      years: 10,
      months: 2,
      weeks: 3,
      days: 1,
    });
    expect(parseAge('< 3m')).toMatchObject({bound: '<', months: 3});
    expect(parseAge('>3m')).toMatchObject({bound: '>', months: 3});
  });

  it('accepts values outside the usual range', () => {
    expect(parseAge('1y 30m 100w 400d')).toMatchObject({
      years: 1,
      months: 30,
      weeks: 100,
      days: 400,
    });
  });

  it('reads an empty payload with a PHRASE', () => {
    expect(parseAge('', 'Zero')).toEqual({raw: '', phrase: 'Zero'});
    expect(parseAge('25y', 'Adult')).toEqual({
      raw: '25y',
      years: 25,
      phrase: 'Adult',
    });
  });

  it('turns the 5.5.1 words into a phrase', () => {
    for (const w of ['CHILD', 'INFANT', 'STILLBORN', 'child']) {
      expect(parseAge(w)).toEqual({raw: w, phrase: w});
    }
    expect(parseAge('INFANT', 'Baby').phrase).toBe('Baby');
  });

  it('keeps unreadable text as phrase and never throws', () => {
    expect(parseAge('about 5 years')).toEqual({
      raw: 'about 5 years',
      phrase: 'about 5 years',
    });
    expect(parseAge('5y 5y').years).toBeUndefined();
    expect(parseAge('<')).toEqual({raw: '<', phrase: '<'});
  });

  it('knows what is valid', () => {
    expect(isValidAge('3y 2m')).toBe(true);
    expect(isValidAge('> 0d')).toBe(true);
    expect(isValidAge('')).toBe(true);
    expect(isValidAge('STILLBORN')).toBe(true);
    expect(isValidAge('2m 3y')).toBe(false); // wrong order
    expect(isValidAge('3 years')).toBe(false);
    expect(isValidAge('<')).toBe(false);
  });

  it('reads every age in the official age.ged', () => {
    const text = readFileSync(
      join(import.meta.dirname, '../../tests/fixtures/gedcom70/age.ged'),
      'utf8',
    );
    const r = parseGedcom(text);
    expect(r.warnings).toEqual([]);
    const ages = r.byId
      .get('I1')!
      .children.flatMap((c) => c.children.filter((x) => x.tag === 'AGE'));
    expect(ages.length).toBeGreaterThan(80);
    for (const a of ages) {
      const parsed = parseAge(a.value ?? '', a.children[0]?.value);
      expect(parsed.raw).toBe(a.value ?? '');
      if (a.value)
        expect(
          parsed.years ?? parsed.months ?? parsed.weeks ?? parsed.days,
        ).toBeDefined();
    }
  });
});
