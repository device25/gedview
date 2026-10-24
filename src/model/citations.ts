// All the citations of a person, wherever they are written: on the person,
// on their events and associations, and on the notes of any of these
// (a note «со слов бабушки» with its own SOUR).

import type {
  Citation,
  EventDetail,
  IndiView,
  NoteText,
  Place,
} from '../gedcom/types';

const ofNotes = (notes: readonly NoteText[]) =>
  notes.flatMap((n) => n.citations);

/** The citations of an event, its associations and their notes. */
export function eventCitations(
  e: Pick<EventDetail, 'citations' | 'notes' | 'associations'> & {
    place?: Pick<Place, 'notes'>;
  },
): Citation[] {
  return [
    ...ofNotes(e.notes),
    ...ofNotes(e.place?.notes ?? []),
    ...e.citations,
    ...e.associations.flatMap((a) => [...a.citations, ...ofNotes(a.notes)]),
  ];
}

/** The person's own citations (not their families'), in reading order. */
export function personCitations(
  indi: Pick<IndiView, 'citations' | 'notes' | 'associations'>,
  events: ReadonlyArray<
    Pick<EventDetail, 'citations' | 'notes' | 'associations'>
  >,
): Citation[] {
  return [
    ...indi.citations,
    ...events.flatMap(eventCitations),
    ...indi.associations.flatMap((a) => [...a.citations, ...ofNotes(a.notes)]),
    ...ofNotes(indi.notes),
  ];
}
