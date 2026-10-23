// Behaviour pinned by the small official test files (tests/fixtures/gedcom70).

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {child, children} from '../gedcom/nodes';
import {parseDate} from '../gedcom/date';
import {parseGedcom} from '../gedcom/parse';
import {createContext} from './context';
import {buildChartData} from './chart';
import {decodeFilePath, mediaUrl} from './mediaUrl';
import {associationOf, noteOf} from './structures';
import {SETTINGS, treeOf} from './test-utils';
import {mediaPaths} from './tree';

const read = (name: string) =>
  readFileSync(
    join(import.meta.dirname, '../../tests/fixtures/gedcom70', name),
    'utf8',
  );

describe('notes-1.ged', () => {
  const parse = parseGedcom(read('notes-1.ged'));
  const ctx = createContext(parse);
  const subm = parse.byId.get('1')!;
  const sour = parse.byId.get('2')!;

  it('reads the header note, the inline note and the shared notes', () => {
    expect(child(parse.records[0]!, 'NOTE')?.value).toBe('The header note');
    expect(noteOf(ctx, child(subm, 'NOTE')!)!.text).toBe(
      'An inline submission note',
    );
    const shared = children(sour, 'SNOTE').map((n) => noteOf(ctx, n)!);
    expect(shared.map((n) => [n.sharedNoteId, n.text])).toEqual([
      ['3', 'A single-use note record'],
      ['4', 'A dual-use note record'],
      ['5', 'A cyclic note record'],
    ]);
  });

  it('shares one note record between two structures', () => {
    const a = noteOf(ctx, child(subm, 'SNOTE')!);
    const b = noteOf(ctx, children(sour, 'SNOTE')[1]!);
    expect(a).toBe(b);
  });

  it('survives the note <-> source cycle', () => {
    const cyclic = noteOf(ctx, children(sour, 'SNOTE')[2]!)!;
    expect(cyclic.citations).toMatchObject([{sourceId: '2'}]);
  });
});

describe('lang.ged', () => {
  it('reads the document language and keeps every LANG', () => {
    const parse = parseGedcom(read('lang.ged'));
    expect(parse.language).toBe('af');
    expect(parse.warnings).toEqual([]);
    expect(children(parse.byId.get('1')!, 'LANG').map((n) => n.value)).toEqual([
      'en',
      'ja',
      'es',
    ]);
    expect(children(parse.byId.get('2')!, 'LANG').length).toBeGreaterThan(80);
    expect(
      children(parse.byId.get('2')!, 'LANG').map((n) => n.value),
    ).toContain('ca-ES');
  });
});

describe('obje-1.ged', () => {
  const media = treeOf(read('obje-1.ged')).indis.get('2')!.media;

  it('keeps the media types as written, MEDI and the titles', () => {
    expect(media).toHaveLength(2);
    expect(media[0]!.objectId).toBe('1');
    expect(
      media[0]!.files.map((f) => [f.path, f.mime, f.medium, f.title]),
    ).toEqual([
      ['example.jpg', 'image/jpeg', 'PHOTO', 'Example Image File'],
      ['example.mp3', 'application/x-mp3', undefined, 'Sound Clip'],
    ]);
    expect(media[1]!.objectId).toBe('X1');
    expect(media[1]!.title).toBe('fifth birthday party');
    expect(media[1]!.files.map((f) => [f.mime, f.medium])).toEqual([
      ['application/x-other', 'VIDEO'],
      ['application/x-other', 'VIDEO'],
    ]);
  });
});

