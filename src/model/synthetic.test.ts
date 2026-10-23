import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {gregorianToJdn, julianToJdn} from '../gedcom/calendar';
import {exactJdn} from '../gedcom/date';
import type {Association, IndiView, LoadedTree} from '../gedcom/types';
import {buildChartData} from './chart';
import {SETTINGS, treeOf} from './test-utils';

const DIR = join(import.meta.dirname, '../../tests/fixtures/synthetic');
const read = (name: string) => treeOf(readFileSync(join(DIR, name), 'utf8'));
const t7 = read('sokolovy.ged');
const t5 = read('sokolovy-551.ged');

describe('sokolovy.ged (GEDCOM 7.0)', () => {
  const tree = t7;
  const ivan = tree.indis.get('I3')!;
  const event = (tag: string, id = 'I3') =>
    tree.indis.get(id)!.events.find((e) => e.tag === tag)!;

  it('has 12 people, 4 families, 4 sources and no warnings', () => {
    expect(tree.parse.warnings).toEqual([]);
    expect(tree.parse.version.major).toBe('7');
    expect([...tree.indis.keys()]).toEqual([
      'I1',
      'I2',
      'I3',
      'I4',
      'I5',
      'I6',
      'I7',
      'I8',
      'I9',
      'I10',
      'I11',
      'I12',
    ]);
    expect([...tree.fams.keys()]).toEqual(['F1', 'F2', 'F3', 'F4']);
    expect([...tree.sources!.keys()]).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(tree.parse.language).toBe('ru');
    expect(tree.parse.placeForm).toEqual([
      'Населённый пункт',
      'Уезд',
      'Губерния',
      'Страна',
    ]);
    expect(tree.parse.schema.get('_SLUZHBA')).toBe(
      'https://example.com/gedcom/_SLUZHBA',
    );
  });

  it('Ivan: names of three kinds', () => {
    expect(ivan.names.map((n) => [n.display, n.type])).toEqual([
      ['Иван Петрович Соколов', 'BIRTH'],
      ['Ванюша Соколов', 'AKA'],
    ]);
    expect(ivan.names[0]!.translations).toMatchObject([
      {display: 'Ivan Petrovich Sokolov', lang: 'en'},
    ]);
    expect(ivan.names[0]!.pieces).toEqual({
      givn: 'Иван Петрович',
      surn: 'Соколов',
    });
  });

  it('Ivan: born by the old style, baptised two days later', () => {
    const birt = event('BIRT');
    expect(birt.date!.value).toMatchObject({
      kind: 'exact',
      date: {calendar: 'JULIAN', year: 1889, monthIndex: 4, day: 6},
    });
    expect(exactJdn(birt.date)).toBe(gregorianToJdn(1889, 4, 18));
    expect(exactJdn(event('BAPM').date)).toBe(julianToJdn(1889, 4, 8));
    expect(birt.place!.raw).toBe(
      'с. Покровское, Старицкий уезд, Тверская губерния, Российская империя',
    );
    expect(birt.place!.parts).toHaveLength(4);
    expect(birt.place!.form).toEqual([
      'Населённый пункт',
      'Уезд',
      'Губерния',
      'Страна',
    ]);
    expect(birt.place!.lang).toBe('ru');
    expect(birt.place!.translations).toEqual([
      {
        raw: 'Pokrovskoye, Staritsky Uyezd, Tver Governorate, Russian Empire',
        parts: [
          'Pokrovskoye',
          'Staritsky Uyezd',
          'Tver Governorate',
          'Russian Empire',
        ],
        lang: 'en',
      },
    ]);
    expect([birt.place!.latitude, birt.place!.longitude]).toEqual([56.5, 34.9]);
  });

  it('Ivan: godparents, a priest without a record, a census age', () => {
    const bapm = event('BAPM');
    expect(bapm.associations.map((a) => [a.indiId, a.role, a.phrase])).toEqual([
      ['I5', 'GODP', undefined],
      ['I6', 'GODP', undefined],
      [undefined, 'CLERGY', 'священник Василий'],
    ]);
    const cens = event('CENS');
    expect(cens.date!.value).toMatchObject({
      date: {calendar: 'JULIAN', year: 1897, day: 28, monthIndex: 1},
    });
    expect(cens.age).toEqual({raw: '7y', years: 7});
    expect(ivan.events.map((e) => e.tag)).toEqual([
      'BIRT',
      'BAPM',
      'CENS',
      'DEAT',
    ]);
    expect(event('DEAT').place!.parts).toEqual([
      'г. Калинин',
      '',
      'Калининская область',
      'СССР',
    ]);
  });

  it('Ivan: citations with quality 3, 2, 1 and text', () => {
    const birt = event('BIRT');
    expect(birt.citations).toHaveLength(1);
    const c = birt.citations[0]!;
    expect(c).toMatchObject({
      sourceId: 'S1',
      page: 'л. 12 об., № 18',
      quality: 3,
    });
    expect(c.data!.date!.raw).toBe('6 APR 1889');
    expect(c.data!.texts[0]).toMatchObject({mime: 'text/plain', lang: 'ru'});
    expect(c.data!.texts[0]!.text).toContain('родился сын Иван');
    expect(event('CENS').citations[0]!.quality).toBe(2);
    expect(event('DEAT').citations[0]!.quality).toBe(1);
    expect(ivan.citations[0]).toMatchObject({sourceId: 'S2', quality: 2});
  });

  it('quality 0 is on the estimated birth of Maria', () => {
    expect(event('BIRT', 'I2').citations[0]!.quality).toBe(0);
    expect(event('BIRT', 'I2').date!.value).toMatchObject({
      kind: 'exact',
      qualifier: 'ABT',
    });
  });

  it('Ivan: the challenged link to his parents', () => {
    expect(ivan.famc).toHaveLength(1);
    expect(ivan.famc[0]).toMatchObject({
      famId: 'F2',
      status: 'CHALLENGED',
      statusPhrase:
        'Запись о рождении не найдена; связь установлена по исповедной ведомости 1890 года.',
    });
    expect(ivan.famc[0]!.notes![0]!.text).toContain('Исповедная ведомость');
    expect(tree.childLinkStatus.get('F2|I3')).toMatchObject({
      status: 'CHALLENGED',
    });
  });

  it('a disproven link and an adoption', () => {
    expect(tree.indis.get('I12')!.famc.map((l) => [l.famId, l.status])).toEqual(
      [
        ['F2', 'DISPROVEN'],
        ['F4', undefined],
      ],
    );
    expect(tree.fams.get('F2')!.children.map((c) => c.indiId)).toEqual(['I3']);
    const dmitri = tree.indis.get('I11')!;
    expect(dmitri.famc[0]).toMatchObject({
      famId: 'F3',
      pedigree: 'ADOPTED',
      status: 'PROVEN',
    });
    const adop = dmitri.events.find((e) => e.tag === 'ADOP')!;
    expect(adop).toMatchObject({famId: 'F3', adoptedBy: 'BOTH'});
    expect(tree.fams.get('F3')!.children.map((c) => c.indiId)).toEqual([
      'I7',
      'I8',
      'I11',
    ]);
  });

  it('marriage by the old style with a witness and a priest; no divorce', () => {
    const f3 = tree.fams.get('F3')!;
    const marr = f3.events.find((e) => e.tag === 'MARR')!;
    expect(marr.date!.value).toMatchObject({
      date: {calendar: 'JULIAN', year: 1912, monthIndex: 2, day: 12},
    });
    expect(exactJdn(marr.date)).toBe(gregorianToJdn(1912, 2, 25));
    expect(marr.associations.map((a) => [a.indiId, a.role, a.phrase])).toEqual([
      ['I5', 'WITN', undefined],
      [undefined, 'CLERGY', 'священник Александр'],
    ]);
    expect(f3.nonEvents).toEqual([{tag: 'DIV', notes: [], citations: []}]);
  });

  it('a wife who is only a phrase', () => {
    expect(tree.fams.get('F4')!.partners).toEqual([
      {role: 'HUSB', indiId: 'I5'},
      {role: 'WIFE', phrase: 'Татьяна, девичья фамилия не установлена'},
    ]);
  });

  it('external ids: FamilySearch and Find a Grave', () => {
    expect(ivan.exids).toEqual([
      {
        value: 'XXXX-001',
        type: 'https://gedcom.io/exid-type/FamilySearch-PersonId',
        label: 'FamilySearch Person ID',
        url: 'https://www.familysearch.org/en/search/tree/results?q.personId=XXXX-001',
      },
    ]);
    expect(tree.indis.get('I1')!.exids[0]).toMatchObject({
      label: 'FindAGrave Memorial ID',
      url: 'https://www.findagrave.com/memorial/XXXX-002',
    });
    expect(ivan.uids).toEqual(['0f2f1a5e-6b52-4f0d-9c0a-5b1d0c0a0001']);
  });

  it('a shared note used by two people', () => {
    const a = tree.indis.get('I1')!.notes[0]!;
    const b = ivan.notes[0]!;
    expect(a.sharedNoteId).toBe('N1');
    expect(b.sharedNoteId).toBe('N1');
    expect(a.text).toBe(
      'Фамилия записана в метрических книгах по-разному: Соколов и Соколовъ.',
    );
    expect(a.lang).toBe('ru');
  });

  it('a note in HTML, kept as written (with its script) for the sanitiser', () => {
    const note = tree.indis.get('I7')!.notes[0]!;
    expect(note.mime).toBe('text/html');
    expect(note.lang).toBe('ru');
    expect(note.text).toContain("<script>alert('xss')</script>");
    expect(note.text).toContain('javascript:alert(2)');
  });

  it('a multimedia record with a crop', () => {
    const m = ivan.media[0]!;
    expect(m).toEqual({
      objectId: 'M1',
      title: 'Фотография, фрагмент',
      crop: {top: 10, left: 15, height: 70, width: 60},
      restrictions: [],
      files: [
        {
          path: 'media/portrait-ivan.jpg',
          mime: 'image/jpeg',
          medium: 'PHOTO',
          title: 'Портрет Ивана Петровича (условный)',
          translations: [],
        },
      ],
    });
  });

  it('a confidential event', () => {
    const even = tree.indis.get('I7')!.events.find((e) => e.tag === 'EVEN')!;
    expect(even).toMatchObject({
      value: 'Призван в армию',
      type: 'Военная служба',
      restrictions: ['CONFIDENTIAL'],
    });
  });

  it('a sort date moves a residence earlier in the list', () => {
    const tags = tree.indis.get('I1')!.events.map((e) => e.tag);
    expect(tags).toEqual(['BIRT', 'RESI', 'OCCU', 'DEAT']);
    expect(tree.indis.get('I1')!.events[1]!.sortDate!.raw).toBe('1883');
    expect(tree.indis.get('I1')!.events[1]!.date!.value).toMatchObject({
      kind: 'range',
      type: 'BET',
    });
  });

  it('an extension declared in the header', () => {
    const ext = tree.indis.get('I7')!.extensions;
    expect(ext).toHaveLength(1);
    expect(ext[0]).toMatchObject({
      tag: '_SLUZHBA',
      uri: 'https://example.com/gedcom/_SLUZHBA',
    });
    expect(ext[0]!.node.value).toBe('Рядовой, 31-я стрелковая дивизия');
  });

  it('a source with a repository and a call number', () => {
    const s = tree.sources!.get('S1')!;
    expect(s).toMatchObject({
      title: 'Метрическая книга Покровской церкви Старицкого уезда за 1889 год',
      abbreviation: 'Метрическая книга 1889',
    });
    expect(s.repositories[0]).toMatchObject({
      repoId: 'R1',
      callNumbers: [{value: 'Ф. 160, оп. 1, д. 100', medium: 'MANUSCRIPT'}],
    });
    expect(s.text).toMatchObject({lang: 'ru'});
  });

  it('a note with a blank line and an escaped @', () => {
    const note = tree.indis.get('I9')!.notes[0]!;
    expect(note.text).toBe(
      'Родился в крестьянской семье.\n\n@sokolov — начало строки, адрес user@example.com внутри строки.',
    );
  });

  it('feeds topola for the four generations', () => {
    const hide = buildChartData(tree, SETTINGS);
    const fam = (id: string) => hide.fams.find((f) => f.id === id)!;
    expect(hide.indis.find((i) => i.id === 'I3')).toMatchObject({
      famc: 'F2',
      fams: ['F3'],
      firstName: 'Иван Петрович',
      lastName: 'Соколов',
      sex: 'M',
    });
    expect(hide.indis.find((i) => i.id === 'I3')!.birth!.date).toEqual({
      text: '6 Apr 1889 (Julian)',
    });
    expect(hide.indis.find((i) => i.id === 'I2')).toMatchObject({
      firstName: 'Мария Фёдоровна',
      lastName: 'Лаврова',
    });
    expect(fam('F3').children).toEqual(['I7', 'I8', 'I11']);
    expect(fam('F2').children).toEqual(['I3']); // I12 disproven: hidden
    expect(hide.indis.find((i) => i.id === 'I12')!.famc).toBe('F4');
    expect(fam('F4')).toMatchObject({husb: 'I5', children: ['I12']});
    expect(fam('F4').wife).toBeUndefined();
    expect(fam('F3').marriage!.date).toEqual({text: '12 Feb 1912 (Julian)'});

    const dotted = buildChartData(tree, {...SETTINGS, disproven: 'dotted'});
    expect(dotted.fams.find((f) => f.id === 'F2')!.children).toEqual([
      'I3',
      'I12',
    ]);
    expect(dotted.indis.find((i) => i.id === 'I12')!.famc).toBe('F4');

    const greg = buildChartData(tree, {...SETTINGS, dateStyle: 'gregorian'});
    expect(greg.indis.find((i) => i.id === 'I3')!.birth!.date).toEqual({
      day: 18,
      month: 4,
      year: 1889,
    });
    expect(greg.fams.find((f) => f.id === 'F3')!.marriage!.date).toEqual({
      day: 25,
      month: 2,
      year: 1912,
    });
  });
});

