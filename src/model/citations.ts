// All the citations of a person, wherever they are written: on the person,
// on their events and associations, and on the notes of any of these
// (a note «со слов бабушки» with its own SOUR).

import type {
  Citation,
  EventDetail,
  IndiView,
  MinSourceQuality,
  NoteText,
  Place,
} from '../gedcom/types';

/** True when the citation counts at this threshold. A citation without
 *  QUAY has no known reliability, so it passes only 'all'. */
export function meetsQuality(
  citation: Pick<Citation, 'quality'>,
  min: MinSourceQuality,
): boolean {
  if (min === 'all') return true;
  return citation.quality !== undefined && citation.quality >= Number(min);
}

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

/** True when one of the person's own citations reaches the threshold: on
 *  them, their names, events, associations or the notes of these. Those of
 *  their families do not count: a marriage record says little of each child. */
export function personMeetsQuality(
  indi: IndiView,
  min: MinSourceQuality,
): boolean {
  if (min === 'all') return true;
  return [
    ...personCitations(indi, indi.events),
    ...indi.names.flatMap((n) => [
      ...(n.citations ?? []),
      ...ofNotes(n.notes ?? []),
    ]),
  ].some((c) => meetsQuality(c, min));
}
