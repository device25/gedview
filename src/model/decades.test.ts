import {describe, expect, it} from 'vitest';
import {birthYear, decadeFill, decadeScale} from './decades';
import {doc7, treeOf} from './test-utils';

const tree = treeOf(
  doc7(
    '0 @I1@ INDI',
    '1 BIRT',
    '2 DATE 6 APR 1889',
    '0 @I2@ INDI',
    '1 CHR',
    '2 DATE ABT 1862',
    '0 @I3@ INDI',
    '1 RESN PRIVACY',
    '1 BIRT',
    '2 DATE 1986',
    '0 @I4@ INDI',
    '1 BIRT',
    '2 DATE 1921',
    '2 RESN CONFIDENTIAL',
    '0 @I5@ INDI',
    '1 NAME Без /Даты/',
  ),
);
const indi = (id: string) => tree.indis.get(id)!;
const hide = {hideRestricted: true};
const show = {hideRestricted: false};

describe('birthYear', () => {
  it('is the birth year, else the christening year, approximate too', () => {
    expect(birthYear(indi('I1'), hide)).toBe(1889);
    expect(birthYear(indi('I2'), hide)).toBe(1862);
    expect(birthYear(indi('I5'), hide)).toBeUndefined();
  });

  it('is not given away when the card hides it', () => {
    expect(birthYear(indi('I3'), hide)).toBeUndefined();
    expect(birthYear(indi('I4'), hide)).toBeUndefined();
    expect(birthYear(indi('I3'), show)).toBe(1986);
    expect(birthYear(indi('I4'), show)).toBe(1921);
  });
});

describe('the decade scale', () => {
  it('runs over the whole file, only over years the cards show', () => {
    expect(decadeScale(tree, hide)).toEqual({first: 1860, last: 1880});
    expect(decadeScale(tree, show)).toEqual({first: 1860, last: 1980});
  });

  it('gives the oldest and the youngest decade the end colours', () => {
    const scale = {first: 1840, last: 2020};
    expect(decadeFill(1845, scale)).toBe('var(--decade-0)');
    expect(decadeFill(2023, scale)).toBe('var(--decade-7)');
    expect(decadeFill(1930, scale)).toMatch(
      /^color-mix\(in oklab, var\(--decade-3\) \d+%, var\(--decade-4\)\)$/,
    );
  });

  it('keeps neighbouring decades apart', () => {
    const scale = {first: 1840, last: 2020};
    expect(decadeFill(1880, scale)).not.toBe(decadeFill(1890, scale));
  });
});
