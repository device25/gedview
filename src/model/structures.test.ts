import {describe, expect, it} from 'vitest';
import {doc5, doc7, treeOf} from './test-utils';

const person = (text: string, id = 'I1') => treeOf(text).indis.get(id)!;
const indi = (...lines: string[]) => person(doc7('0 @I1@ INDI', ...lines));
const indi5 = (...lines: string[]) => person(doc5('0 @I1@ INDI', ...lines));

describe('notes', () => {
  it('reads NOTE with MIME, LANG and TRAN (which inherit what they omit)', () => {
    const [note] = indi(
      '1 NOTE American English',
      '2 MIME text/html',
      '2 LANG en-US',
      '2 TRAN British English',
      '3 LANG en-GB',
      '2 TRAN Plain',
      '3 MIME text/plain',
    ).notes;
    expect(note).toMatchObject({
      text: 'American English',
      mime: 'text/html',
      lang: 'en-US',
    });
    expect(note!.translations).toEqual([
      {text: 'British English', mime: 'text/html', lang: 'en-GB'},
      {text: 'Plain', mime: 'text/plain', lang: 'en-US'},
    ]);
  });

  it('defaults to text/plain and has no lang', () => {
    const [note] = indi('1 NOTE Hello').notes;
    expect(note).toEqual({
      text: 'Hello',
      mime: 'text/plain',
      translations: [],
      citations: [],
    });
  });

  it('keeps HTML exactly as written (the UI sanitises it)', () => {
    const html = "<p>Hi</p><script>alert('x')</script>";
    const [note] = indi(`1 NOTE ${html}`, '2 MIME text/html').notes;
    expect(note!.text).toBe(html);
    expect(note!.mime).toBe('text/html');
  });

  it('keeps multi-line text', () => {
    const [note] = indi('1 NOTE a', '2 CONT', '2 CONT b').notes;
    expect(note!.text).toBe('a\n\nb');
  });

  it('resolves SNOTE records, one shared by several structures', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 SNOTE @N1@',
        '1 BIRT',
        '2 SNOTE @N1@',
        '0 @I2@ INDI',
        '1 SNOTE @N1@',
        '0 @N1@ SNOTE shared text',
        '1 LANG ru',
        '1 TRAN gemeinsam',
        '2 LANG de',
      ),
    );
    const a = tree.indis.get('I1')!.notes[0]!;
    const b = tree.indis.get('I2')!.notes[0]!;
    expect(a).toMatchObject({
      text: 'shared text',
      sharedNoteId: 'N1',
      lang: 'ru',
    });
    expect(a.translations).toEqual([
      {text: 'gemeinsam', mime: 'text/plain', lang: 'de'},
    ]);
    expect(b.sharedNoteId).toBe('N1');
    expect(tree.indis.get('I1')!.events[0]!.notes[0]!.sharedNoteId).toBe('N1');
  });

  it('skips SNOTE @VOID@ and dangling pointers', () => {
    expect(
      indi('1 SNOTE @VOID@', '1 SNOTE @NOPE@', '1 NOTE kept').notes.map(
        (n) => n.text,
      ),
    ).toEqual(['kept']);
  });

  it('reads citations of a note record', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 SNOTE @N1@',
        '0 @N1@ SNOTE t',
        '1 SOUR @S1@',
        '2 PAGE 5',
        '0 @S1@ SOUR',
      ),
    );
    expect(tree.indis.get('I1')!.notes[0]!.citations).toMatchObject([
      {sourceId: 'S1', page: '5'},
    ]);
  });

  it('survives notes and sources that point at each other', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 SNOTE @N1@',
        '0 @N1@ SNOTE a',
        '1 SOUR @S1@',
        '2 SNOTE @N1@',
        '0 @S1@ SOUR',
        '1 SNOTE @N1@',
      ),
    );
    const note = tree.indis.get('I1')!.notes[0]!;
    expect(note.citations[0]!.notes[0]!.text).toBe('a');
    expect(note.citations[0]!.notes[0]!.citations).toEqual([]); // cycle cut here
  });

  it('survives the cyclic official example', () => {
    const tree = treeOf(
      doc7(
        '0 @1@ SUBM',
        '0 @2@ SOUR',
        '1 SNOTE @5@',
        '0 @5@ SNOTE x',
        '1 SOUR @2@',
        '0 @I1@ INDI',
        '1 SNOTE @5@',
      ),
    );
    expect(tree.indis.get('I1')!.notes[0]!.citations[0]!.sourceId).toBe('2');
  });

  it('5.5.1: NOTE pointing at a NOTE record', () => {
    const tree = treeOf(
      doc5(
        '0 @I1@ INDI',
        '1 NOTE @N1@',
        '1 NOTE inline',
        '0 @N1@ NOTE shared',
        '1 CONT second line',
      ),
    );
    const notes = tree.indis.get('I1')!.notes;
    expect(notes.map((n) => n.text)).toEqual(['shared\nsecond line', 'inline']);
    expect(notes[0]!.sharedNoteId).toBe('N1');
  });

  it('reads a note inside a citation', () => {
    const [citation] = indi(
      '1 SOUR @VOID@',
      '2 PAGE p',
      '2 NOTE about it',
    ).citations;
    expect(citation!.notes.map((n) => n.text)).toEqual(['about it']);
  });
});

