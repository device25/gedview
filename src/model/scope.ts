// Who the chart shows: the people related to one person (the root) up to a
// level of kinship, within a number of generations up and down.
//
// Levels follow the nearest common ancestor, not the kinship word:
// - direct:   the root's ancestors and descendants;
// - siblings: and the descendants of the parents (siblings, nephews), and
//             the siblings of every ancestor (without their descendants);
// - cousins1: and the descendants of the grandparents;
// - cousins2: and the descendants of the great-grandparents;
// - all:      every ancestor's descendants, with no generation limit.
// Spouses are not part of the set; the chart data adds them.

import type {ChartSettings, LoadedTree} from '../gedcom/types';
import {parentGraph} from './chart';

export type BreadthLevel =
  'direct' | 'siblings' | 'cousins1' | 'cousins2' | 'all';

export const LEVELS: readonly BreadthLevel[] = [
  'direct',
  'siblings',
  'cousins1',
  'cousins2',
  'all',
];

export const isLevel = (v: unknown): v is BreadthLevel =>
  typeof v === 'string' && (LEVELS as readonly string[]).includes(v);

/** The common ancestor of a level is this many generations up, so «вверх»
 *  can't go below it. */
export const MIN_UP: Record<BreadthLevel, number> = {
  direct: 1,
  siblings: 1,
  cousins1: 2,
  cousins2: 3,
  all: 1,
};

export const GENERATIONS_MAX = 12;

export interface ChartScope {
  /** The person the chart counts from (the точка отсчёта). */
  rootId: string;
  level: BreadthLevel;
  /** Generations above the root (≥ MIN_UP of the level). */
  up: number;
  /** Generations below the root's generation, for every line. */
  down: number;
}

/** «Вверх» raised to what the level needs. */
export const effectiveUp = (scope: Pick<ChartScope, 'level' | 'up'>) =>
  Math.max(scope.up, MIN_UP[scope.level]);

/** Blood relatives of the root within the scope (the root included). */
export function scopePeople(
  tree: LoadedTree,
  settings: ChartSettings,
  scope: ChartScope,
): Set<string> {
  const out = new Set<string>();
  if (!tree.indis.has(scope.rootId)) return out;
  const {children, famc} = parentGraph(tree, settings);
  const all = scope.level === 'all';
  const up = all ? Infinity : effectiveUp(scope);
  const down = all ? Infinity : scope.down;
  const parentsOf = (id: string) => {
    const famId = famc.get(id);
    const fam = famId ? tree.fams.get(famId) : undefined;
    return fam ? fam.partners.flatMap((p) => (p.indiId ? [p.indiId] : [])) : [];
  };
  const kidsOf = (id: string) => {
    const indi = tree.indis.get(id);
    return indi ? indi.fams.flatMap((f) => children.get(f) ?? []) : [];
  };
  /** Adds `id` (at generation `gen`) and its descendants down to `down`. */
  const descend = (id: string, gen: number) => {
    const seen = new Set<string>();
    const stack: Array<[string, number]> = [[id, gen]];
    while (stack.length > 0) {
      const [cur, g] = stack.pop()!;
      if (g > down || seen.has(cur)) continue;
      seen.add(cur);
      out.add(cur);
      for (const kid of kidsOf(cur)) stack.push([kid, g + 1]);
    }
  };

  // Ancestors with their depth (the root is 0), breadth-first.
  const depth = new Map<string, number>([[scope.rootId, 0]]);
  const queue = [scope.rootId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const d = depth.get(id)!;
    if (d >= up) continue;
    for (const parent of parentsOf(id)) {
      if (depth.has(parent)) continue;
      depth.set(parent, d + 1);
      queue.push(parent);
    }
  }
  for (const id of depth.keys()) out.add(id);
  descend(scope.rootId, 0);
  if (scope.level === 'direct') return out;

  // The common ancestors whose whole descent is shown.
  const reach = {siblings: 1, cousins1: 2, cousins2: 3, all: Infinity}[
    scope.level
  ];
  for (const [id, d] of depth) {
    if (d >= 1 && d <= reach) {
      for (const kid of kidsOf(id)) descend(kid, -d + 1);
    } else if (d >= 2) {
      // Siblings of the ancestor one generation below: the children only.
      for (const kid of kidsOf(id)) if (-d + 1 <= down) out.add(kid);
    }
  }
  return out;
}

/** People drawn on the chart for a scope: the blood relatives and their
 *  spouses (everyone the chart data keeps). */
export function scopeDrawn(
  tree: LoadedTree,
  people: ReadonlySet<string>,
): Set<string> {
  const drawn = new Set(people);
  for (const fam of tree.fams.values()) {
    if (!fam.partners.some((p) => p.indiId && people.has(p.indiId))) continue;
    for (const p of fam.partners) if (p.indiId) drawn.add(p.indiId);
  }
  return drawn;
}

export const scopeCount = (tree: LoadedTree, people: ReadonlySet<string>) =>
  scopeDrawn(tree, people).size;
