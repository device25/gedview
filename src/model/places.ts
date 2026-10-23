// Places for «Карта»: where events happened (only coordinates written in
// the file — MAP.LATI/LONG; nothing is looked up), a person's path through
// them, and how descendants spread from one ancestor.

import type {
  ChartSettings,
  EventDetail,
  IndiView,
  LoadedTree,
  Place,
} from '../gedcom/types';
import {yearOf} from './bounds';
import {dateSortKey} from '../gedcom/date';
import {parentGraph} from './chart';

const isRestricted = (r: readonly string[]) =>
  r.includes('CONFIDENTIAL') || r.includes('PRIVACY');

export type EventKind =
  | 'birth'
  | 'baptism'
  | 'marriage'
  | 'death'
  | 'burial'
  | 'residence'
  | 'census'
  | 'other';

export const EVENT_KINDS: readonly EventKind[] = [
  'birth',
  'baptism',
  'marriage',
  'death',
  'burial',
  'residence',
  'census',
  'other',
];

const KIND: Record<string, EventKind> = {
  BIRT: 'birth',
  CHR: 'baptism',
  BAPM: 'baptism',
  MARR: 'marriage',
  DEAT: 'death',
  BURI: 'burial',
  CREM: 'burial',
  RESI: 'residence',
  CENS: 'census',
};

export const kindOf = (tag: string): EventKind => KIND[tag] ?? 'other';

export interface PlaceEvent {
  kind: EventKind;
  tag: string;
  year?: number;
  /** The person, or the first partner of a family event. */
  indiId?: string;
  famId?: string;
}

export interface MapPlace {
  /** PLAC as written (the key). */
  raw: string;
  /** The smallest jurisdiction, for the label. */
  name: string;
  lat: number;
  lon: number;
  events: PlaceEvent[];
}

export interface PlaceIndex {
  /** Places with coordinates. */
  mapped: MapPlace[];
  /** Places without coordinates, with how many events each has. */
  unmapped: Array<{raw: string; name: string; count: number}>;
}

const shortName = (place: Place) =>
  (place.parts.find((p) => p.trim()) ?? place.raw.split(',')[0] ?? '').trim();

const hasCoords = (
  p?: Place,
): p is Place & {latitude: number; longitude: number} =>
  p?.latitude !== undefined && p.longitude !== undefined;

/** Every event with a place, grouped by place. */
export function placeIndex(
  tree: LoadedTree,
  settings: ChartSettings,
): PlaceIndex {
  const mapped = new Map<string, MapPlace>();
  const unmapped = new Map<
    string,
    {raw: string; name: string; count: number}
  >();
  const visit = (
    events: EventDetail[],
    owner: {indiId?: string; famId?: string},
    hidden: boolean,
  ) => {
    for (const e of events) {
      if (!e.place?.raw) continue;
      if (hidden || (settings.hideRestricted && isRestricted(e.restrictions)))
        continue;
      const ev: PlaceEvent = {
        kind: kindOf(e.tag),
        tag: e.tag,
        year: yearOf(e.date),
        ...owner,
      };
      if (hasCoords(e.place)) {
        const p = mapped.get(e.place.raw) ?? {
          raw: e.place.raw,
          name: shortName(e.place),
          lat: e.place.latitude,
          lon: e.place.longitude,
          events: [],
        };
        p.events.push(ev);
        mapped.set(e.place.raw, p);
      } else {
        const u = unmapped.get(e.place.raw) ?? {
          raw: e.place.raw,
          name: shortName(e.place),
          count: 0,
        };
        u.count++;
        unmapped.set(e.place.raw, u);
      }
    }
  };
  for (const indi of tree.indis.values()) {
    visit(
      indi.events,
      {indiId: indi.id},
      settings.hideRestricted && isRestricted(indi.restrictions),
    );
  }
  for (const fam of tree.fams.values()) {
    const indiId = fam.partners.find((p) => p.indiId)?.indiId;
    visit(
      fam.events,
      {indiId, famId: fam.id},
      settings.hideRestricted && isRestricted(fam.restrictions),
    );
  }
  const byCount = <T extends {count?: number; events?: unknown[]}>(
    a: T,
    b: T,
  ) => (b.events?.length ?? b.count ?? 0) - (a.events?.length ?? a.count ?? 0);
  return {
    mapped: [...mapped.values()].sort(byCount),
    unmapped: [...unmapped.values()].sort(byCount),
  };
}

