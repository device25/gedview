import type {
  CalendarDate,
  Citation,
  EventDetail,
  FamView,
  IndiView,
  LoadedTree,
  ParsedDate,
} from '../gedcom/types';

/** Title of the tree: HEAD.FILE if present, else the file name sans extension. */
export function treeTitle(tree: LoadedTree): string {
  const head = tree.parse.records.find((r) => r.tag === 'HEAD');
  const file = head?.children.find((c) => c.tag === 'FILE')?.value?.trim();
  const base = file || tree.source.name;
  return base.replace(/^.*[\\/]/, '').replace(/\.(ged|gdz|zip)$/i, '');
}

export interface SourceRecord {
  id: string;
  title: string;
}

export function sourceTitle(tree: LoadedTree, sourceId: string): string {
  const rec = tree.parse.byId.get(sourceId);
  const t = rec?.children.find((c) => c.tag === 'TITL')?.value;
  const a = rec?.children.find((c) => c.tag === 'ABBR')?.value;
  return t || a || sourceId;
}

export function listSources(tree: LoadedTree): SourceRecord[] {
  return tree.parse.records
    .filter((r) => r.tag === 'SOUR' && r.xref)
    .map((r) => ({
      id: r.xref as string,
      title: sourceTitle(tree, r.xref as string),
    }));
}

// ------------------------------------------------------------- relatives

export interface ParentGroup {
  famId: string;
  pedigree?: string;
  status?: string;
  people: IndiView[];
}

export interface Relatives {
  parents: ParentGroup[];
  spouses: Array<{famId: string; spouse?: IndiView}>;
  children: IndiView[];
}

export function relativesOf(tree: LoadedTree, indi: IndiView): Relatives {
  const parents: ParentGroup[] = [];
  for (const link of indi.famc) {
    const fam = tree.fams.get(link.famId);
    if (!fam) continue;
    const people = fam.partners
      .map((p) => (p.indiId ? tree.indis.get(p.indiId) : undefined))
      .filter((p): p is IndiView => !!p);
    parents.push({
      famId: fam.id,
      pedigree: link.pedigree,
      status: link.status,
      people,
    });
  }
  const spouses: Relatives['spouses'] = [];
  const children: IndiView[] = [];
  for (const famId of indi.fams) {
    const fam = tree.fams.get(famId);
    if (!fam) continue;
    const other = fam.partners.find((p) => p.indiId && p.indiId !== indi.id);
    spouses.push({
      famId,
      spouse: other?.indiId ? tree.indis.get(other.indiId) : undefined,
    });
    for (const c of fam.children) {
      const child = c.indiId ? tree.indis.get(c.indiId) : undefined;
      if (child && !children.includes(child)) children.push(child);
    }
  }
  return {parents, spouses, children};
}

// ---------------------------------------------------------------- events

function firstDate(d?: ParsedDate): CalendarDate | undefined {
  const v = d?.value;
  if (!v) return undefined;
  if (v.kind === 'exact') return v.date;
  if (v.kind === 'range' || v.kind === 'period') return v.from ?? v.to;
  return undefined;
}

/** Rough chronological key; ignores calendar differences (see TODO part E). */
function sortKey(e: EventDetail): number | undefined {
  const c = firstDate(e.sortDate ?? e.date);
  if (!c) return undefined;
  const y = c.bce ? -c.year : c.year;
  return y * 10000 + (c.monthIndex ?? 0) * 100 + (c.day ?? 0);
}

export interface CardEvent {
  event: EventDetail;
  /** Set for events that belong to a family record (marriage, divorce). */
  famId?: string;
}

/** Person events plus the events of the person's own families, in order. */
export function cardEvents(tree: LoadedTree, indi: IndiView): CardEvent[] {
  const out: CardEvent[] = indi.events.map((event) => ({event}));
  for (const famId of indi.fams) {
    const fam: FamView | undefined = tree.fams.get(famId);
    for (const event of fam?.events ?? []) {
      const key = sortKey(event);
      let at = out.length;
      if (key !== undefined) {
        const i = out.findIndex((o) => {
          const k = sortKey(o.event);
          return k !== undefined && k > key;
        });
        if (i >= 0) at = i;
      }
      out.splice(at, 0, {event, famId});
    }
  }
  return out;
}

export function isRestricted(e: {restrictions: string[]}): boolean {
  return e.restrictions.some((r) => r === 'CONFIDENTIAL' || r === 'PRIVACY');
}

// -------------------------------------------------------------- citations

export interface NumberedCitation {
  n: number;
  citation: Citation;
}

/** Citation list with stable numbers: same source + page is one entry. */
export class CitationIndex {
  private readonly list: NumberedCitation[] = [];
  private readonly keys = new Map<string, number>();

  add(c: Citation): number {
    const key = `${c.sourceId ?? ''}|${c.page ?? ''}|${c.inlineText ?? ''}`;
    let n = this.keys.get(key);
    if (n === undefined) {
      n = this.list.length + 1;
      this.keys.set(key, n);
      this.list.push({n, citation: c});
    }
    return n;
  }

  get items(): readonly NumberedCitation[] {
    return this.list;
  }
}

export function countCitations(indi: IndiView, events: EventDetail[]): number {
  const idx = new CitationIndex();
  indi.citations.forEach((c) => idx.add(c));
  events.forEach((e) => e.citations.forEach((c) => idx.add(c)));
  return idx.items.length;
}
