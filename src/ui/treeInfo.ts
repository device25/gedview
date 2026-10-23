import type {
  CalendarDate,
  ChildFamilyLink,
  ChildLinkStatus,
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
  pedigreePhrase?: string;
  status?: ChildLinkStatus;
  statusPhrase?: string;
  people: IndiView[];
  /** Partners written as @VOID@ with a phrase (no record). */
  voids: string[];
}

export interface ChildEntry {
  indi: IndiView;
  /** The child's own FAMC link to this family, if present. */
  link?: ChildFamilyLink;
}

export interface SpouseGroup {
  famId: string;
  spouse?: IndiView;
  /** Phrase of a spouse without a record. */
  phrase?: string;
  children: ChildEntry[];
  voidChildren: string[];
}

export interface Relatives {
  parents: ParentGroup[];
  spouses: SpouseGroup[];
  /** All children over all families, each once (floating card). */
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
      pedigreePhrase: link.pedigreePhrase,
      status: link.status,
      statusPhrase: link.statusPhrase,
      people,
      voids: fam.partners.flatMap((p) =>
        !p.indiId && p.phrase ? [p.phrase] : [],
      ),
    });
  }
  const spouses: SpouseGroup[] = [];
  const children: IndiView[] = [];
  for (const famId of indi.fams) {
    const fam = tree.fams.get(famId);
    if (!fam) continue;
    const other = fam.partners.find((p) => p.indiId !== indi.id && p.indiId);
    const voidSpouse = fam.partners.find((p) => !p.indiId && p.phrase);
    const group: SpouseGroup = {
      famId,
      spouse: other?.indiId ? tree.indis.get(other.indiId) : undefined,
      phrase: voidSpouse?.phrase,
      children: [],
      voidChildren: [],
    };
    for (const c of fam.children) {
      const child = c.indiId ? tree.indis.get(c.indiId) : undefined;
      if (!child) {
        if (c.phrase) group.voidChildren.push(c.phrase);
        continue;
      }
      group.children.push({
        indi: child,
        link: child.famc.find((l) => l.famId === famId),
      });
      if (!children.includes(child)) children.push(child);
    }
    spouses.push(group);
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

/** RESN values that hide details when "hide restricted" is on. */
export const HIDING_RESN = ['CONFIDENTIAL', 'PRIVACY'] as const;

export function isRestricted(e: {restrictions?: readonly string[]}): boolean {
  return !!e.restrictions?.some((r) =>
    (HIDING_RESN as readonly string[]).includes(r),
  );
}

/** Splits items by RESN; nothing is hidden unless `hide` is set. */
export function splitByResn<T>(
  items: readonly T[],
  resn: (item: T) => {restrictions?: readonly string[]},
  hide: boolean,
): {visible: T[]; hidden: T[]} {
  if (!hide) return {visible: [...items], hidden: []};
  const visible: T[] = [];
  const hidden: T[] = [];
  for (const item of items)
    (isRestricted(resn(item)) ? hidden : visible).push(item);
  return {visible, hidden};
}

/** Distinct hiding RESN values found on the given records, in a fixed order. */
export function hidingMarks(
  records: ReadonlyArray<{restrictions?: readonly string[]}>,
): string[] {
  return HIDING_RESN.filter((m) =>
    records.some((r) => r.restrictions?.includes(m)),
  );
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

  /** Idempotent: the same citation always gets the same number. */
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

export function countCitations(
  indi: IndiView,
  events: Array<Pick<EventDetail, 'citations'>>,
): number {
  const idx = new CitationIndex();
  indi.citations.forEach((c) => idx.add(c));
  events.forEach((e) => e.citations.forEach((c) => idx.add(c)));
  return idx.items.length;
}
