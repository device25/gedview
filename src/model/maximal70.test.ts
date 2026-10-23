import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {createLoadTree} from '../load';
import {exactJdn} from '../gedcom/date';
import {gregorianToJdn} from '../gedcom/calendar';
import type {LoadedTree} from '../gedcom/types';
import {buildChartData} from './chart';
import {mediaUrl} from './mediaUrl';
import {SETTINGS, treeOf} from './test-utils';

const DIR = join(import.meta.dirname, '../../tests/fixtures/gedcom70');

describe('maximal70.ged', () => {
  const tree = treeOf(readFileSync(join(DIR, 'maximal70.ged'), 'utf8'));
  const i1 = tree.indis.get('I1')!;
  const f1 = tree.fams.get('F1')!;

  it('has the records and no warnings', () => {
    expect(tree.parse.warnings).toEqual([]);
    expect(tree.parse.version).toEqual({raw: '7.0', major: '7'});
    expect(tree.parse.language).toBe('en-US');
    expect(tree.parse.placeForm).toEqual([
      'City',
      'County',
      'State',
      'Country',
    ]);
    expect([...tree.parse.schema.keys()]).toEqual(['_SKYPEID', '_JABBERID']);
    expect([...tree.indis.keys()]).toEqual(['I1', 'I2', 'I3', 'I4']);
    expect([...tree.fams.keys()]).toEqual(['F1', 'F2']);
    expect([...tree.sources!.keys()]).toEqual(['S1', 'S2']);
  });

  it('IndiView: names', () => {
    expect(i1.names.map((n) => [n.display, n.type])).toEqual([
      ['Lt. Cmndr. Joseph "John" de Allen jr.', 'OTHER'],
      ['John Doe', 'BIRTH'],
      ['Aka', 'AKA'],
      ['Immigrant Name', 'IMMIGRANT'],
    ]);
    expect(tree.indis.get('I2')!.names.map((n) => n.type)).toEqual([
      'MAIDEN',
      'MARRIED',
      'PROFESSIONAL',
    ]);
    expect(i1.names[0]!.translations.map((t) => t.lang)).toEqual([
      'en-GB',
      'en-CA',
    ]);
    expect(i1.names[0]!.pieces.spfx).toBe('de');
  });

  it('IndiView: events, attributes and ordinances', () => {
    const tags = i1.events.map((e) => e.tag);
    for (const tag of [
      'BIRT',
      'CHR',
      'DEAT',
      'BURI',
      'CAST',
      'DSCR',
      'EDUC',
      'IDNO',
      'NATI',
      'NCHI',
      'NMR',
      'OCCU',
      'PROP',
      'RELI',
      'RESI',
      'SSN',
      'TITL',
      'FACT',
      'BAPM',
      'BARM',
      'BASM',
      'BLES',
      'CENS',
      'CHRA',
      'CONF',
      'CREM',
      'EMIG',
      'FCOM',
      'GRAD',
      'IMMI',
      'NATU',
      'ORDN',
      'PROB',
      'RETI',
      'WILL',
      'ADOP',
      'EVEN',
      'BAPL',
      'CONL',
      'ENDL',
      'INIL',
      'SLGC',
    ]) {
      expect(tags, tag).toContain(tag);
    }
    expect(tags.filter((t) => t === 'ADOP')).toHaveLength(3);
    expect(tags.filter((t) => t === 'BAPM')).toHaveLength(2);
    expect(tags.filter((t) => t === 'SLGC')).toHaveLength(3);
    // chronological: the 2000 events first, then the 2022 ones, then undated
    expect(tags.slice(0, 2)).toEqual(['BIRT', 'CHR']);
    const dated = i1.events.filter((e) => e.date || e.sortDate);
    const keys = dated.map((e) => exactJdn(e.sortDate ?? e.date) ?? 0);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(i1.events.at(-1)!.date).toBeUndefined();
    expect(i1.nonEvents.map((n) => n.tag)).toEqual(['NATU', 'EMIG']);
  });

  it('IndiView: the DEAT event is complete', () => {
    const deat = i1.events.find((e) => e.tag === 'DEAT')!;
    expect(deat).toMatchObject({
      type: 'deat type',
      cause: 'Cause of death',
      agency: 'Agency',
      religion: 'Religion',
      address: 'Address',
      restrictions: ['CONFIDENTIAL', 'LOCKED'],
    });
    expect(exactJdn(deat.date)).toBe(gregorianToJdn(2022, 3, 28));
    expect(deat.sortDate!.phrase).toBe('sdate phrase');
    expect(deat.sortDate!.time).toBe('16:47');
    expect(deat.place!.raw).toBe('Somewhere');
    expect(deat.associations.map((a) => [a.indiId, a.role])).toEqual([
      ['I3', 'CHIL'],
      [undefined, 'PARENT'],
    ]);
    expect(deat.citations.map((c) => [c.sourceId, c.page])).toEqual([
      ['S1', '1'],
      ['S2', '2'],
    ]);
    expect(deat.media.map((m) => m.objectId)).toEqual(['O1', 'O2']);
    expect(deat.uids).toHaveLength(2);
    expect(deat.contacts).toHaveLength(8);
    expect(deat.notes.map((n) => n.sharedNoteId ?? n.text)).toEqual([
      'Note text',
      'N1',
    ]);
  });

  it('IndiView: CHR has an age with a phrase', () => {
    const chr = i1.events.find((e) => e.tag === 'CHR')!;
    expect(chr.age).toEqual({raw: '8d', days: 8, phrase: 'Age phrase'});
  });

  it('IndiView: ADOP with FAMC and who adopted', () => {
    const adops = i1.events.filter((e) => e.tag === 'ADOP');
    expect(adops.map((a) => a.adoptedBy).sort()).toEqual([
      'BOTH',
      'HUSB',
      'WIFE',
    ]);
  });

  it('IndiView: the links to families', () => {
    expect(i1.famc.map((l) => [l.famId, l.pedigree, l.status])).toEqual([
      ['F2', 'ADOPTED', 'PROVEN'],
      ['F2', 'BIRTH', 'DISPROVEN'],
    ]);
    expect(i1.fams).toEqual(['F1']);
  });

  it('IndiView: citations, media, ids and notes', () => {
    expect(i1.citations.map((c) => [c.sourceId, c.page, c.quality])).toEqual([
      ['S1', '1', 3],
      ['S2', undefined, undefined],
    ]);
    expect(i1.media.map((m) => m.objectId)).toEqual(['O1', 'O2']);
    expect(i1.exids.map((e) => [e.value, e.type])).toEqual([
      ['123', 'http://example.com'],
      ['456', 'http://example.com'],
    ]);
    expect(i1.uids).toHaveLength(2);
    expect(i1.restrictions).toEqual(['CONFIDENTIAL', 'LOCKED']);
    expect(i1.notes[0]!.text).toBe(
      [
        'me@example.com is an example email address.',
        '@me and @I are example social media handles.',
        '@@@@ has four @ characters where only the first is escaped.',
      ].join('\n'),
    );
    expect(i1.notes[1]!).toMatchObject({
      sharedNoteId: 'N1',
      text: 'Shared note 1',
      lang: 'en-US',
    });
    expect(i1.notes[1]!.translations.map((t) => t.lang)).toEqual([
      'en-GB',
      'en-CA',
    ]);
  });

  it('IndiView: associations of the person', () => {
    expect(i1.associations.map((a) => [a.role, a.phrase])).toEqual([
      ['FRIEND', 'Mr Stockdale'],
      ['NGHBR', undefined],
      ['FATH', undefined],
      ['GODP', undefined],
      ['HUSB', undefined],
      ['MOTH', undefined],
      ['MULTIPLE', undefined],
      ['SPOU', undefined],
      ['WIFE', undefined],
    ]);
  });

  it('FamView', () => {
    expect(f1.partners).toEqual([
      {role: 'HUSB', indiId: 'I1', phrase: 'Husband phrase'},
      {role: 'WIFE', indiId: 'I2', phrase: 'Wife phrase'},
    ]);
    expect(f1.children).toEqual([
      {indiId: 'I4', phrase: 'First child'},
      {phrase: 'Second child'},
    ]);
    expect(f1.restrictions).toEqual(['CONFIDENTIAL', 'LOCKED']);
    expect(f1.nonEvents.map((n) => n.tag)).toEqual(['DIV', 'ANUL']);
    expect(f1.nonEvents[0]!.date!.phrase).toBe('No date phrase');
    expect(f1.associations[0]).toMatchObject({
      indiId: 'I3',
      phrase: 'Association text',
      role: 'OTHER',
      rolePhrase: 'Role text',
    });
    const marr = f1.events.find((e) => e.tag === 'MARR')!;
    expect(marr.husbandAge).toMatchObject({years: 25, phrase: 'Adult'});
    expect(marr.associations.map((a) => a.role)).toEqual([
      'OFFICIATOR',
      'WITN',
    ]);
    expect(marr.date).toMatchObject({time: '16:02', phrase: 'Afternoon'});
    expect(marr.sortDate).toMatchObject({time: '16:03'});
    expect(f1.events.filter((e) => e.tag === 'SLGS')).toHaveLength(4);
    expect(f1.events.map((e) => e.tag)).toEqual(
      expect.arrayContaining([
        'NCHI',
        'RESI',
        'FACT',
        'EVEN',
        'ANUL',
        'CENS',
        'DIV',
        'DIVF',
        'ENGA',
        'MARB',
        'MARC',
        'MARL',
        'MARS',
      ]),
    );
    expect(tree.fams.get('F2')!.events[0]!.date!.value).toMatchObject({
      kind: 'exact',
      date: {year: 1998},
    });
  });

  it('media records', () => {
    const o1 = i1.media[0]!;
    expect(o1.restrictions).toEqual(['CONFIDENTIAL', 'LOCKED']);
    expect(o1.files.map((f) => [f.path, f.mime, f.medium])).toEqual([
      ['media/CharlotteBront%C3%AB.jpg', 'image/jpeg', 'OTHER'],
      ['file:///path/to/file1', 'text/plain', 'OTHER'],
      ['media/original.mp3', 'audio/mp3', 'AUDIO'],
    ]);
    expect(o1.files[2]!.translations.map((t) => t.mime)).toEqual([
      'audio/ogg',
      'text/vtt',
    ]);
  });

  it('feeds topola', () => {
    const data = buildChartData(tree, SETTINGS);
    expect(data.indis).toHaveLength(4);
    expect(data.fams).toHaveLength(2);
  });
});

