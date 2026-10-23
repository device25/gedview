// Personal names (NAME structures).

import {child, childValue, children} from '../gedcom/nodes';
import type {GedcomNode, NamePieces, PersonName} from '../gedcom/types';
import type {ModelContext} from './context';
import {citationsOf, notesOf} from './structures';

const PIECE_TAGS = [
  ['NPFX', 'npfx'],
  ['GIVN', 'givn'],
  ['NICK', 'nick'],
  ['SPFX', 'spfx'],
  ['SURN', 'surn'],
  ['NSFX', 'nsfx'],
] as const;

function piecesOf(node: GedcomNode): NamePieces {
  const pieces: NamePieces = {};
  for (const [tag, key] of PIECE_TAGS) {
    const values = children(node, tag)
      .map((n) => n.value)
      .filter((v): v is string => !!v);
    if (values.length > 0) pieces[key] = values.join(' ');
  }
  return pieces;
}

/** "Ivan /Sokolov/ jr." -> "Ivan Sokolov jr." */
export function displayName(raw: string): string {
  return raw.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
}

/** Text between the first pair of slashes. */
export function surnameOf(raw: string): string | undefined {
  const m = /\/([^/]*)\//.exec(raw);
  const surname = m?.[1]?.trim();
  return surname ? surname : undefined;
}

/** Splits a NAME payload around the surname: text before the slashes
 *  ("given" part), the surname and the text after them (suffix). */
export function splitName(raw: string): {
  before: string;
  surname?: string;
  after: string;
} {
  const m = /^(.*?)\/([^/]*)\/(.*)$/s.exec(raw);
  if (!m) return {before: displayName(raw), after: ''};
  const result: {before: string; surname?: string; after: string} = {
    before: displayName(m[1]!),
    after: displayName(m[3]!),
  };
  const surname = m[2]!.trim();
  if (surname) result.surname = surname;
  return result;
}

/** A NAME structure. */
export function nameOf(ctx: ModelContext, node: GedcomNode): PersonName {
  const raw = node.value ?? '';
  const name: PersonName = {
    raw,
    display: displayName(raw),
    pieces: piecesOf(node),
    translations: [],
    node,
    citations: citationsOf(ctx, node),
    notes: notesOf(ctx, node),
  };
  const surname = surnameOf(raw);
  if (surname) name.surname = surname;

  const typeNode = child(node, 'TYPE');
  if (typeNode?.value) {
    name.type = typeNode.value.trim().toUpperCase();
    const phrase = childValue(typeNode, 'PHRASE');
    if (phrase) name.typePhrase = phrase;
  }

  // TRAN in 7.0; FONE (phonetic) and ROMN (romanised) in 5.5.1.
  for (const t of node.children) {
    if (t.tag !== 'TRAN' && t.tag !== 'FONE' && t.tag !== 'ROMN') continue;
    if (!t.value) continue;
    const tran: PersonName['translations'][number] = {
      raw: t.value,
      display: displayName(t.value),
      pieces: piecesOf(t),
    };
    const lang = childValue(t, 'LANG');
    if (lang) tran.lang = lang;
    name.translations.push(tran);
  }
  return name;
}
