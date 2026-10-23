// Events and attributes of individuals and families, and NO structures.

import {compareDates} from '../gedcom/date';
import {child, childValue, children, pointerId} from '../gedcom/nodes';
import type {
  EventDetail,
  GedcomNode,
  NonEvent,
  ParsedDate,
} from '../gedcom/types';
import type {ModelContext} from './context';
import {
  ageOf,
  associationsOf,
  citationsOf,
  dateOf,
  mediaLinksOf,
  notesOf,
  placeOf,
  restrictionsOf,
  uidsOf,
} from './structures';

/** Individual events, attributes and ordinances (7.0 and 5.5.1). */
export const INDI_EVENT_TAGS: ReadonlySet<string> = new Set([
  // events
  'ADOP',
  'BAPM',
  'BARM',
  'BASM',
  'BIRT',
  'BLES',
  'BURI',
  'CENS',
  'CHR',
  'CHRA',
  'CONF',
  'CREM',
  'DEAT',
  'EMIG',
  'FCOM',
  'GRAD',
  'IMMI',
  'NATU',
  'ORDN',
  'PROB',
  'RETI',
  'WILL',
  'EVEN',
  // attributes
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
  // Latter-day Saint ordinances
  'BAPL',
  'CONL',
  'ENDL',
  'INIL',
  'SLGC',
]);

/** Family events, attributes and sealings. */
export const FAM_EVENT_TAGS: ReadonlySet<string> = new Set([
  'ANUL',
  'CENS',
  'DIV',
  'DIVF',
  'ENGA',
  'MARB',
  'MARC',
  'MARL',
  'MARR',
  'MARS',
  'EVEN',
  'NCHI',
  'RESI',
  'FACT',
  'SLGS',
]);

const CONTACT_TAGS = ['PHON', 'EMAIL', 'FAX', 'WWW'] as const;

/** One event, attribute or ordinance structure. */
export function eventOf(ctx: ModelContext, node: GedcomNode): EventDetail {
  const event: EventDetail = {
    tag: node.tag,
    associations: associationsOf(ctx, node),
    citations: citationsOf(ctx, node),
    notes: notesOf(ctx, node),
    media: mediaLinksOf(ctx, node),
    restrictions: restrictionsOf(node),
    uids: uidsOf(node),
    node,
  };
  if (node.value !== undefined && !node.pointer) event.value = node.value;
  const type = childValue(node, 'TYPE');
  if (type) event.type = type;

  const date = dateOf(child(node, 'DATE'));
  if (date) event.date = date;
  const sortDate = dateOf(child(node, 'SDATE'));
  if (sortDate) event.sortDate = sortDate;
  const plac = child(node, 'PLAC');
  if (plac) event.place = placeOf(ctx, plac);

  const age = ageOf(child(node, 'AGE'));
  if (age) event.age = age;
  const husband = child(node, 'HUSB');
  const husbandAge = ageOf(husband && child(husband, 'AGE'));
  if (husbandAge) event.husbandAge = husbandAge;
  const wife = child(node, 'WIFE');
  const wifeAge = ageOf(wife && child(wife, 'AGE'));
  if (wifeAge) event.wifeAge = wifeAge;

  const cause = childValue(node, 'CAUS');
  if (cause) event.cause = cause;
  const agency = childValue(node, 'AGNC');
  if (agency) event.agency = agency;
  const religion = childValue(node, 'RELI');
  if (religion) event.religion = religion;

  // Additive fields (see types.ts).
  const famc = child(node, 'FAMC');
  if (famc) {
    const famId = pointerId(famc);
    if (famId !== undefined) event.famId = famId;
    const adop = childValue(famc, 'ADOP');
    if (adop) event.adoptedBy = adop.trim().toUpperCase();
  }
  const addr = childValue(node, 'ADDR');
  if (addr) event.address = addr;
  const contacts = CONTACT_TAGS.flatMap((tag) =>
    children(node, tag)
      .filter((n) => n.value)
      .map((n) => ({kind: tag, value: n.value!})),
  );
  if (contacts.length > 0) event.contacts = contacts;
  const temple = childValue(node, 'TEMP');
  if (temple) event.temple = temple;
  const status = childValue(node, 'STAT');
  if (status) event.status = status;
  return event;
}

/** Orders events chronologically by SDATE, else DATE. Undated events come
 *  after dated ones; equal keys keep file order. */
export function sortEvents(events: EventDetail[]): EventDetail[] {
  const key = (e: EventDetail): ParsedDate | undefined => e.sortDate ?? e.date;
  return events
    .map((e, i) => ({e, i}))
    .sort((a, b) => compareDates(key(a.e), key(b.e)) || a.i - b.i)
    .map(({e}) => e);
}

export function eventsOf(
  ctx: ModelContext,
  record: GedcomNode,
  tags: ReadonlySet<string>,
): EventDetail[] {
  const events: EventDetail[] = [];
  for (const n of record.children) {
    if (tags.has(n.tag) && !n.pointer) events.push(eventOf(ctx, n));
  }
  return sortEvents(events);
}

/** NO structures. */
export function nonEventsOf(ctx: ModelContext, record: GedcomNode): NonEvent[] {
  return children(record, 'NO').map((n) => {
    const result: NonEvent = {
      tag: (n.value ?? '').trim().toUpperCase(),
      notes: notesOf(ctx, n),
      citations: citationsOf(ctx, n),
    };
    const date = dateOf(child(n, 'DATE'));
    if (date) result.date = date;
    return result;
  });
}
