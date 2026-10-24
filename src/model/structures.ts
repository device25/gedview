// Substructures shared by many records: notes, source citations,
// associations, multimedia, places, restrictions, identifiers, dates, ages.
// Pure functions over the GedcomNode tree; 5.5.1 shapes are read into the
// same view types as the 7.0 ones.

import {parseAge} from '../gedcom/age';
import {parseDate} from '../gedcom/date';
import {
  child,
  childValue,
  children,
  pointerId,
  splitList,
} from '../gedcom/nodes';
import type {
  Association,
  Citation,
  Crop,
  ExternalId,
  GedcomNode,
  MediaFile,
  MediaLink,
  NoteText,
  ParsedAge,
  ParsedDate,
  Place,
  Quality,
  Restriction,
} from '../gedcom/types';
import {record, type ModelContext} from './context';
import {FAMILYSEARCH_PERSON_ID_TYPE, makeExternalId} from './exid';
import {mimeFromForm} from './mime';

// ------------------------------------------------------------ dates, ages

/** A DATE / SDATE node with its PHRASE and TIME. */
export function dateOf(node: GedcomNode | undefined): ParsedDate | undefined {
  if (!node) return undefined;
  const extra: {phrase?: string; time?: string} = {};
  const phrase = childValue(node, 'PHRASE');
  const time = childValue(node, 'TIME');
  if (phrase) extra.phrase = phrase;
  if (time) extra.time = time;
  return parseDate(node.value ?? '', extra);
}

/** An AGE node with its PHRASE. */
export function ageOf(node: GedcomNode | undefined): ParsedAge | undefined {
  if (!node) return undefined;
  return parseAge(node.value ?? '', childValue(node, 'PHRASE'));
}

// ------------------------------------------------- restrictions and ids

const RESTRICTIONS: readonly string[] = ['CONFIDENTIAL', 'LOCKED', 'PRIVACY'];

/** RESN list of a structure. */
export function restrictionsOf(node: GedcomNode): Restriction[] {
  const resn = childValue(node, 'RESN');
  if (!resn) return [];
  return splitList(resn)
    .map((s) => s.toUpperCase())
    .filter((s): s is Restriction => RESTRICTIONS.includes(s));
}

/** UID list (5.5.1 files use the _UID extension for the same thing). */
export function uidsOf(node: GedcomNode): string[] {
  return [...children(node, 'UID'), ...children(node, '_UID')]
    .map((n) => n.value)
    .filter((v): v is string => !!v);
}

/** EXID list; 5.5.1 AFN, RFN, RIN and the FamilySearch _FSFTID are mapped to
 *  the equivalent EXID. */
export function exidsOf(ctx: ModelContext, node: GedcomNode): ExternalId[] {
  const result: ExternalId[] = [];
  for (const n of children(node, 'EXID')) {
    if (n.value) result.push(makeExternalId(n.value, childValue(n, 'TYPE')));
  }
  for (const n of children(node, '_FSFTID')) {
    if (n.value)
      result.push(makeExternalId(n.value, FAMILYSEARCH_PERSON_ID_TYPE));
  }
  if (ctx.parse.version.major !== '7') {
    for (const tag of ['AFN', 'RFN', 'RIN']) {
      for (const n of children(node, tag)) {
        if (n.value) {
          result.push(
            makeExternalId(n.value, `https://gedcom.io/terms/v7/${tag}`),
          );
        }
      }
    }
  }
  return result;
}

// ------------------------------------------------------------------ notes

const PLAIN = 'text/plain';

function noteBody(node: GedcomNode, sharedNoteId?: string): NoteText {
  const mime = childValue(node, 'MIME') || PLAIN;
  const lang = childValue(node, 'LANG');
  const note: NoteText = {
    text: node.value ?? '',
    mime,
    translations: children(node, 'TRAN').map((t) => {
      const tran: NoteText['translations'][number] = {
        text: t.value ?? '',
        // A missing MIME or LANG means "same as the superstructure".
        mime: childValue(t, 'MIME') || mime,
      };
      const tl = childValue(t, 'LANG') || lang;
      if (tl) tran.lang = tl;
      return tran;
    }),
    citations: [],
  };
  if (lang) note.lang = lang;
  if (sharedNoteId !== undefined) note.sharedNoteId = sharedNoteId;
  return note;
}