describe('filename-1.ged', () => {
  const parse = parseGedcom(read('filename-1.ged'));

  it('collects every FILE reference as written', () => {
    expect(mediaPaths(parse)).toEqual([
      'file:///unix/absolute',
      'file:///c:/windows/absolute',
      'file://host.example.com/server',
      'a/relative/path',
      'most/paths%3Fget%23escaped%5Blike%5Dthis',
      'https%3a//not.a.url/even-though-similar',
      'https://host.example.com?with=args#and-frags',
      'https://upload.wikimedia.org/wikipedia/commons/1/16/Charlotte_Brontë_2.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/1/16/Charlotte_Bront%C3%AB_2.jpg',
      'gedcom.ged',
      'MANIFEST.MF',
      'META-INF/example',
    ]);
  });

  it('only web URLs are shown; percent-encoded text is a local name, not a URL', () => {
    const none = new Map<string, string>();
    for (const [path, shown] of [
      ['file:///unix/absolute', undefined],
      ['file:///c:/windows/absolute', undefined],
      ['file://host.example.com/server', undefined],
      ['a/relative/path', undefined],
      ['https%3a//not.a.url/even-though-similar', undefined],
      [
        'https://host.example.com?with=args#and-frags',
        'https://host.example.com?with=args#and-frags',
      ],
      [
        'https://upload.wikimedia.org/wikipedia/commons/1/16/Charlotte_Brontë_2.jpg',
        'https://upload.wikimedia.org/wikipedia/commons/1/16/Charlotte_Brontë_2.jpg',
      ],
    ] as const) {
      expect(mediaUrl(none, path), path).toBe(shown);
    }
    expect(decodeFilePath('most/paths%3Fget%23escaped%5Blike%5Dthis')).toBe(
      'most/paths?get#escaped[like]this',
    );
    const bundled = new Map([
      ['https://not.a.url/even-though-similar', 'blob:1'],
      ['most/paths?get#escaped[like]this', 'blob:2'],
    ]);
    expect(mediaUrl(bundled, 'https%3a//not.a.url/even-though-similar')).toBe(
      'blob:1',
    );
    expect(mediaUrl(bundled, 'most/paths%3Fget%23escaped%5Blike%5Dthis')).toBe(
      'blob:2',
    );
  });
});

describe('remarriage files', () => {
  it('remarriage1: John marries Jane, divorces, marries again; and Mary', () => {
    const tree = treeOf(read('remarriage1.ged'));
    expect(tree.indis.get('I1')!.fams).toEqual(['F1', 'F2']);
    const f1 = tree.fams.get('F1')!;
    expect(f1.events.map((e) => [e.tag, e.date!.raw])).toEqual([
      ['MARR', '1 APR 1911'],
      ['DIV', '2 MAY 1912'],
      ['MARR', '4 JUL 1914'],
    ]);
    const data = buildChartData(tree, SETTINGS);
    expect(data.fams.find((f) => f.id === 'F1')!.marriage!.date).toEqual({
      day: 1,
      month: 4,
      year: 1911,
    });
    expect(data.indis.find((i) => i.id === 'I3')!.death!.date).toEqual({
      day: 1,
      month: 3,
      year: 1914,
    });
  });

  it('remarriage2: three families, two with the same couple', () => {
    const tree = treeOf(read('remarriage2.ged'));
    expect(tree.indis.get('I1')!.fams).toEqual(['F1', 'F2', 'F3']);
    expect(tree.indis.get('I2')!.fams).toEqual(['F1', 'F3']);
    const data = buildChartData(tree, SETTINGS);
    expect(data.fams.map((f) => [f.id, f.husb, f.wife])).toEqual([
      ['F1', 'I1', 'I2'],
      ['F2', 'I1', 'I3'],
      ['F3', 'I1', 'I2'],
    ]);
  });
});

describe('same-sex-marriage.ged', () => {
  it('draws two men as husband and wife slots without touching their sex', () => {
    const data = buildChartData(
      treeOf(read('same-sex-marriage.ged')),
      SETTINGS,
    );
    expect(data.fams).toEqual([
      {id: 'F1', husb: 'I1', wife: 'I2', children: []},
    ]);
    expect(data.indis.map((i) => i.sex)).toEqual(['M', 'M']);
  });
});

describe('long-url.ged', () => {
  it('keeps a very long value whole', () => {
    const parse = parseGedcom(read('long-url.ged'));
    const www = child(parse.byId.get('S1')!, 'WWW')!.value!;
    expect(www.length).toBeGreaterThan(600);
    expect(www.endsWith('/filename.html')).toBe(true);
    expect(parse.warnings).toEqual([]);
  });
});

