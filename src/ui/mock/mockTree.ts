// A small invented family ("the Sokolovs") for the demo mode (?demo) and
// tests. Every person, place and source here is fictional.
import type {
  Association,
  CalendarDate,
  ChildFamilyLink,
  Citation,
  EventDetail,
  ExternalId,
  FamView,
  GedcomNode,
  IndiView,
  LoadedTree,
  MediaLink,
  NoteText,
  ParsedAge,
  ParsedDate,
  PersonName,
  Place,
  Quality,
  Restriction,
} from '../../gedcom/types';

let lineNo = 0;
const node = (
  tag: string,
  value?: string,
  children: GedcomNode[] = [],
  xref?: string,
): GedcomNode => ({tag, value, children, xref, line: ++lineNo});

// ------------------------------------------------------------------ dates

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

function calDate(
  calendar: string,
  year: number,
  month?: number,
  day?: number,
): CalendarDate {
  return {
    calendar,
    year,
    month: month ? MONTHS[month - 1] : undefined,
    monthIndex: month,
    day,
    bce: false,
  };
}

function rawOf(c: CalendarDate): string {
  const parts = [c.day, c.month, c.year].filter(Boolean).join(' ');
  return c.calendar === 'GREGORIAN' ? parts : `${c.calendar} ${parts}`;
}

function exact(
  calendar: string,
  year: number,
  month?: number,
  day?: number,
  qualifier?: 'ABT' | 'CAL' | 'EST',
): ParsedDate {
  const date = calDate(calendar, year, month, day);
  return {
    raw: `${qualifier ? qualifier + ' ' : ''}${rawOf(date)}`,
    value: {kind: 'exact', date, qualifier},
  };
}

const greg = (y: number, m?: number, d?: number) => exact('GREGORIAN', y, m, d);
const jul = (y: number, m?: number, d?: number) => exact('JULIAN', y, m, d);
const about = (y: number) => exact('GREGORIAN', y, undefined, undefined, 'ABT');

// ---------------------------------------------------------------- pieces

const note = (
  text: string,
  mime = 'text/plain',
  extra: Partial<NoteText> = {},
): NoteText => ({
  text,
  mime,
  translations: [],
  citations: [],
  ...extra,
});

// Coordinates for «Карта»; «д. Горки» has none, so the map shows a gap.
const COORDS: Record<string, [number, number]> = {
  'с. Покровское': [56.5, 34.9],
  'Покровская церковь': [56.5, 34.9],
  'г. Калинин': [56.86, 35.9],
};

const place = (parts: string[]): Place => {
  const at = COORDS[parts[0]!];
  return {
    raw: parts.join(', '),
    parts,
    form: [],
    translations: [],
    exids: [],
    notes: [],
    ...(at ? {latitude: at[0], longitude: at[1]} : {}),
  };
};

const cite = (
  sourceId: string | undefined,
  quality: Quality | undefined,
  page?: string,
  data?: {date?: ParsedDate; texts: NoteText[]},
  extra: Partial<Citation> = {},
): Citation => ({
  sourceId,
  page,
  quality,
  data,
  media: [],
  notes: [],
  node: node('SOUR', sourceId ?? 'VOID'),
  ...extra,
});

const quote = (text: string) => ({texts: [note(text)]});

const assoc = (
  role: string,
  indiId?: string,
  phrase?: string,
  rolePhrase?: string,
): Association => ({
  indiId,
  phrase,
  role,
  rolePhrase,
  notes: [],
  citations: [],
  node: node('ASSO', indiId),
});

interface EventInit {
  date?: ParsedDate;
  sortDate?: ParsedDate;
  place?: Place;
  value?: string;
  type?: string;
  age?: ParsedAge;
  husbandAge?: ParsedAge;
  assoc?: Association[];
  cite?: Citation[];
  notes?: NoteText[];
  restrictions?: Restriction[];
}

const ev = (tag: string, i: EventInit = {}): EventDetail => ({
  tag,
  value: i.value,
  type: i.type,
  date: i.date,
  sortDate: i.sortDate,
  place: i.place,
  age: i.age,
  husbandAge: i.husbandAge,
  associations: i.assoc ?? [],
  citations: i.cite ?? [],
  notes: i.notes ?? [],
  media: [],
  restrictions: i.restrictions ?? [],
  uids: [],
  node: node(tag),
});

const years = (n: number): ParsedAge => ({raw: `${n}y`, years: n});
const PERIOD_1930 = {
  raw: 'FROM 1930',
  value: {kind: 'period', from: calDate('GREGORIAN', 1930)},
} as const satisfies ParsedDate;

const pokrovskoye = ['с. Покровское', 'Старицкий уезд', 'Тверская губерния'];

// ----------------------------------------------------------------- people

