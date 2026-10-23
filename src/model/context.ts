// State shared by the view builders for one parsed file.

import type {GedcomNode, NoteText, ParseResult} from '../gedcom/types';

export interface ModelContext {
  parse: ParseResult;
  /** Shared notes already turned into NoteText (by record id). */
  sharedNotes: Map<string, NoteText>;
  /** Shared notes being built right now; breaks SNOTE <-> SOUR cycles. */
  sharedNotesInProgress: Set<string>;
}

export function createContext(parse: ParseResult): ModelContext {
  return {parse, sharedNotes: new Map(), sharedNotesInProgress: new Set()};
}

/** The record with this id and tag, if the file has one. */
export function record(
  ctx: ModelContext,
  id: string | undefined,
  ...tags: string[]
): GedcomNode | undefined {
  if (id === undefined) return undefined;
  const node = ctx.parse.byId.get(id);
  return node && tags.includes(node.tag) ? node : undefined;
}