/** A NOTE or SNOTE structure (or a 5.5.1 NOTE pointing to a NOTE record).
 *  Undefined for @VOID@ and dangling pointers. */
export function noteOf(
  ctx: ModelContext,
  node: GedcomNode,
): NoteText | undefined {
  if (!node.pointer) {
    const note = noteBody(node);
    note.citations = children(node, 'SOUR').map((s) => citationOf(ctx, s));
    return note;
  }
  const id = pointerId(node);
  const rec = record(ctx, id, 'SNOTE', 'NOTE');
  if (id === undefined || !rec) return undefined;
  const cached = ctx.sharedNotes.get(id);
  if (cached) return cached;
  const note = noteBody(rec, id);
  if (ctx.sharedNotesInProgress.has(id)) return note; // cycle: no citations
  ctx.sharedNotesInProgress.add(id);
  note.citations = children(rec, 'SOUR').map((s) => citationOf(ctx, s));
  ctx.sharedNotesInProgress.delete(id);
  ctx.sharedNotes.set(id, note);
  return note;
}

/** All NOTE and SNOTE children, in file order. */
export function notesOf(ctx: ModelContext, node: GedcomNode): NoteText[] {
  const result: NoteText[] = [];
  for (const c of node.children) {
    if (c.tag !== 'NOTE' && c.tag !== 'SNOTE') continue;
    const note = noteOf(ctx, c);
    if (note) result.push(note);
  }
  return result;
}

// -------------------------------------------------------------- citations

function qualityOf(value: string | undefined): Quality | undefined {
  return value !== undefined && /^[0-3]$/.test(value.trim())
    ? (Number(value.trim()) as Quality)
    : undefined;
}

function textNote(node: GedcomNode): NoteText {
  const lang = childValue(node, 'LANG');
  const note: NoteText = {
    text: node.value ?? '',
    mime: childValue(node, 'MIME') || PLAIN,
    translations: [],
    citations: [],
  };
  if (lang) note.lang = lang;
  return note;
}

const KNOWN_ROLES: readonly string[] = [
  'CHIL',
  'CLERGY',
  'FATH',
  'FRIEND',
  'GODP',
  'HUSB',
  'MOTH',
  'MULTIPLE',
  'NGHBR',
  'OFFICIATOR',
  'PARENT',
  'SPOU',
  'WIFE',
  'WITN',
  'OTHER',
];

/** SOUR.EVEN.ROLE: an enumeration in 7.0, free text in 5.5.1. */
function roleOf(node: GedcomNode | undefined): {
  role?: string;
  rolePhrase?: string;
} {
  if (!node?.value) return {};
  const upper = node.value.trim().toUpperCase();
  const phrase = childValue(node, 'PHRASE');
  if (KNOWN_ROLES.includes(upper) || /^_[A-Z0-9_]+$/.test(upper)) {
    return phrase ? {role: upper, rolePhrase: phrase} : {role: upper};
  }
  return {rolePhrase: phrase ?? node.value};
}

/** A SOUR structure inside a record, event, name, note, ... */
export function citationOf(
  ctx: ModelContext,
  node: GedcomNode,
  /** Read the details of the media it shows (see mediaLinkOf). */
  mediaDetails = false,
): Citation {
  const citation: Citation = {
    media: mediaLinksOf(ctx, node, mediaDetails),
    notes: notesOf(ctx, node),
    node,
  };
  const page = childValue(node, 'PAGE');
  if (page) citation.page = page;
  if (node.pointer) {
    const id = pointerId(node);
    if (id !== undefined) citation.sourceId = id;
    else if (page) citation.inlineText = page; // @VOID@ with a PAGE only
  } else if (node.value) {
    citation.inlineText = node.value; // 5.5.1 inline source
  }

  const quality = qualityOf(childValue(node, 'QUAY'));
  if (quality !== undefined) citation.quality = quality;

  const dataNode = child(node, 'DATA');
  // 5.5.1 inline sources put TEXT directly under SOUR.
  const textNodes = [
    ...(dataNode ? children(dataNode, 'TEXT') : []),
    ...children(node, 'TEXT'),
  ];
  const date = dataNode && dateOf(child(dataNode, 'DATE'));
  if (date || textNodes.length > 0) {
    citation.data = {texts: textNodes.map(textNote)};
    if (date) citation.data.date = date;
  }

  const even = child(node, 'EVEN');
  if (even) {
    const ev: NonNullable<Citation['event']> = {type: even.value ?? ''};
    const phrase = childValue(even, 'PHRASE');
    if (phrase) ev.phrase = phrase;
    Object.assign(ev, roleOf(child(even, 'ROLE')));
    citation.event = ev;
  }
  return citation;
}