interface PersonInit {
  id: string;
  name: string; // "Given /Surname/"
  sex: 'M' | 'F';
  birth?: ParsedDate;
  death?: ParsedDate;
  famc?: ChildFamilyLink[];
  fams?: string[];
  events?: EventDetail[];
  extra?: Partial<IndiView>;
}

function parseName(
  raw: string,
  type?: string,
  typePhrase?: string,
): PersonName {
  const surname = /\/(.*)\//.exec(raw)?.[1];
  const display = raw.replace(/\//g, '').replace(/\s+/g, ' ').trim();
  const givn = raw.replace(/\/.*\//, '').trim();
  return {
    raw,
    display,
    surname,
    type,
    typePhrase,
    pieces: {givn, surn: surname},
    translations: [],
    node: node('NAME', raw),
  };
}

function person(i: PersonInit): IndiView {
  const events: EventDetail[] = [];
  if (i.birth) events.push(ev('BIRT', {date: i.birth}));
  if (i.death) events.push(ev('DEAT', {date: i.death}));
  events.push(...(i.events ?? []));
  return {
    id: i.id,
    names: [parseName(i.name)],
    sex: i.sex,
    famc: i.famc ?? [],
    fams: i.fams ?? [],
    events,
    nonEvents: [],
    associations: [],
    citations: [],
    notes: [],
    media: [],
    exids: [],
    uids: [],
    restrictions: [],
    extensions: [],
    ...i.extra,
  };
}

const famc = (famId: string, extra: Partial<ChildFamilyLink> = {}) => ({
  famId,
  pedigree: 'BIRTH',
  node: node('FAMC', famId),
  ...extra,
});

const DISPUTED_PHRASE =
  'Запись о рождении не найдена; связь установлена по исповедной ведомости 1890 года.';

const photo: MediaLink = {
  objectId: 'M1',
  files: [
    {
      path: 'photos/wedding-1912.jpg',
      mime: 'image/jpeg',
      title: 'Свадебная фотография, 1912',
      translations: [],
    },
  ],
  title: 'Свадебная фотография, 1912',
  crop: {top: 5, left: 20, height: 60, width: 40},
  restrictions: [],
};

const audio: MediaLink = {
  objectId: 'M2',
  files: [
    {
      path: 'audio/daughter-story.mp3',
      mime: 'audio/mpeg',
      title: 'Рассказ дочери, аудио',
      translations: [{path: 'audio/daughter-story.vtt', mime: 'text/vtt'}],
    },
  ],
  title: 'Рассказ дочери, аудио',
  restrictions: [],
};

/** Hidden while "hide restricted" is on. */
const privateScan: MediaLink = {
  objectId: 'M3',
  files: [
    {
      path: 'scans/personal-file.pdf',
      mime: 'application/pdf',
      title: 'Личное дело (скан)',
      translations: [],
    },
  ],
  title: 'Личное дело (скан)',
  restrictions: ['PRIVACY'],
};

const exids: ExternalId[] = [
  {
    value: 'XXXX-XXX',
    type: 'https://www.familysearch.org/',
    label: 'FamilySearch',
    url: 'https://www.familysearch.org/',
  },
  {value: 'A-1889/41', type: 'https://example.org/archive-id'},
  // A registry entry with an unsafe URL must never become a link.
  {
    value: 'bad-1',
    type: 'https://example.org/bad',
    label: 'Bad link',
    url: 'javascript:alert(1)',
  },
];

// A note in HTML that carries a script and an unsafe link.
const HTML_NOTE =
  '<p>Крестьянин, с 1930-х — <b>рабочий льнозавода</b>.<script>alert("xss")</script> ' +
  'Фамилию <i>Соколов-Белов</i> носил до 1934 года.</p>' +
  '<ul><li><a href="https://example.org/lnozavod">История льнозавода</a></li>' +
  '<li><a href="javascript:alert(1)" onclick="alert(2)">Опасная ссылка</a></li></ul>';

const TRAN_NOTE = note(
  'Служил рядовым в 1915–1917 годах; демобилизован по ранению.',
  'text/plain',
  {
    lang: 'ru',
    translations: [
      {
        text: 'Served as a private in 1915–1917; discharged after an injury.',
        mime: 'text/plain',
        lang: 'en',
      },
    ],
  },
);

const ivan = person({
  id: 'I1',
  name: 'Иван Петрович /Соколов/',
  sex: 'M',
  famc: [
    famc('F1', {
      status: 'CHALLENGED',
      statusPhrase: DISPUTED_PHRASE,
    }),
    famc('F4', {
      pedigree: 'ADOPTED',
      pedigreePhrase: 'усыновлён отчимом',
    }),
    famc('F5', {
      status: 'DISPROVEN',
      statusPhrase:
        'Семейное предание; опровергнуто записью о рождении (метрика 1889 года).',
    }),
  ],
  fams: ['F2'],
  events: [
    ev('BIRT', {
      date: jul(1889, 4, 6),
      place: place(pokrovskoye),
      cite: [
        cite(
          'S1',
          3,
          'л. 12 об., запись № 41',
          quote(
            '…крестьянина Петра Ильина Соколова и законной жены его Марии Феодоровой сын Иоанн',
          ),
        ),
      ],
    }),
    ev('CHR', {
      date: jul(1889, 4, 8),
      place: place(['Покровская церковь', 'с. Покровское']),
      assoc: [
        assoc('GODP', 'I7'),
        assoc('GODP', 'I8'),
        assoc('CLERGY', undefined, 'священник Василий'),
      ],
      cite: [cite('S1', 3, 'л. 12 об., запись № 41')],
    }),
    ev('CENS', {
      date: jul(1897, 1, 28),
      place: place(['с. Покровское']),
      age: years(7),
      cite: [cite('S2', 1, 'лист 3, строка 9')],
    }),
    ev('RESI', {
      date: {
        raw: 'BET 1925 AND 1928',
        value: {
          kind: 'range',
          type: 'BET',
          from: calDate('GREGORIAN', 1925),
          to: calDate('GREGORIAN', 1928),
        },
      },
      // Sorted by SDATE, not by DATE.
      sortDate: greg(1926),
      place: place(['д. Горки']),
      age: {raw: '< 40y', bound: '<', years: 40},
    }),
    ev('OCCU', {
      date: PERIOD_1930,
      value: 'рабочий льнозавода',
      cite: [
        cite(
          'S4',
          2,
          'запись № 3',
          {
            date: greg(1934, 6, 1),
            texts: [
              note(
                '<p>Принят <b>рабочим</b> льнозавода с 1 июня 1930 года.</p>',
                'text/html',
              ),
            ],
          },
          {notes: [note('Запись внесена со слов владельца.')]},
        ),
      ],
    }),
    ev('EVEN', {
      type: 'Служебные сведения',
      value: 'Не для публикации',
      restrictions: ['CONFIDENTIAL'],
    }),
    ev('DEAT', {
      date: greg(1957),
      place: place(['г. Калинин', '', 'Калининская область', 'СССР']),
      age: {raw: '67y 11m 25d', years: 67, months: 11, days: 25},
      cite: [
        cite('S3', 1),
        // @VOID@ source: only a page.
        cite(undefined, 0, 'д. 17, л. 4', undefined, {
          inlineText: 'Выписка из архивного дела',
        }),
      ],
    }),
  ],
  extra: {
    names: [
      {
        ...parseName('Иван Петрович /Соколов/', 'BIRTH'),
        translations: [
          {
            raw: 'Ivan Petrovich /Sokolov/',
            display: 'Ivan Petrovich Sokolov',
            lang: 'en',
            pieces: {givn: 'Ivan Petrovich', surn: 'Sokolov'},
          },
        ],
      },
      parseName(
        'Иван /Соколов-Белов/',
        'OTHER',
        'по отчиму, в документах 1920-х',
      ),
    ],
    nonEvents: [
      {
        tag: 'DIV',
        date: {
          raw: 'FROM 1912 TO 1957',
          value: {
            kind: 'period',
            from: calDate('GREGORIAN', 1912),
            to: calDate('GREGORIAN', 1957),
          },
        },
        notes: [],
        citations: [cite('S2', 1, 'лист 3, строка 10')],
      },
    ],
    associations: [
      assoc('FRIEND', 'I7'),
      assoc('NGHBR', undefined, 'Фёдор Лавров, сосед по двору'),
      assoc('OTHER', undefined, 'Анна, соседка', 'свояченица'),
    ],
    citations: [cite('S5', 0, undefined, undefined, {})],
    notes: [note(HTML_NOTE, 'text/html', {lang: 'ru'}), TRAN_NOTE],
    media: [photo, audio, privateScan],
    exids,
    uids: ['0f4ae2b0-7c52-4c1d-9c7e-3b61d8a5c001'],
    restrictions: ['LOCKED'],
    extensions: [
      {
        tag: '_RUFNAME',
        uri: 'https://example.org/ext/_RUFNAME',
        node: node('_RUFNAME', 'Иван'),
      },
      {
        tag: '_LOCAL',
        node: node('_LOCAL', 'пометка архива'),
      },
    ],
  },
});

const people: IndiView[] = [
  ivan,
  person({
    id: 'I2',
    name: 'Пётр Ильич /Соколов/',
    sex: 'M',
    birth: greg(1858),
    death: greg(1921),
    fams: ['F1'],
  }),
  person({
    id: 'I3',
    name: 'Мария Фёдоровна /Лаврова/',
    sex: 'F',
    birth: about(1862),
    death: greg(1930),
    fams: ['F1'],
  }),
  person({
    id: 'I4',
    name: 'Евдокия Семёновна /Крылова/',
    sex: 'F',
    birth: greg(1893),
    death: greg(1975),
    famc: [famc('F3')],
    fams: ['F2'],
  }),
  person({
    id: 'I5',
    name: 'Николай Иванович /Соколов/',
    sex: 'M',
    birth: greg(1913),
    death: greg(1942),
    famc: [famc('F2')],
  }),
  person({
    id: 'I6',
    name: 'Александра Ивановна /Соколова/',
    sex: 'F',
    birth: greg(1919),
    death: greg(2004),
    famc: [famc('F2')],
  }),
  person({
    id: 'I7',
    name: 'Михаил Андреевич /Белов/',
    sex: 'M',
    birth: greg(1860),
    death: greg(1919),
    fams: ['F4'],
  }),
  person({
    id: 'I8',
    name: 'Анна Ивановна /Соколова/',
    sex: 'F',
    birth: greg(1866),
    death: greg(1941),
    fams: ['F4'],
  }),
  person({
    id: 'I9',
    name: 'Семён Фёдорович /Крылов/',
    sex: 'M',
    birth: greg(1865),
    death: greg(1940),
    fams: ['F3', 'F5'],
  }),
  person({
    id: 'I10',
    name: 'Пелагея Ивановна /Крылова/',
    sex: 'F',
    birth: greg(1868),
    death: greg(1935),
    fams: ['F3'],
  }),
];

// --------------------------------------------------------------- families

const fam = (
  id: string,
  husb: string,
  wife: string,
  children: string[],
  extra: Partial<FamView> = {},
): FamView => ({
  id,
  partners: [
    {role: 'HUSB', indiId: husb},
    {role: 'WIFE', indiId: wife},
  ],
  children: children.map((indiId) => ({indiId})),
  events: [],
  nonEvents: [],
  associations: [],
  citations: [],
  notes: [],
  media: [],
  exids: [],
  uids: [],
  restrictions: [],
  node: node('FAM', undefined, [], id),
  ...extra,
});

const families: FamView[] = [
  fam('F1', 'I2', 'I3', ['I1']),
  fam('F2', 'I1', 'I4', ['I5', 'I6'], {
    events: [
      ev('MARR', {
        date: jul(1912, 2, 12),
        place: place(['Покровская церковь', 'с. Покровское']),
        husbandAge: years(22),
        assoc: [
          assoc('WITN', 'I2'),
          assoc('WITN', undefined, 'крестьянин Фёдор Лавров'),
        ],
      }),
    ],
  }),
  fam('F3', 'I9', 'I10', ['I4']),
  // Adoptive parents of Ivan (his stepfather's family).
  fam('F4', 'I7', 'I8', ['I1']),
  // A family legend that the records disprove.
  fam('F5', 'I9', 'I10', ['I1'], {
    partners: [{role: 'HUSB', indiId: 'I9'}],
  }),
];

// ------------------------------------------------------------------ tree

const sources: Array<[string, string]> = [
  ['S1', 'Метрическая книга Покровской церкви, 1889'],
  ['S2', 'Перепись 1897 года, переписной лист'],
  ['S3', 'Рассказ дочери, записан в 1998 году'],
  ['S4', 'Трудовая книжка, 1934'],
  ['S5', 'Семейное предание (оценка)'],
];

const records: GedcomNode[] = [
  node('HEAD', undefined, [
    node('GEDC', undefined, [node('VERS', '7.0.18')]),
    node('FILE', 'Соколовы'),
  ]),
  ...sources.map(([id, title]) =>
    node('SOUR', undefined, [node('TITL', title)], id),
  ),
  ...people.map((p) => node('INDI', undefined, [], p.id)),
  ...families.map((f) => f.node),
  node('TRLR'),
];

export const mockTree: LoadedTree = {
  source: {kind: 'gedzip', name: 'sokolovy.gdz'},
  parse: {
    version: {raw: '7.0.18', major: '7'},
    records,
    byId: new Map(records.filter((r) => r.xref).map((r) => [r.xref!, r])),
    schema: new Map([['_RUFNAME', 'https://example.org/ext/_RUFNAME']]),
    placeForm: [],
    warnings: [],
  },
  media: new Map(),
  indis: new Map(people.map((p) => [p.id, p])),
  fams: new Map(families.map((f) => [f.id, f])),
  childLinkStatus: new Map([
    ['F1|I1', {status: 'CHALLENGED', phrase: DISPUTED_PHRASE}],
    ['F5|I1', {status: 'DISPROVEN'}],
  ]),
};