describe('extensions.ged', () => {
  const tree = treeOf(read('extensions.ged'));
  const i1 = tree.indis.get('I1')!;

  it('keeps extension structures with their documented URIs', () => {
    expect(i1.extensions.map((e) => [e.tag, e.uri])).toEqual([
      ['_CREATOR', 'https://gedcom.io/terms/v7/SUBM'],
      ['_CREATOR', 'https://gedcom.io/terms/v7/SUBM'],
      ['_EXT1', undefined],
    ]);
  });

  // The dated events of this file sit on the INDI record that has no id.
  const anonymous = tree.parse.records.find(
    (r) => r.tag === 'INDI' && !r.xref,
  )!;
  const dateOf = (tag: string) =>
    parseDate(child(child(anonymous, tag)!, 'DATE')!.value!).value;

  it('reads extension calendars, months and epochs in dates', () => {
    expect(dateOf('BIRT')).toMatchObject({
      kind: 'range',
      type: 'BET',
      from: {calendar: 'FRENCH_R', month: '_JOUR', day: 2, year: 8},
      to: {calendar: '_CALENDRIER', month: 'COMP', day: 4, year: 8},
    });
    expect(dateOf('DEAT')).toMatchObject({
      kind: 'exact',
      date: {calendar: '_CALENDAR', month: '_MONTH', epoch: '_EPOCH'},
    });
    expect(dateOf('GRAD')).toMatchObject({
      kind: 'exact',
      date: {calendar: '_CAL2', year: 88},
    });
  });

  it('reads extension roles', () => {
    const asso = child(anonymous, 'ASSO')!;
    expect(associationOf(createContext(tree.parse), asso).role).toBe('_CHILD');
  });

  it('ignores the record without id and the extension records', () => {
    expect([...tree.indis.keys()]).toEqual(['I1']);
    expect(tree.parse.byId.get('P1')!.tag).toBe('_PARTY');
  });
});

describe('extension-record.ged', () => {
  it('reads the place and leaves the extension records alone', () => {
    const tree = treeOf(read('extension-record.ged'));
    const birt = tree.indis.get('I1')!.events[0]!;
    expect(birt.place!.parts).toEqual(['Town', 'Country']);
    expect(tree.parse.byId.get('LOC1')!.tag).toBe('_LOC');
    expect(tree.parse.byId.get('LOC2')!.tag).toBe('_LOC');
    expect(tree.parse.warnings.map((w) => w.code)).toEqual([
      'UNDOCUMENTED_EXTENSION',
    ]);
  });
});

describe('warnings70.ged', () => {
  it('loads, with warnings about its undocumented extension only', () => {
    const tree = treeOf(read('warnings70.ged'));
    expect(tree.parse.warnings.map((w) => w.code)).toEqual([
      'UNDOCUMENTED_EXTENSION',
    ]);
    expect(tree.parse.warnings[0]!.line).toBe(60);
    expect(tree.indis.get('I1')!.events.map((e) => [e.tag, e.status])).toEqual([
      ['BAPL', 'SUBMITTED'],
      ['CONL', 'INFANT'],
      ['INIL', 'EXCLUDED'],
    ]);
  });
});

describe('maximal70 variants', () => {
  it.each([
    'maximal70-tree1.ged',
    'maximal70-tree2.ged',
    'maximal70-memories1.ged',
    'maximal70-memories2.ged',
    'maximal70-lds.ged',
  ])('%s feeds the chart', (name) => {
    const tree = treeOf(read(name));
    const data = buildChartData(tree, SETTINGS);
    expect(data.indis).toHaveLength(tree.indis.size);
    expect(data.fams).toHaveLength(tree.fams.size);
    expect(data.indis.find((i) => i.id === 'I4')!.famc).toBe('F1');
    expect(tree.fams.get('F1')!.children.map((c) => c.indiId)).toEqual([
      'I4',
      undefined,
    ]);
  });

  it('the LDS file shows sealings as events of the family', () => {
    const f1 = treeOf(read('maximal70-lds.ged')).fams.get('F1')!;
    expect(f1.events.filter((e) => e.tag === 'SLGS')).toHaveLength(7);
    expect(f1.events.find((e) => e.temple)!.temple).toBe('LOGAN');
  });
});
