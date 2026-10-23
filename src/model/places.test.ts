import {describe, expect, it} from 'vitest';
import {personPath, placeIndex, spread} from './places';
import {doc7, SETTINGS, treeOf} from './test-utils';

const place = (name: string, lat?: number, lon?: number) => [
  `2 PLAC ${name}`,
  ...(lat !== undefined ? ['3 MAP', `4 LATI N${lat}`, `4 LONG E${lon}`] : []),
];

const T = treeOf(
  doc7(
    '0 @A@ INDI',
    '1 NAME Илья /Соколов/',
    '1 BIRT',
    '2 DATE 1830',
    ...place('Покровское, Старицкий уезд', 56.6, 34.5),
    '1 FAMS @F1@',
    '0 @W@ INDI',
    '1 FAMS @F1@',
    '0 @B@ INDI',
    '1 NAME Пётр /Соколов/',
    '1 BIRT',
    '2 DATE 1858',
    ...place('Старица', 56.5, 34.9),
    '1 RESI',
    ...place('Горки'),
    '1 DEAT',
    '2 DATE 1921',
    ...place('Калинин', 56.86, 35.9),
    '1 FAMC @F1@',
    '1 FAMS @F2@',
    '0 @V@ INDI',
    '1 FAMS @F2@',
    '0 @C@ INDI',
    '1 BIRT',
    '2 DATE 1889',
    ...place('Старица', 56.5, 34.9),
    '1 FAMC @F2@',
    '0 @D@ INDI',
    '1 BIRT',
    '2 DATE 1891',
    ...place('Калинин', 56.86, 35.9),
    '1 FAMC @F2@',
    '0 @F1@ FAM',
    '1 HUSB @A@',
    '1 WIFE @W@',
    '1 CHIL @B@',
    '0 @F2@ FAM',
    '1 HUSB @B@',
    '1 WIFE @V@',
    '1 CHIL @C@',
    '1 CHIL @D@',
    '1 MARR',
    '2 DATE 1886',
    ...place('Старица', 56.5, 34.9),
  ),
);

describe('placeIndex', () => {
  it('groups events by place, most events first; places without coordinates apart', () => {
    const {mapped, unmapped} = placeIndex(T, SETTINGS);
    expect(mapped.map((p) => [p.name, p.events.length])).toEqual([
      ['Старица', 3],
      ['Калинин', 2],
      ['Покровское', 1],
    ]);
    expect(mapped[0]!.events.map((e) => e.kind).sort()).toEqual([
      'birth',
      'birth',
      'marriage',
    ]);
    expect(unmapped).toEqual([{raw: 'Горки', name: 'Горки', count: 1}]);
  });
});

describe('personPath', () => {
  it('orders a person’s events by date, marriages included', () => {
    const {steps, undated} = personPath(T, T.indis.get('B')!);
    expect(steps.map((s) => [s.tag, s.name])).toEqual([
      ['BIRT', 'Старица'],
      ['MARR', 'Старица'],
      ['DEAT', 'Калинин'],
    ]);
    expect(undated.map((s) => s.name)).toEqual(['Горки']);
  });
});

describe('spread', () => {
  it('counts births per place and the flows between them', () => {
    const s = spread(T, SETTINGS, 'A');
    expect(s.people).toBe(4);
    expect(Object.fromEntries(s.nodes.map((n) => [n.name, n.born]))).toEqual({
      Покровское: 1,
      Старица: 2,
      Калинин: 1,
    });
    const flow = (to: string) => s.flows.find((f) => f.to.startsWith(to))!;
    // Pokrovskoye → Staritsa carries Пётр and his two children.
    expect(flow('Старица').count).toBe(3);
    expect(flow('Калинин')).toMatchObject({count: 1, years: [1891, 1891]});
  });
});
