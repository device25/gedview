import type {LoadedTree} from '../gedcom/types';
import {displayName, lifeSpan, type DateFormatOptions} from './format';

export interface PersonEntry {
  id: string;
  name: string;
  life: string;
  /** Normalised text the query is matched against. */
  hay: string;
}

export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е');
}

/** Index of all persons: display name, life span, other names, id. */
export function buildIndex(
  tree: LoadedTree,
  o: DateFormatOptions,
): PersonEntry[] {
  const out: PersonEntry[] = [];
  for (const indi of tree.indis.values()) {
    const name = displayName(indi);
    const life = lifeSpan(indi, o);
    const all = indi.names.flatMap((n) => [
      n.display,
      ...n.translations.map((t) => t.display),
    ]);
    out.push({
      id: indi.id,
      name,
      life,
      hay: normalize([...all, life, indi.id].join(' ')),
    });
  }
  const collator = new Intl.Collator(o.locale);
  return out.sort((a, b) => collator.compare(a.name, b.name));
}

/** Every whitespace-separated token must occur somewhere in the entry. */
export function searchPeople(
  index: PersonEntry[],
  query: string,
  limit = 50,
): PersonEntry[] {
  const tokens = normalize(query)
    .split(/[\s,]+/)
    .filter(Boolean);
  const out: PersonEntry[] = [];
  for (const e of index) {
    if (tokens.every((t) => e.hay.includes(t))) {
      out.push(e);
      if (out.length >= limit) break;
    }
  }
  return out;
}
