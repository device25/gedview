import {describe, expect, it} from 'vitest';
import {gregorianToJdn} from '../gedcom/calendar';
import {dateBounds} from './bounds';
import {parseDate} from '../gedcom/date';
import {placesWithoutCoordinates, runChecks} from './checks';
import {ancestorGrid, summaryFigures, surnameKey} from './summary';
import {doc7, SETTINGS, treeOf} from './test-utils';

const TODAY = gregorianToJdn(2026, 10, 23);
const ids = (
  t: ReturnType<typeof treeOf>,
  check: keyof ReturnType<typeof runChecks>,
) => runChecks(t, TODAY)[check].map((f) => f.id);

describe('dateBounds', () => {
  const b = (raw: string) => dateBounds(parseDate(raw));
  it('a year is the whole year, a month the whole month', () => {
    expect(b('1889')).toEqual({
      lo: gregorianToJdn(1889, 1, 1),
      hi: gregorianToJdn(1889, 12, 31),
    });
    expect(b('APR 1889')!.hi).toBe(gregorianToJdn(1889, 4, 30));
  });
  it('approximate dates have no bounds; ranges keep their ends', () => {
    expect(b('ABT 1830')).toBeUndefined();
    expect(b('BET 1880 AND 1885')).toEqual({
      lo: gregorianToJdn(1880, 1, 1),
      hi: gregorianToJdn(1885, 12, 31),
    });
    expect(b('BEF 1900')).toEqual({
      lo: undefined,
      hi: gregorianToJdn(1900, 12, 31),
    });
  });
});

describe('contradictions', () => {
  it('a birth after the death, and an event before the birth', () => {
    const t = treeOf(
      doc7(
        '0 @A@ INDI',
        '1 BIRT',
        '2 DATE 1900',
        '1 DEAT',
        '2 DATE 1890',
        '0 @B@ INDI',
        '1 BIRT',
        '2 DATE 16 MAR 1861',
        '1 CHR',
        '2 DATE 2 MAR 1861',
        '0 @C@ INDI',
        '1 BIRT',
        '2 DATE ABT 1830',
        '1 RESI',
        '2 DATE 1828',
      ),
    );
    expect(ids(t, 'birthAfterDeath')).toEqual(['A']);
    // C's birth is approximate: nothing is certain about it.
    expect(ids(t, 'eventBeforeBirth')).toEqual(['B']);
  });

  it('a child born after the mother died; a marriage after a death', () => {
    const t = treeOf(
      doc7(
        '0 @M@ INDI',
        '1 SEX F',
        '1 DEAT',
        '2 DATE 1900',
        '1 FAMS @F1@',
        '0 @H@ INDI',
        '1 SEX M',
        '1 FAMS @F1@',
        '0 @K@ INDI',
        '1 BIRT',
        '2 DATE 1905',
        '1 FAMC @F1@',
        '0 @F1@ FAM',
        '1 HUSB @H@',
        '1 WIFE @M@',
        '1 CHIL @K@',
        '1 MARR',
        '2 DATE 1910',
      ),
    );
    expect(ids(t, 'childAfterMother')).toEqual(['K']);
    expect(ids(t, 'marriageAfterDeath')).toEqual(['M']);
  });
});

describe('to review', () => {
  it('a mother too young, a child long after the father died, a remarriage', () => {
    const t = treeOf(
      doc7(
        '0 @M@ INDI',
        '1 SEX F',
        '1 BIRT',
        '2 DATE 1900',
        '1 DEAT',
        '2 DATE 1960',
        '1 FAMS @F1@',
        '0 @H@ INDI',
        '1 SEX M',
        '1 DEAT',
        '2 DATE JAN 1908',
        '1 FAMS @F1@',
        '0 @K@ INDI',
        '1 BIRT',
        '2 DATE 1910',
        '1 FAMC @F1@',
        '0 @W@ INDI',
        '1 SEX M',
        '0 @X@ INDI',
        '1 SEX F',
        '1 FAMS @F2@',
        '0 @F1@ FAM',
        '1 HUSB @H@',
        '1 WIFE @M@',
        '1 CHIL @K@',
        '1 MARR',
        '2 DATE 1905',
        '0 @F2@ FAM',
        '1 HUSB @H@',
        '1 WIFE @X@',
        '1 MARR',
        '2 DATE 1906',
      ),
    );
    expect(ids(t, 'motherAge')).toEqual(['K']);
    expect(ids(t, 'fatherDeath')).toEqual(['K']);
    // H married again in 1906 while M (died 1960) lived, with no divorce.
    expect(ids(t, 'remarriage')).toEqual(['H']);
  });

  it('older than 110 without a death; Julian dates after the switch', () => {
    const t = treeOf(
      doc7(
        '0 @A@ INDI',
        '1 BIRT',
        '2 DATE 1890',
        '0 @B@ INDI',
        '1 BIRT',
        '2 DATE 1990',
        '0 @C@ INDI',
        '1 BIRT',
        '2 DATE JULIAN 5 MAR 1918',
        '0 @D@ INDI',
        '1 BIRT',
        '2 DATE JULIAN 30 JAN 1918',
      ),
    );
    expect(ids(t, 'over110')).toEqual(['A']);
    expect(ids(t, 'julianAfter1918')).toEqual(['C']);
  });
});