describe('source citations', () => {
  const S = ['0 @S1@ SOUR', '1 TITL Book'];
  const cite = (...lines: string[]) =>
    person(doc7('0 @I1@ INDI', '1 SOUR @S1@', ...lines, ...S)).citations[0]!;

  it('reads PAGE and QUAY 0..3', () => {
    expect(cite('2 PAGE p. 4', '2 QUAY 3')).toMatchObject({
      sourceId: 'S1',
      page: 'p. 4',
      quality: 3,
    });
    for (const q of [0, 1, 2, 3]) expect(cite(`2 QUAY ${q}`).quality).toBe(q);
    expect(cite('2 QUAY 4').quality).toBeUndefined();
    expect(cite('2 QUAY high').quality).toBeUndefined();
    expect(cite().quality).toBeUndefined();
  });

  it('reads DATA with DATE and TEXT (MIME, LANG)', () => {
    const c = cite(
      '2 DATA',
      '3 DATE 28 MAR 2022',
      '4 TIME 10:29',
      '4 PHRASE Morning',
      '3 TEXT Text 1',
      '4 MIME text/html',
      '4 LANG en-US',
      '3 TEXT Text 2',
    );
    expect(c.data!.date).toMatchObject({phrase: 'Morning', time: '10:29'});
    expect(c.data!.date!.value.kind).toBe('exact');
    expect(c.data!.texts).toEqual([
      {
        text: 'Text 1',
        mime: 'text/html',
        lang: 'en-US',
        translations: [],
        citations: [],
      },
      {text: 'Text 2', mime: 'text/plain', translations: [], citations: []},
    ]);
  });

  it('reads EVEN with PHRASE and ROLE', () => {
    expect(
      cite(
        '2 EVEN BIRT',
        '3 PHRASE Event phrase',
        '3 ROLE OTHER',
        '4 PHRASE Role phrase',
      ).event,
    ).toEqual({
      type: 'BIRT',
      phrase: 'Event phrase',
      role: 'OTHER',
      rolePhrase: 'Role phrase',
    });
    expect(cite('2 EVEN DEAT', '3 ROLE HUSB').event).toEqual({
      type: 'DEAT',
      role: 'HUSB',
    });
  });

  it('reads media links and notes of a citation', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 SOUR @S1@',
        '2 OBJE @O1@',
        '3 TITL Scan',
        '2 NOTE Note',
        '0 @S1@ SOUR',
        '0 @O1@ OBJE',
        '1 FILE a.jpg',
        '2 FORM image/jpeg',
      ),
    );
    const c = tree.indis.get('I1')!.citations[0]!;
    expect(c.media).toMatchObject([{objectId: 'O1', title: 'Scan'}]);
    expect(c.notes.map((n) => n.text)).toEqual(['Note']);
  });

  it('reads a citation with @VOID@ and a PAGE', () => {
    const c = person(
      doc7('0 @I1@ INDI', '1 SOUR @VOID@', '2 PAGE Entire source'),
    ).citations[0]!;
    expect(c.sourceId).toBeUndefined();
    expect(c.page).toBe('Entire source');
    expect(c.inlineText).toBe('Entire source');
  });

  it('5.5.1: inline source text, TEXT under SOUR, ROLE as free text', () => {
    const c = indi5(
      '1 SOUR A page of the old family Bible',
      '2 TEXT Born at dawn',
      '3 CONT second line',
      '2 EVEN BIRT',
      '3 ROLE godfather',
    ).citations[0]!;
    expect(c.sourceId).toBeUndefined();
    expect(c.inlineText).toBe('A page of the old family Bible');
    expect(c.data!.texts.map((t) => t.text)).toEqual([
      'Born at dawn\nsecond line',
    ]);
    expect(c.event).toEqual({type: 'BIRT', rolePhrase: 'godfather'});
  });

  it('5.5.1: ROLE keywords become roles', () => {
    expect(
      indi5('1 SOUR @S1@', '2 EVEN BIRT', '3 ROLE WITN', '0 @S1@ SOUR')
        .citations[0]!.event,
    ).toEqual({
      type: 'BIRT',
      role: 'WITN',
    });
  });

  it('keeps the citation even when the source record is missing', () => {
    expect(indi('1 SOUR @S9@', '2 PAGE 1').citations[0]!.sourceId).toBe('S9');
  });
});