export function citationsOf(ctx: ModelContext, node: GedcomNode): Citation[] {
  return children(node, 'SOUR').map((s) => citationOf(ctx, s));
}

// ----------------------------------------------------------- associations

/** An ASSO structure. */
export function associationOf(
  ctx: ModelContext,
  node: GedcomNode,
): Association {
  const id = pointerId(node);
  const assoc: Association = {
    notes: notesOf(ctx, node),
    citations: citationsOf(ctx, node),
    node,
  };
  if (id !== undefined && record(ctx, id, 'INDI')) assoc.indiId = id;
  const phrase = childValue(node, 'PHRASE');
  if (phrase) assoc.phrase = phrase;
  const role = child(node, 'ROLE');
  if (role?.value) assoc.role = role.value.trim().toUpperCase();
  const rolePhrase =
    (role && childValue(role, 'PHRASE')) || childValue(node, 'RELA');
  if (rolePhrase) assoc.rolePhrase = rolePhrase;
  return assoc;
}

export function associationsOf(
  ctx: ModelContext,
  node: GedcomNode,
): Association[] {
  return children(node, 'ASSO').map((a) => associationOf(ctx, a));
}

// ------------------------------------------------------------------ media

const MEDIA_MEDIUMS: readonly string[] = [
  'AUDIO',
  'BOOK',
  'CARD',
  'ELECTRONIC',
  'FICHE',
  'FILM',
  'MAGAZINE',
  'MANUSCRIPT',
  'MAP',
  'NEWSPAPER',
  'PHOTO',
  'TOMBSTONE',
  'VIDEO',
  'OTHER',
];

function mediaFileOf(
  node: GedcomNode,
  holder: GedcomNode,
): MediaFile | undefined {
  if (!node.value) return undefined;
  // 5.5: FORM and TITL are siblings of FILE; 5.5.1 and 7.0: children.
  const form = child(node, 'FORM') ?? child(holder, 'FORM');
  const file: MediaFile = {path: node.value, translations: []};
  const mime = mimeFromForm(form?.value);
  if (mime) file.mime = mime;
  // 7.0 FORM.MEDI; 5.5.1 FORM.TYPE ("photo", "tombstone", ...).
  const mediNode = form && (child(form, 'MEDI') ?? child(form, 'TYPE'));
  if (mediNode?.value) {
    const medium = mediNode.value.trim().toUpperCase();
    const mediumPhrase = childValue(mediNode, 'PHRASE');
    if (MEDIA_MEDIUMS.includes(medium)) {
      file.medium = medium;
      if (mediumPhrase) file.mediumPhrase = mediumPhrase;
    } else {
      file.medium = 'OTHER';
      file.mediumPhrase = mediumPhrase ?? mediNode.value;
    }
  }
  const title = childValue(node, 'TITL') ?? childValue(holder, 'TITL');
  if (title) file.title = title;
  for (const t of children(node, 'TRAN')) {
    if (!t.value) continue;
    const tran: MediaFile['translations'][number] = {path: t.value};
    const m = mimeFromForm(childValue(t, 'FORM'));
    if (m) tran.mime = m;
    file.translations.push(tran);
  }
  return file;
}

function filesOf(node: GedcomNode): MediaFile[] {
  const files: MediaFile[] = [];
  for (const f of children(node, 'FILE')) {
    const file = mediaFileOf(f, node);
    if (file) files.push(file);
  }
  return files;
}

