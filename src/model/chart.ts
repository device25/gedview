// Input data for the topola chart library, built from the parsed views.
//
// Rules (see ChartSettings in src/gedcom/types.ts):
// - One `famc` per person: the first FAMC that is not DISPROVEN, preferring
//   PEDI BIRTH or no PEDI. A person whose only FAMC is DISPROVEN gets it
//   only when disproven links are drawn dotted.
// - Families list their children except DISPROVEN ones when they are hidden.
// - Dates stay in their own calendar unless the date style asks for
//   Gregorian; topola gets a structured date only when it can sort and
//   print it correctly, otherwise text.
// - With `hideRestricted`, persons and events marked RESN CONFIDENTIAL or
//   PRIVACY keep their name but lose dates, places and pictures.

import type {
  DateOrRange,
  Date as TopolaDate,
  JsonEvent,
  JsonFam,
  JsonGedcomData,
  JsonImage,
  JsonIndi,
} from 'topola';
import {calendarNameEn, formatCalendarDate} from '../gedcom/date';
import {convertCalendarDate} from '../gedcom/calendar';
import type {
  CalendarDate,
  ChartSettings,
  DateStyle,
  EventDetail,
  IndiView,
  LoadedTree,
  ParsedDate,
  Restriction,
} from '../gedcom/types';
import {isImageFile, mediaUrl} from './mediaUrl';
import {splitName} from './names';

export interface ChartDataOptions {
  /** Text for a date topola cannot take as numbers (non-Gregorian calendar,
   *  BCE, dual year, or a style that shows both calendars). The default is
   *  English, e.g. "6 Apr 1889 (Julian)". */
  formatDate?: (date: CalendarDate, style: DateStyle) => string;
}

const RESTRICTED: readonly Restriction[] = ['CONFIDENTIAL', 'PRIVACY'];
const isRestricted = (r: readonly Restriction[]) =>
  r.some((x) => RESTRICTED.includes(x));

function defaultFormat(date: CalendarDate, style: DateStyle): string {
  const source =
    date.calendar === 'GREGORIAN'
      ? formatCalendarDate(date)
      : `${formatCalendarDate(date)} (${calendarNameEn(date.calendar)})`;
  if (style !== 'both' || date.calendar === 'GREGORIAN') return source;
  const gregorian = convertCalendarDate(date, 'GREGORIAN');
  return gregorian ? `${source} = ${formatCalendarDate(gregorian)}` : source;
}

function topolaDate(
  d: CalendarDate,
  qualifier: string | undefined,
  style: DateStyle,
  format: NonNullable<ChartDataOptions['formatDate']>,
): TopolaDate {
  const out: TopolaDate = {};
  if (qualifier) out.qualifier = qualifier.toLowerCase();
  // "Gregorian" style converts what can be converted exactly.
  const converted =
    style === 'gregorian' && d.calendar !== 'GREGORIAN'
      ? convertCalendarDate(d, 'GREGORIAN')
      : undefined;
  const date = converted ?? d;
  const plain =
    date.calendar === 'GREGORIAN' && !date.bce && date.dualYear === undefined;
  if (plain && !(style === 'both' && d.calendar !== 'GREGORIAN')) {
    out.year = date.year;
    if (date.monthIndex !== undefined) out.month = date.monthIndex;
    if (date.day !== undefined) out.day = date.day;
  } else {
    out.text = format(date, style);
  }
  return out;
}