describe('gaps', () => {
  it('no sources, no birth date, people outside the main part', () => {
    const t = treeOf(
      doc7(
        '0 @A@ INDI',
        '1 FAMS @F1@',
        '1 SOUR @S1@',
        '0 @B@ INDI',
        '1 FAMS @F1@',
        '1 BIRT',
        '2 DATE 1900',
        '0 @C@ INDI',
        '0 @F1@ FAM',
        '1 HUSB @A@',
        '1 WIFE @B@',
        '0 @S1@ SOUR',
        '1 TITL Книга',
      ),
    );
    expect(ids(t, 'noSources').sort()).toEqual(['B', 'C']);
    expect(ids(t, 'noBirthDate').sort()).toEqual(['A', 'C']);
    expect(ids(t, 'unconnected')).toEqual(['C']);
  });

  it('places without coordinates are counted once each', () => {
    const t = treeOf(
      doc7(
        '0 @A@ INDI',
        '1 BIRT',
        '2 PLAC Горки',
        '1 DEAT',
        '2 PLAC Горки',
        '1 RESI',
        '2 PLAC Старица',
        '3 MAP',
        '4 LATI N56.5',
        '4 LONG E34.9',
      ),
    );
    expect(placesWithoutCoordinates(t)).toEqual(['Горки']);
  });
});

describe('summary figures', () => {
  const t = treeOf(
    doc7(
      '0 @I1@ INDI',
      '1 NAME Иван /Соколов/',
      '1 SEX M',
      '1 BIRT',
      '2 DATE 1889',
      '2 SOUR @S1@',
      '3 QUAY 3',
      '1 FAMC @F1@',
      '0 @I2@ INDI',
      '1 NAME Пётр /Соколов/',
      '1 SEX M',
      '1 BIRT',
      '2 DATE 1858',
      '1 FAMS @F1@',
      '0 @I3@ INDI',
      '1 NAME Мария /Соколова/',
      '1 SEX F',
      '1 FAMS @F1@',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 WIFE @I3@',
      '1 CHIL @I1@',
      '0 @S1@ SOUR',
      '1 TITL Метрическая книга',
    ),
  );
  it('counts people, sources by century, reliability, decades, surnames', () => {
    const f = summaryFigures(t);
    expect(f.people).toBe(3);
    expect(f.births).toEqual([1858, 1889]);
    expect(f.sourced).toBe(1);
    expect(f.byCentury).toEqual([{century: 19, sourced: 1, of: 2}]);
    expect(f.quality).toEqual([1, 0, 0, 0, 0]);
    expect(f.decades[0]).toEqual({decade: 1850, count: 1});
    expect(f.decades.at(-1)).toEqual({decade: 1880, count: 1});
    expect(f.surnames).toEqual([{name: 'Соколов', count: 3}]);
  });

  it('folds female surname forms', () => {
    expect(surnameKey('Соколова')).toBe('Соколов');
    expect(surnameKey('Крылова')).toBe('Крылов');
    expect(surnameKey('Толстая')).toBe('Толстий');
  });

  it('places ancestors in Ahnentafel order', () => {
    const g = ancestorGrid(t, SETTINGS, 'I1', 2, 3);
    expect(g.generations[0]!.map((s) => s.id)).toEqual(['I2', 'I3']);
    expect(g.generations[1]!.every((s) => !s.id)).toBe(true);
    expect(g.lines).toHaveLength(4);
    expect(g.lines[0]!.of).toEqual([2]);
  });
});