describe('associations', () => {
  it('reads INDI-level and event-level ASSO, with VOID and PHRASE', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 ASSO @I2@',
        '2 ROLE GODP',
        '2 NOTE n',
        '2 SOUR @VOID@',
        '3 PAGE 1',
        '1 ASSO @VOID@',
        '2 PHRASE Mr Stockdale',
        '2 ROLE OTHER',
        '3 PHRASE Teacher',
        '1 BAPM',
        '2 ASSO @I2@',
        '3 ROLE CLERGY',
        '0 @I2@ INDI',
      ),
    );
    const i1 = tree.indis.get('I1')!;
    expect(i1.associations).toHaveLength(2);
    expect(i1.associations[0]).toMatchObject({indiId: 'I2', role: 'GODP'});
    expect(i1.associations[0]!.notes[0]!.text).toBe('n');
    expect(i1.associations[0]!.citations[0]!.page).toBe('1');
    expect(i1.associations[1]).toMatchObject({
      phrase: 'Mr Stockdale',
      role: 'OTHER',
      rolePhrase: 'Teacher',
    });
    expect(i1.associations[1]!.indiId).toBeUndefined();
    expect(i1.events[0]!.associations[0]).toMatchObject({
      indiId: 'I2',
      role: 'CLERGY',
    });
  });

  it('keeps extension roles and upper-cases standard ones', () => {
    const a = indi(
      '1 ASSO @VOID@',
      '2 ROLE _CHILD',
      '1 ASSO @VOID@',
      '2 ROLE witn',
    ).associations;
    expect(a.map((x) => x.role)).toEqual(['_CHILD', 'WITN']);
  });

  it('drops the id of a person who does not exist', () => {
    expect(
      indi('1 ASSO @I77@', '2 ROLE FRIEND').associations[0]!.indiId,
    ).toBeUndefined();
  });

  it('5.5.1: RELA becomes the role phrase, role stays undefined', () => {
    const tree = treeOf(
      doc5('0 @I1@ INDI', '1 ASSO @I2@', '2 RELA Godfather', '0 @I2@ INDI'),
    );
    const a = tree.indis.get('I1')!.associations[0]!;
    expect(a).toMatchObject({indiId: 'I2', rolePhrase: 'Godfather'});
    expect(a.role).toBeUndefined();
  });
});