/** What two renderings of the same family must agree on. */
function essence(tree: LoadedTree) {
  const assoc = (list: Association[]) =>
    list.map((a) => a.indiId).filter(Boolean);
  const person = (i: IndiView) => ({
    names: i.names.map((n) => [n.display, n.type, n.surname]),
    sex: i.sex,
    famc: i.famc.map((l) => [l.famId, l.pedigree, l.status]),
    fams: i.fams,
    events: i.events.map((e) => [
      e.tag,
      e.value,
      e.type,
      e.date?.value,
      e.place?.raw,
      e.place?.form,
      e.place?.latitude,
      e.age,
      e.citations.map((c) => [
        c.sourceId,
        c.page,
        c.quality,
        c.data?.date?.raw,
        c.data?.texts.map((t) => t.text),
      ]),
      e.restrictions,
      e.famId,
      e.adoptedBy,
    ]),
    citations: i.citations.map((c) => [c.sourceId, c.page, c.quality]),
    // (5.5.1 has no way to carry a Find a Grave id)
    exids: i.exids
      .filter((x) => x.type?.includes('FamilySearch'))
      .map((x) => [x.value, x.type, x.url]),
    uids: i.uids,
    notes: i.notes.map((n) => n.text),
    media: i.media.map((m) => m.files.map((f) => [f.mime, f.medium, f.title])),
    // the 7.0 file records godparents at the baptism, the 5.5.1 file on the person
    associated: [
      ...new Set([
        ...assoc(i.associations),
        ...i.events.flatMap((e) => assoc(e.associations)),
      ]),
    ].sort(),
  });
  return {
    people: [...tree.indis.values()].map((i) => [i.id, person(i)]),
    families: [...tree.fams.values()].map((f) => [
      f.id,
      f.partners.filter((p) => p.indiId).map((p) => [p.role, p.indiId]),
      f.children.map((c) => c.indiId),
      f.events.map((e) => [e.tag, e.date?.value, e.place?.raw]),
    ]),
    sources: [...tree.sources!.values()].map((s) => [
      s.id,
      s.title,
      s.author,
      s.abbreviation,
      s.publication,
      s.text?.text,
      s.repositories.map((r) => [r.name, r.callNumbers]),
    ]),
    status: [...tree.childLinkStatus].map(([k, v]) => [k, v.status]),
  };
}