describe('maximal70.gdz', () => {
  const blobs: Blob[] = [];
  const load = createLoadTree({
    createObjectUrl: (blob) => {
      blobs.push(blob);
      return `blob:test/${blobs.length}`;
    },
  });
  const read = async (name: string) =>
    load({
      kind: 'files',
      files: [new File([readFileSync(join(DIR, name))], name)],
    });
  let tree: LoadedTree;

  it('loads and has the same people as the .ged', async () => {
    tree = await read('maximal70.gdz');
    expect(tree.source).toEqual({kind: 'gedzip', name: 'maximal70.gdz'});
    expect([...tree.indis.keys()]).toEqual(['I1', 'I2', 'I3', 'I4']);
    expect(tree.indis.get('I1')!.media[0]!.objectId).toBe('O1');
  });

  it('turns every file of the archive into a blob URL, keyed by its zip path', () => {
    expect([...tree.media.keys()].sort()).toEqual([
      'media/CharlotteBrontë.jpg',
      'media/derived.oga',
      'media/original.mp3',
      'media/transcript.vtt',
      'path/to/file1',
    ]);
    const jpg = blobs.find((b) => b.size === 79000)!;
    expect(jpg.type).toBe('image/jpeg');
    expect(blobs.find((b) => b.type === 'audio/mpeg')!.size).toBe(625);
    expect(blobs.find((b) => b.type === 'audio/ogg')!.size).toBe(210);
    expect(blobs).toHaveLength(5);
  });

  it('matches the percent-encoded FILE reference to the zip entry with ë', async () => {
    const url = mediaUrl(tree.media, 'media/CharlotteBront%C3%AB.jpg')!;
    expect(url).toMatch(/^blob:test\//);
    expect(tree.media.get('media/CharlotteBrontë.jpg')).toBe(url);
    expect(mediaUrl(tree.media, 'media/original.mp3')).toBeDefined();
    expect(mediaUrl(tree.media, 'media/derived.oga')).toBeDefined();
    expect(mediaUrl(tree.media, 'file:///path/to/file1')).toBeUndefined(); // never local files
    expect(mediaUrl(tree.media, 'http://host.example.com/path/to/file2')).toBe(
      'http://host.example.com/path/to/file2',
    );
  });

  it('shows the picture of the person in the chart data', () => {
    const data = buildChartData(tree, SETTINGS);
    const images = data.indis.find((i) => i.id === 'I1')!.images!;
    expect(images).toHaveLength(1);
    expect(images[0]!.url).toMatch(/^blob:test\//);
  });

  it('loads minimal70.gdz as a file without people', async () => {
    await expect(read('minimal70.gdz')).rejects.toMatchObject({code: 'EMPTY'});
  });
});