describe('multimedia', () => {
  const objects = [
    '0 @O1@ OBJE',
    '1 RESN CONFIDENTIAL, LOCKED',
    '1 FILE media/CharlotteBront%C3%AB.jpg',
    '2 FORM image/jpeg',
    '3 MEDI OTHER',
    '4 PHRASE Portrait',
    '1 FILE media/original.mp3',
    '2 FORM audio/mp3',
    '3 MEDI AUDIO',
    '2 TITL Object title',
    '2 TRAN media/derived.oga',
    '3 FORM audio/ogg',
    '2 TRAN media/transcript.vtt',
    '3 FORM text/vtt',
  ];

  it('reads an OBJE record through a link with TITL and CROP', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 OBJE @O1@',
        '2 TITL Link title',
        '2 CROP',
        '3 TOP 10',
        '3 LEFT 20',
        '3 HEIGHT 30',
        '3 WIDTH 40',
        '1 OBJE @VOID@',
        '2 TITL Nothing to show',
        '1 OBJE @O9@',
        ...objects,
      ),
    );
    const media = tree.indis.get('I1')!.media;
    expect(media).toHaveLength(1);
    expect(media[0]).toEqual({
      objectId: 'O1',
      title: 'Link title',
      crop: {top: 10, left: 20, height: 30, width: 40},
      restrictions: ['CONFIDENTIAL', 'LOCKED'],
      files: [
        {
          path: 'media/CharlotteBront%C3%AB.jpg',
          mime: 'image/jpeg',
          medium: 'OTHER',
          mediumPhrase: 'Portrait',
          translations: [],
        },
        {
          path: 'media/original.mp3',
          mime: 'audio/mp3',
          medium: 'AUDIO',
          title: 'Object title',
          translations: [
            {path: 'media/derived.oga', mime: 'audio/ogg'},
            {path: 'media/transcript.vtt', mime: 'text/vtt'},
          ],
        },
      ],
    });
  });

  it('reads only the crop sides that are given', () => {
    const tree = treeOf(
      doc7(
        '0 @I1@ INDI',
        '1 OBJE @O1@',
        '2 CROP',
        '3 TOP 100',
        '3 LEFT 100',
        ...objects,
      ),
    );
    expect(tree.indis.get('I1')!.media[0]!.crop).toEqual({top: 100, left: 100});
  });

  it('reads media of events', () => {
    const tree = treeOf(
      doc7('0 @I1@ INDI', '1 BIRT', '2 OBJE @O1@', ...objects),
    );
    expect(tree.indis.get('I1')!.events[0]!.media[0]!.objectId).toBe('O1');
  });

  it('5.5.1: extension words become media types, TYPE becomes MEDI', () => {
    const tree = treeOf(
      doc5(
        '0 @I1@ INDI',
        '1 OBJE @O1@',
        '1 OBJE',
        '2 FILE media\\inline.png',
        '3 FORM png',
        '2 TITL Inline',
        '0 @O1@ OBJE',
        '1 FILE a.jpg',
        '2 FORM jpg',
        '3 TYPE photo',
        '2 TITL Record title',
        '1 FILE b.tif',
        '2 FORM tif',
        '3 TYPE seance',
        '1 FILE c.xyz',
        '2 FORM xyz',
      ),
    );
    const [rec, inline] = tree.indis.get('I1')!.media;
    expect(rec!.objectId).toBe('O1');
    expect(rec!.files[0]).toMatchObject({
      mime: 'image/jpeg',
      medium: 'PHOTO',
      title: 'Record title',
    });
    expect(rec!.files[1]).toMatchObject({
      mime: 'image/tiff',
      medium: 'OTHER',
      mediumPhrase: 'seance',
    });
    expect(rec!.files[2]!.mime).toBeUndefined();
    expect(inline!.objectId).toBeUndefined();
    expect(inline!.files[0]).toMatchObject({
      path: 'media\\inline.png',
      mime: 'image/png',
      title: 'Inline',
    });
  });

  it('5.5: FORM and TITL beside FILE', () => {
    const tree = treeOf(
      doc5(
        '0 @I1@ INDI',
        '1 OBJE',
        '2 FORM gif',
        '2 FILE x.gif',
        '2 TITL Old style',
      ),
    );
    expect(tree.indis.get('I1')!.media[0]!.files[0]).toMatchObject({
      mime: 'image/gif',
      title: 'Old style',
    });
  });

  it('maps every 5.5.1 extension word the task names', () => {
    const words: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      tif: 'image/tiff',
      pdf: 'application/pdf',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      mp4: 'video/mp4',
      txt: 'text/plain',
      htm: 'text/html',
      html: 'text/html',
    };
    for (const [word, mime] of Object.entries(words)) {
      const t = treeOf(
        doc5(
          '0 @I1@ INDI',
          '1 OBJE',
          `2 FILE f.${word}`,
          `3 FORM ${word.toUpperCase()}`,
        ),
      );
      expect(t.indis.get('I1')!.media[0]!.files[0]!.mime, word).toBe(mime);
    }
  });
});