function cropOf(node: GedcomNode | undefined): Crop | undefined {
  if (!node) return undefined;
  const crop: Crop = {};
  for (const [tag, key] of [
    ['TOP', 'top'],
    ['LEFT', 'left'],
    ['HEIGHT', 'height'],
    ['WIDTH', 'width'],
  ] as const) {
    const v = childValue(node, tag);
    if (v !== undefined && /^\d+$/.test(v.trim())) crop[key] = Number(v);
  }
  return crop;
}

/** An OBJE structure: a pointer to an OBJE record (7.0, 5.5.1) or an inline
 *  5.5.1 object. Undefined when there is no file to show. */
export function mediaLinkOf(
  ctx: ModelContext,
  node: GedcomNode,
  /** Read the record's notes, sources and ids (not inside a citation, so a
   *  source that shows a file that cites the source does not loop). */
  details = true,
): MediaLink | undefined {
  if (node.pointer) {
    const id = pointerId(node);
    const rec = record(ctx, id, 'OBJE');
    if (id === undefined || !rec) return undefined;
    const files = filesOf(rec);
    if (files.length === 0) return undefined;
    const link: MediaLink = {
      objectId: id,
      files,
      restrictions: restrictionsOf(rec),
    };
    const title = childValue(node, 'TITL');
    if (title) link.title = title;
    const crop = cropOf(child(node, 'CROP'));
    if (crop) link.crop = crop;
    if (details) {
      const notes = notesOf(ctx, rec);
      if (notes.length) link.notes = notes;
      const citations = children(rec, 'SOUR').map((c) =>
        citationOf(ctx, c, false),
      );
      if (citations.length) link.citations = citations;
      const exids = exidsOf(ctx, rec);
      if (exids.length) link.exids = exids;
    }
    return link;
  }
  const files = filesOf(node);
  if (files.length === 0) return undefined;
  return {files, restrictions: restrictionsOf(node)};
}

export function mediaLinksOf(
  ctx: ModelContext,
  node: GedcomNode,
  details = true,
): MediaLink[] {
  const result: MediaLink[] = [];
  for (const o of children(node, 'OBJE')) {
    const link = mediaLinkOf(ctx, o, details);
    if (link) result.push(link);
  }
  return result;
}

// ----------------------------------------------------------------- places

function coordinate(
  value: string | undefined,
  positive: string,
  negative: string,
  limit: number,
): number | undefined {
  if (value === undefined) return undefined;
  const m = /^\s*([A-Za-z])?\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!m) return undefined;
  const hemisphere = m[1]?.toUpperCase();
  if (hemisphere && hemisphere !== positive && hemisphere !== negative) {
    return undefined;
  }
  const n = Number(m[2]);
  const signed = hemisphere === negative ? -Math.abs(n) : n;
  return Math.abs(signed) <= limit ? signed : undefined;
}

/** A PLAC structure. */
export function placeOf(ctx: ModelContext, node: GedcomNode): Place {
  const raw = node.value ?? '';
  const formValue = childValue(node, 'FORM');
  const place: Place = {
    raw,
    parts: raw === '' ? [] : splitList(raw),
    form: formValue ? splitList(formValue) : ctx.parse.placeForm,
    translations: [],
    exids: [],
    notes: notesOf(ctx, node),
  };
  const lang = childValue(node, 'LANG');
  if (lang) place.lang = lang;
  // TRAN in 7.0; FONE (phonetic) and ROMN (romanised) in 5.5.1.
  for (const t of node.children) {
    if (t.tag !== 'TRAN' && t.tag !== 'FONE' && t.tag !== 'ROMN') continue;
    if (!t.value) continue;
    const tran: Place['translations'][number] = {
      raw: t.value,
      parts: splitList(t.value),
    };
    const tl = childValue(t, 'LANG');
    if (tl) tran.lang = tl;
    place.translations.push(tran);
  }
  const map = child(node, 'MAP');
  if (map) {
    const lat = coordinate(childValue(map, 'LATI'), 'N', 'S', 90);
    const lon = coordinate(childValue(map, 'LONG'), 'E', 'W', 180);
    if (lat !== undefined && lon !== undefined) {
      place.latitude = lat;
      place.longitude = lon;
    }
  }
  place.exids = exidsOf(ctx, node);
  return place;
}