export interface PathStep {
  tag: string;
  date?: EventDetail['date'];
  place: string;
  name: string;
  lat?: number;
  lon?: number;
}

/** A person's dated events with a place, in date order (their own events
 *  and their marriages), and the ones without a date. */
export function personPath(
  tree: LoadedTree,
  indi: IndiView,
): {steps: PathStep[]; undated: PathStep[]} {
  const events = [
    ...indi.events,
    ...indi.fams.flatMap((f) => tree.fams.get(f)?.events ?? []),
  ].filter((e) => e.place?.raw);
  const step = (e: EventDetail): PathStep => ({
    tag: e.tag,
    date: e.date,
    place: e.place!.raw,
    name: shortName(e.place!),
    ...(hasCoords(e.place)
      ? {lat: e.place.latitude, lon: e.place.longitude}
      : {}),
  });
  const dated = events
    .filter((e) => dateSortKey(e.date) !== undefined)
    .sort((a, b) => dateSortKey(a.date)! - dateSortKey(b.date)!);
  return {
    steps: dated.map(step),
    undated: events.filter((e) => dateSortKey(e.date) === undefined).map(step),
  };
}

export interface SpreadNode {
  raw: string;
  name: string;
  lat: number;
  lon: number;
  /** Descendants born here. */
  born: number;
}

export interface SpreadFlow {
  from: string;
  to: string;
  /** Descendants born at `to` and further along this way. */
  count: number;
  /** First and last birth year along this flow. */
  years: [number, number] | undefined;
}

/**
 * Where the descendants of `rootId` were born, and the flows from a
 * parent's birthplace to a child's (when both have coordinates).
 */
export function spread(
  tree: LoadedTree,
  settings: ChartSettings,
  rootId: string,
): {nodes: SpreadNode[]; flows: SpreadFlow[]; people: number} {
  const {children} = parentGraph(tree, settings);
  const birthPlace = (id: string) => {
    const i = tree.indis.get(id);
    const e = i?.events.find(
      (ev) => ['BIRT', 'CHR', 'BAPM'].includes(ev.tag) && ev.place,
    );
    return e && hasCoords(e.place)
      ? {place: e.place, year: yearOf(e.date)}
      : undefined;
  };
  const nodes = new Map<string, SpreadNode>();
  const flows = new Map<string, SpreadFlow>();
  let people = 0;
  const visit = (id: string, from: string | undefined, seen: Set<string>) => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const b = birthPlace(id);
    let here = from;
    if (b) {
      people++;
      const node = nodes.get(b.place.raw) ?? {
        raw: b.place.raw,
        name: shortName(b.place),
        lat: b.place.latitude,
        lon: b.place.longitude,
        born: 0,
      };
      node.born++;
      nodes.set(b.place.raw, node);
      here = b.place.raw;
    }
    let below = b ? 1 : 0;
    const indi = tree.indis.get(id);
    for (const famId of indi?.fams ?? []) {
      for (const kid of children.get(famId) ?? []) {
        const n = visit(kid, here, seen);
        below += n;
      }
    }
    if (b && from && from !== b.place.raw) {
      const key = `${from}→${b.place.raw}`;
      const f = flows.get(key) ?? {
        from,
        to: b.place.raw,
        count: 0,
        years: undefined,
      };
      f.count += below;
      if (b.year !== undefined) {
        f.years = f.years
          ? [Math.min(f.years[0], b.year), Math.max(f.years[1], b.year)]
          : [b.year, b.year];
      }
      flows.set(key, f);
    }
    return below;
  };
  visit(rootId, undefined, new Set());
  return {nodes: [...nodes.values()], flows: [...flows.values()], people};
}