describe('places', () => {
  const place = (...lines: string[]) =>
    indi('1 BIRT', ...lines).events[0]!.place!;

  it('splits on commas, keeps empty jurisdictions', () => {
    expect(place('2 PLAC Cove,Cache ,  Utah, , USA').parts).toEqual([
      'Cove',
      'Cache',
      'Utah',
      '',
      'USA',
    ]);
    expect(place('2 PLAC , Oneida, Idaho').parts).toEqual([
      '',
      'Oneida',
      'Idaho',
    ]);
    expect(place('2 PLAC Somewhere').raw).toBe('Somewhere');
  });

  it('uses PLAC.FORM, else HEAD.PLAC.FORM, else nothing', () => {
    expect(place('2 PLAC A, B', '3 FORM City, Country').form).toEqual([
      'City',
      'Country',
    ]);
    const withHeader = treeOf(
      [
        '0 HEAD',
        '1 GEDC',
        '2 VERS 7.0',
        '1 PLAC',
        '2 FORM Town, State',
        '0 @I1@ INDI',
        '1 BIRT',
        '2 PLAC A, B',
        '0 TRLR',
      ].join('\n'),
    );
    expect(withHeader.indis.get('I1')!.events[0]!.place!.form).toEqual([
      'Town',
      'State',
    ]);
    expect(place('2 PLAC A, B').form).toEqual([]);
  });

  it('reads LANG and TRAN', () => {
    const p = place(
      '2 PLAC 千代田, 東京, 日本',
      '3 LANG ja',
      '3 TRAN Chiyoda, Tokyo, Nihon',
      '4 LANG ja-Latn',
      '3 TRAN Chiyoda, Tokyo, Japan',
      '4 LANG en',
    );
    expect(p.lang).toBe('ja');
    expect(p.translations).toEqual([
      {
        raw: 'Chiyoda, Tokyo, Nihon',
        parts: ['Chiyoda', 'Tokyo', 'Nihon'],
        lang: 'ja-Latn',
      },
      {
        raw: 'Chiyoda, Tokyo, Japan',
        parts: ['Chiyoda', 'Tokyo', 'Japan'],
        lang: 'en',
      },
    ]);
  });

  it('turns N/S/E/W coordinates into signed numbers', () => {
    const at = (lat: string, lon: string) => {
      const p = place('2 PLAC X', '3 MAP', `4 LATI ${lat}`, `4 LONG ${lon}`);
      return [p.latitude, p.longitude];
    };
    expect(at('N18.150944', 'E168.150944')).toEqual([18.150944, 168.150944]);
    expect(at('S33.9', 'W70.65')).toEqual([-33.9, -70.65]);
    expect(at('N0', 'E0')).toEqual([0, 0]);
    expect(at('N90', 'W180')).toEqual([90, -180]);
    expect(at('N91', 'E10')).toEqual([undefined, undefined]);
    expect(at('X5', 'E10')).toEqual([undefined, undefined]);
    expect(at('E5', 'E10')).toEqual([undefined, undefined]); // wrong axis
    expect(at('N', 'E10')).toEqual([undefined, undefined]);
  });

  it('reads EXID of a place and its notes', () => {
    const p = place(
      '2 PLAC X',
      '3 EXID 12345',
      '4 TYPE https://gedcom.io/exid-type/FamilySearch-PlaceId',
      '3 EXID abc',
      '3 NOTE about it',
    );
    expect(p.exids[0]).toMatchObject({
      value: '12345',
      label: 'FamilySearch Place ID',
      url: 'https://www.familysearch.org/en/research/places/?focusedId=12345',
    });
    expect(p.exids[1]).toEqual({value: 'abc'});
    expect(p.notes[0]!.text).toBe('about it');
  });

  it('5.5.1: FONE and ROMN become translations', () => {
    const tree = treeOf(
      doc5(
        '0 @I1@ INDI',
        '1 BIRT',
        '2 PLAC Kyoto, Japan',
        '3 ROMN Kyōto, Nihon',
        '4 TYPE romanji',
      ),
    );
    expect(tree.indis.get('I1')!.events[0]!.place!.translations).toEqual([
      {raw: 'Kyōto, Nihon', parts: ['Kyōto', 'Nihon']},
    ]);
  });
});