/** ParsedDate -> topola DateOrRange. */
export function toTopolaDate(
  date: ParsedDate | undefined,
  style: DateStyle,
  format: NonNullable<ChartDataOptions['formatDate']> = defaultFormat,
): DateOrRange | undefined {
  if (!date) return undefined;
  const one = (d: CalendarDate, q?: string) => topolaDate(d, q, style, format);
  const v = date.value;
  switch (v.kind) {
    case 'exact':
      return {date: one(v.date, v.qualifier)};
    case 'range': {
      const range: NonNullable<DateOrRange['dateRange']> = {};
      if (v.from) range.from = one(v.from);
      if (v.to) range.to = one(v.to);
      return {dateRange: range};
    }
    case 'period': {
      const range: NonNullable<DateOrRange['dateRange']> = {};
      if (v.from) range.from = one(v.from);
      if (v.to) range.to = one(v.to);
      return {dateRange: range};
    }
    case 'empty':
      return date.phrase ? {date: {text: date.phrase}} : undefined;
    case 'unparsed':
      return {date: {text: date.raw.trim()}};
  }
}

function jsonEvent(
  event: EventDetail | undefined,
  style: DateStyle,
  format: NonNullable<ChartDataOptions['formatDate']>,
  hideRestricted: boolean,
): JsonEvent | undefined {
  if (!event) return undefined;
  if (hideRestricted && isRestricted(event.restrictions)) return undefined;
  const result: JsonEvent = toTopolaDate(event.date, style, format) ?? {};
  const place = event.place?.raw;
  if (place) result.place = place;
  if (event.date || place) {
    result.confirmed = true;
    return result;
  }
  return event.value?.trim().toUpperCase() === 'Y'
    ? {confirmed: true}
    : undefined;
}

/** The name shown on the chart: the first NAME that is not an alias. */
function chartNames(indi: IndiView) {
  const main = indi.names.find((n) => n.type !== 'AKA') ?? indi.names[0];
  const maiden = indi.names.find((n) => n.type === 'MAIDEN');
  const result: Pick<JsonIndi, 'firstName' | 'lastName' | 'maidenName'> = {};
  if (main) {
    const parts = splitName(main.raw);
    const first = [parts.before, parts.after].filter(Boolean).join(' ');
    if (first) result.firstName = first;
    if (parts.surname) result.lastName = parts.surname;
  }
  if (maiden) {
    const surname = splitName(maiden.raw).surname;
    if (surname && surname !== result.lastName) result.maidenName = surname;
  }
  return result;
}

function chartImages(
  tree: LoadedTree,
  indi: IndiView,
  hideRestricted: boolean,
): JsonImage[] {
  const images: JsonImage[] = [];
  for (const link of indi.media) {
    if (hideRestricted && isRestricted(link.restrictions)) continue;
    const file = link.files.find(isImageFile);
    const url = file && mediaUrl(tree.media, file.path);
    if (!file || !url) continue;
    const title = link.title ?? file.title;
    images.push(title ? {url, title} : {url});
  }
  return images;
}

/** Children of each family as drawn: those listed in the family, minus
 *  DISPROVEN ones when they are hidden, plus (when drawn dotted) persons
 *  whose only link is a DISPROVEN FAMC. Links that would make somebody their
 *  own ancestor are left out. */
