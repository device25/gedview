// Figures for «Сводка»: the known ancestors of one person, sources and their
// reliability, births by decade, frequent surnames.

import type {ChartSettings, LoadedTree} from '../gedcom/types';
import {yearOf} from './bounds';
import {parentGraph} from './chart';
import {eventCitations, personCitations} from './citations';

/** One ancestor slot in Ahnentafel order (1 = father, 2 = mother, then the
 *  father's parents…), relative to one generation. */
export interface AncestorSlot {
  /** Index within its generation, 0-based, left to right. */
  index: number;
  id?: string;
  /** The link from the child below to this parent is CHALLENGED. */
  disputed: boolean;
}

export interface AncestorGrid {
  /** Generations 1 (parents) to `cells`, each 2^g slots. */
  generations: AncestorSlot[][];
  /** For the generations after the cells: per grandparent line (4 lines),
   *  how many ancestors are known in each of those generations. */
  lines: Array<{grandparent?: string; known: number[]; of: number[]}>;
}

/**
 * Ancestors of `rootId`: slots up to generation `cells`, and per line of the
 * four grandparents the counts in generations `cells + 1` to `max`.
 */
export function ancestorGrid(
  tree: LoadedTree,
  settings: ChartSettings,
  rootId: string,
  cells = 4,
  max = 7,
): AncestorGrid {
  const {famc} = parentGraph(tree, settings);
  const parents = (
    id?: string,
  ): [string | undefined, string | undefined, boolean, boolean] => {
    if (!id) return [undefined, undefined, false, false];
    const famId = famc.get(id);
    const fam = famId ? tree.fams.get(famId) : undefined;
    if (!fam) return [undefined, undefined, false, false];
    const pick = (role: 'HUSB' | 'WIFE', sex: 'M' | 'F') =>
      fam.partners.find(
        (p) => p.indiId && tree.indis.get(p.indiId)?.sex === sex,
      )?.indiId ?? fam.partners.find((p) => p.role === role)?.indiId;
    const disputed =
      tree.childLinkStatus.get(`${fam.id}|${id}`)?.status === 'CHALLENGED';
    return [pick('HUSB', 'M'), pick('WIFE', 'F'), disputed, disputed];
  };
  const generations: AncestorSlot[][] = [];
  let row: Array<string | undefined> = [rootId];
  const all: Array<Array<string | undefined>> = [];
  for (let g = 1; g <= max; g++) {
    const next: Array<string | undefined> = [];
    const slots: AncestorSlot[] = [];
    row.forEach((child) => {
      const [father, mother, df, dm] = parents(child);
      next.push(father, mother);
      slots.push(
        {index: slots.length, id: father, disputed: !!father && df},
        {index: slots.length + 1, id: mother, disputed: !!mother && dm},
      );
    });
    all.push(next);
    if (g <= cells) generations.push(slots);
    row = next;
  }
  // Generation 2 holds the four grandparents; each owns a quarter of every
  // generation above it.
  const lines = [0, 1, 2, 3].map((q) => {
    const known: number[] = [];
    const of: number[] = [];
    for (let g = cells + 1; g <= max; g++) {
      const gen = all[g - 1]!;
      const size = gen.length / 4;
      const part = gen.slice(q * size, (q + 1) * size);
      known.push(part.filter(Boolean).length);
      of.push(size);
    }
    return {grandparent: all[1]?.[q], known, of};
  });
  return {generations, lines};
}

export interface SummaryFigures {
  people: number;
  families: number;
  /** First and last birth year in the tree. */
  births?: [number, number];
  /** People with at least one citation (on the person or an event). */
  sourced: number;
  /** Per century of birth: people with a citation, of people born then. */
  byCentury: Array<{century: number; sourced: number; of: number}>;
  /** Citations by QUAY 3, 2, 1, 0 and without one. */
  quality: [number, number, number, number, number];
  /** Births per decade, from the first decade to the last. */
  decades: Array<{decade: number; count: number}>;
  /** Births counted (a year is known). */
  dated: number;
  /** The most frequent surnames, male and female forms together. */
  surnames: Array<{name: string; count: number}>;
}

/** Folds female and male surname forms together (Соколова → Соколов). */
export function surnameKey(name: string): string {
  return name.replace(/(ов|ев|ёв|ин|ын)а$/u, '$1').replace(/ая$/u, 'ий');
}

export function summaryFigures(tree: LoadedTree): SummaryFigures {
  const years: number[] = [];
  const centuries = new Map<number, {sourced: number; of: number}>();
  const quality: SummaryFigures['quality'] = [0, 0, 0, 0, 0];
  const surnames = new Map<
    string,
    {count: number; forms: Map<string, number>}
  >();
  let sourced = 0;
  const countCitations = (cs: Array<{quality?: number}>) => {
    for (const c of cs) quality[c.quality === undefined ? 4 : 3 - c.quality]!++;
  };
  for (const indi of tree.indis.values()) {
    const cited = personCitations(indi, indi.events);
    const has = cited.length > 0;
    if (has) sourced++;
    countCitations(cited);
    const birth = indi.events.find(
      (e) => ['BIRT', 'CHR', 'BAPM'].includes(e.tag) && e.date,
    );
    const year = yearOf(birth?.date);
    if (year !== undefined) {
      years.push(year);
      const c = Math.floor((year - 1) / 100) + 1;
      const entry = centuries.get(c) ?? {sourced: 0, of: 0};
      entry.of++;
      if (has) entry.sourced++;
      centuries.set(c, entry);
    }
    const surname = indi.names[0]?.surname?.trim();
    if (surname) {
      const key = surnameKey(surname);
      const entry = surnames.get(key) ?? {count: 0, forms: new Map()};
      entry.count++;
      entry.forms.set(surname, (entry.forms.get(surname) ?? 0) + 1);
      surnames.set(key, entry);
    }
  }
  for (const fam of tree.fams.values()) {
    for (const e of fam.events) countCitations(eventCitations(e));
    countCitations(fam.citations);
    for (const n of fam.notes) countCitations(n.citations);
  }
  const decades: SummaryFigures['decades'] = [];
  if (years.length) {
    const lo = Math.floor(Math.min(...years) / 10) * 10;
    const hi = Math.floor(Math.max(...years) / 10) * 10;
    for (let d = lo; d <= hi; d += 10) {
      decades.push({
        decade: d,
        count: years.filter((y) => y >= d && y < d + 10).length,
      });
    }
  }
  return {
    people: tree.indis.size,
    families: tree.fams.size,
    births: years.length ? [Math.min(...years), Math.max(...years)] : undefined,
    sourced,
    byCentury: [...centuries]
      .sort(([a], [b]) => a - b)
      .map(([century, v]) => ({century, ...v})),
    quality,
    decades,
    dated: years.length,
    surnames: [...surnames.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(({count, forms}) => {
        const written = [...forms].sort((a, b) => b[1] - a[1])[0]![0];
        // The male form when only the female one is written («Крылова» →
        // «Крылов»); other names as written most often.
        const name = /(ов|ев|ёв|ин|ын)а$/u.test(written)
          ? surnameKey(written)
          : written;
        return {name, count};
      }),
  };
}