describe('restrictions, uids and external ids', () => {
  it('reads RESN lists, upper-cased, ignoring unknown words', () => {
    expect(indi('1 RESN CONFIDENTIAL, LOCKED').restrictions).toEqual([
      'CONFIDENTIAL',
      'LOCKED',
    ]);
    expect(indi('1 RESN privacy').restrictions).toEqual(['PRIVACY']);
    expect(indi('1 RESN secret').restrictions).toEqual([]);
    expect(indi('1 NAME x').restrictions).toEqual([]);
  });

  it('reads UID lists', () => {
    expect(indi('1 UID aaa', '1 UID bbb').uids).toEqual(['aaa', 'bbb']);
    expect(indi5('1 _UID ccc').uids).toEqual(['ccc']);
  });

  it('reads EXID with and without a type', () => {
    const ids = indi(
      '1 EXID XXXX-001',
      '2 TYPE https://gedcom.io/exid-type/FamilySearch-PersonId',
      '1 EXID 123',
      '2 TYPE http://example.com',
      '1 EXID 456',
    ).exids;
    expect(ids).toEqual([
      {
        value: 'XXXX-001',
        type: 'https://gedcom.io/exid-type/FamilySearch-PersonId',
        label: 'FamilySearch Person ID',
        url: 'https://www.familysearch.org/en/search/tree/results?q.personId=XXXX-001',
      },
      {value: '123', type: 'http://example.com'},
      {value: '456'},
    ]);
  });

  it('maps _FSFTID, AFN, RFN and RIN of 5.5.1 files', () => {
    const ids = indi5(
      '1 _FSFTID KWCD-123',
      '1 AFN 1234-AB',
      '1 RFN xyz:123',
      '1 RIN 77',
    ).exids;
    expect(ids.map((i) => [i.value, i.type, i.label])).toEqual([
      [
        'KWCD-123',
        'https://gedcom.io/exid-type/FamilySearch-PersonId',
        'FamilySearch Person ID',
      ],
      ['1234-AB', 'https://gedcom.io/terms/v7/AFN', 'Ancestral File Number'],
      ['xyz:123', 'https://gedcom.io/terms/v7/RFN', 'Record File Number'],
      ['77', 'https://gedcom.io/terms/v7/RIN', 'Record ID Number'],
    ]);
    expect(ids[0]!.url).toContain('q.personId=KWCD-123');
    expect(ids[1]!.url).toBeUndefined();
  });

  it('reads _FSFTID in a 7.0 file too, but not AFN', () => {
    const ids = indi('1 _FSFTID KWCD-123', '1 AFN 1').exids;
    expect(ids.map((i) => i.value)).toEqual(['KWCD-123']);
  });
});