describe('sokolovy-551.ged (GEDCOM 5.5.1) matches the 7.0 file', () => {
  it('reads without warnings, as version 5', () => {
    expect(t5.parse.warnings).toEqual([]);
    expect(t5.parse.version).toEqual({raw: '5.5.1', major: '5'});
    expect(t5.indis.size).toBe(12);
    expect(t5.fams.size).toBe(4);
  });

  it('has the same essential people, families, sources', () => {
    const a = essence(t7);
    const b = essence(t5);
    // What 5.5.1 cannot say (a wife who is only a phrase, a priest without
    // a record, NO DIV, SDATE, CROP, MIME of notes) is left out of the
    // comparison; everything else is equal.
    expect(b.families).toEqual(a.families);
    expect(b.sources).toEqual(a.sources);
    expect(b.status).toEqual(a.status);
    expect(b.people.map(([id]) => id)).toEqual(a.people.map(([id]) => id));
    for (const [i, [id, p]] of a.people.entries()) {
      expect(b.people[i]![1], id as string).toEqual(p);
    }
  });

  it('turns 5.5.1 forms into the 7.0 shape', () => {
    const ivan = t5.indis.get('I3')!;
    const birt = ivan.events.find((e) => e.tag === 'BIRT')!;
    expect(birt.date!.raw).toBe('@#DJULIAN@ 6 APR 1889');
    expect(birt.date!.value).toMatchObject({date: {calendar: 'JULIAN'}});
    expect(ivan.names[0]!.type).toBe('BIRTH'); // "birth" in the file
    expect(ivan.names[1]!.type).toBe('AKA');
    expect(ivan.famc[0]!.status).toBe('CHALLENGED');
    expect(t5.indis.get('I11')!.famc[0]).toMatchObject({
      pedigree: 'ADOPTED',
      status: 'PROVEN',
    });
    expect(
      t5.indis.get('I7')!.events.find((e) => e.tag === 'EVEN')!.restrictions,
    ).toEqual(['CONFIDENTIAL']);
    expect(ivan.exids[0]!.type).toBe(
      'https://gedcom.io/exid-type/FamilySearch-PersonId',
    );
    expect(ivan.exids[0]!.label).toBe('FamilySearch Person ID');
    expect(ivan.media[0]!.files[0]).toMatchObject({
      path: 'media\\portrait-ivan.jpg',
      mime: 'image/jpeg',
      medium: 'PHOTO',
    });
  });

  it('godparents are role phrases, not roles', () => {
    const list = t5.indis.get('I3')!.associations;
    expect(list.map((a) => [a.indiId, a.role, a.rolePhrase])).toEqual([
      ['I5', undefined, 'Godfather'],
      ['I6', undefined, 'Godmother'],
      ['I5', undefined, 'Witness at the marriage'],
    ]);
  });

  it('merges CONC, CONT and doubled @', () => {
    expect(t5.sources!.get('S1')!.text!.text).toBe(
      'Книга записей о рождении, браке и смерти. Содержание вымышлено.',
    );
    expect(t5.indis.get('I9')!.notes[0]!.text).toBe(
      t7.indis.get('I9')!.notes[0]!.text,
    );
    const head = t5.parse.records[0]!.children.find((c) => c.tag === 'NOTE')!;
    expect(head.value).toBe(
      'Синтетический файл для тестов Gedview. Все люди, места и документы выдуманы; совпадения случайны.',
    );
  });

  it('draws the same chart', () => {
    const strip = (d: ReturnType<typeof buildChartData>) => ({
      indis: d.indis.map((i) => ({...i, images: undefined})),
      fams: d.fams,
    });
    expect(strip(buildChartData(t5, SETTINGS))).toEqual(
      strip(buildChartData(t7, SETTINGS)),
    );
  });
});