function familyChildren(
  tree: LoadedTree,
  settings: ChartSettings,
): Map<string, string[]> {
  const children = new Map<string, Set<string>>();
  for (const fam of tree.fams.values()) {
    const ids = new Set<string>();
    for (const c of fam.children) if (c.indiId) ids.add(c.indiId);
    children.set(fam.id, ids);
  }
  for (const indi of tree.indis.values()) {
    for (const link of indi.famc) {
      if (link.status === 'DISPROVEN' && settings.disproven === 'dotted') {
        children.get(link.famId)?.add(indi.id);
      }
    }
  }
  if (settings.disproven === 'hide') {
    for (const [key, entry] of tree.childLinkStatus) {
      if (entry.status !== 'DISPROVEN') continue;
      const [famId, indiId] = key.split('|') as [string, string];
      children.get(famId)?.delete(indiId);
    }
  }

  // Cycle cut: depth-first search from parent to child; an edge to a person
  // that is still on the path closes a cycle, and that child link is dropped.
  const parentsOf = new Map<string, Array<{famId: string; kids: string[]}>>();
  for (const fam of tree.fams.values()) {
    const kids = [...children.get(fam.id)!];
    for (const p of fam.partners) {
      if (!p.indiId) continue;
      const list = parentsOf.get(p.indiId) ?? [];
      list.push({famId: fam.id, kids});
      parentsOf.set(p.indiId, list);
    }
  }
  const edgesOf = (id: string) =>
    (parentsOf.get(id) ?? []).flatMap((f) =>
      f.kids.map((kid) => ({famId: f.famId, kid})),
    );
  const state = new Map<string, 1 | 2>(); // 1 = on the path, 2 = finished
  for (const start of tree.indis.keys()) {
    if (state.has(start)) continue;
    state.set(start, 1);
    const stack = [{id: start, edges: edgesOf(start), next: 0}];
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const edge = top.edges[top.next++];
      if (!edge) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      if (!children.get(edge.famId)?.has(edge.kid)) continue; // already cut
      const s = state.get(edge.kid);
      if (s === 1) {
        children.get(edge.famId)!.delete(edge.kid);
      } else if (s === undefined) {
        state.set(edge.kid, 1);
        stack.push({id: edge.kid, edges: edgesOf(edge.kid), next: 0});
      }
    }
  }
  return new Map([...children].map(([id, set]) => [id, [...set]]));
}

/** Parents' family of a person: the first link that is not DISPROVEN,
 *  preferring PEDI BIRTH or none; a DISPROVEN one only when nothing else
 *  is left (it is only in the family's children when drawn dotted). */
function chooseFamc(indi: IndiView, children: Map<string, string[]>) {
  const links = indi.famc.filter((l) =>
    children.get(l.famId)?.includes(indi.id),
  );
  const live = links.filter((l) => l.status !== 'DISPROVEN');
  return (
    live.find((l) => l.pedigree === undefined || l.pedigree === 'BIRTH') ??
    live[0] ??
    links[0]
  )?.famId;
}

/** Builds topola's JsonGedcomData from a loaded tree. */
export function buildChartData(
  tree: LoadedTree,
  settings: ChartSettings,
  options: ChartDataOptions = {},
): JsonGedcomData {
  const format = options.formatDate ?? defaultFormat;
  const style = settings.dateStyle;
  const children = familyChildren(tree, settings);

  const event = (events: EventDetail[], tag: string) =>
    jsonEvent(
      events.find((e) => e.tag === tag),
      style,
      format,
      settings.hideRestricted,
    );

  const indis: JsonIndi[] = [];
  for (const indi of tree.indis.values()) {
    const json: JsonIndi = {
      id: indi.id,
      fams: indi.fams.filter((id) => tree.fams.has(id)),
      hideId: !settings.showIds,
      hideSex: !settings.sexColors,
      ...chartNames(indi),
    };
    const famId = chooseFamc(indi, children);
    if (famId !== undefined) json.famc = famId;
    if (indi.sex === 'M' || indi.sex === 'F') json.sex = indi.sex;
    if (!(settings.hideRestricted && isRestricted(indi.restrictions))) {
      const birth = event(indi.events, 'BIRT');
      if (birth) json.birth = birth;
      const death = event(indi.events, 'DEAT');
      if (death) json.death = death;
      const images = chartImages(tree, indi, settings.hideRestricted);
      if (images.length > 0) json.images = images;
    }
    indis.push(json);
  }

  const fams: JsonFam[] = [];
  for (const fam of tree.fams.values()) {
    const json: JsonFam = {id: fam.id, children: children.get(fam.id) ?? []};
    const husb = fam.partners.find((p) => p.role === 'HUSB')?.indiId;
    const wife = fam.partners.find((p) => p.role === 'WIFE')?.indiId;
    if (husb) json.husb = husb;
    if (wife) json.wife = wife;
    if (!(settings.hideRestricted && isRestricted(fam.restrictions))) {
      const marriage = event(fam.events, 'MARR');
      if (marriage) json.marriage = marriage;
    }
    fams.push(json);
  }
  return {indis, fams};
}
