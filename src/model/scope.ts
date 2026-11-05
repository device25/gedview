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
import {personMeetsQuality} from './citations';

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

/** Who the chart draws, the reliability threshold applied. */
export interface ChartPeople {
  /** Blood relatives of the root within the scope. */
  keep: Set<string>;
  /** Everyone counted as drawn. */
  shown: Set<string>;
  /** Drawn although below the threshold: the root, and those who link
   *  someone shown to the root. */
  dimmed: Set<string>;
  /** The limit for the chart's data; none at «all», where it is as it was. */
  only: Set<string> | undefined;
}

/** A place on the chart, and where topola's walk goes on from it. */
interface Stop {
  key: string;
  /** The person drawn there; going on to a family's children draws nobody. */
  indi?: string;
  next: () => Stop[];
}

/** The start of the way topola's relatives chart walks the data, which is
 *  narrower than the links in it. Going down, a person brings their spouses,
 *  who go no further, and their children. Going up, a person's parents bring
 *  their parents and their other children, but no other marriages; the child
 *  they were come up from is left out of all that lies below them, adopted
 *  or not. Besides the root's, only the parents of an only spouse are climbed
 *  to. */
function chartWalk(
  tree: LoadedTree,
  settings: ChartSettings,
  keep: ReadonlySet<string>,
  drawn: ReadonlySet<string>,
  rootId: string,
): Stop {
  const {children, famc} = parentGraph(tree, settings);
  const kept = (famId: string) =>
    !!tree.fams
      .get(famId)
      ?.partners.some((p) => p.indiId && keep.has(p.indiId));
  const couple = (famId: string) =>
    (['HUSB', 'WIFE'] as const).flatMap((role) => {
      const id = tree.fams
        .get(famId)
        ?.partners.find((p) => p.role === role)?.indiId;
      return id && drawn.has(id) ? [id] : [];
    });
  const kids = (famId: string) =>
    (children.get(famId) ?? []).filter((id) => drawn.has(id));
  const marriages = (id: string) => tree.indis.get(id)!.fams.filter(kept);

  const down = (id: string, without?: string): Stop => ({
    key: `down:${id}:${without}`,
    indi: id,
    next: () =>
      marriages(id).flatMap((famId) => [
        ...couple(famId)
          .filter((p) => p !== id)
          .map((p) => ({key: `spouse:${p}`, indi: p, next: () => []})),
        ...kids(famId)
          .filter((kid) => kid !== without)
          .map((kid) => down(kid, without)),
      ]),
  });
  const up = (child: string): Stop[] => {
    const famId = famc.get(child);
    if (famId === undefined || !kept(famId)) return [];
    const others: Stop = {
      key: `others:${famId}:${child}`,
      next: () =>
        kids(famId)
          .filter((id) => id !== child)
          .map((id) => down(id, child)),
    };
    return couple(famId).map((parent) => ({
      key: `up:${famId}:${child}:${parent}`,
      indi: parent,
      next: () => [...up(parent), others],
    }));
  };
  const onlySpouse = (id: string): string[] => {
    const fams = marriages(id);
    return fams.length === 1 ? couple(fams[0]!).filter((p) => p !== id) : [];
  };
  const root = down(rootId);
  return {
    ...root,
    next: () => [
      ...root.next(),
      ...up(rootId),
      ...onlySpouse(rootId).map((id) => ({
        key: `root-spouse:${id}`,
        indi: id,
        next: () => up(id),
      })),
    ],
  };
}

/** Applies the threshold to the people of a scope: those below it go, unless
 *  a branch would come apart without them. Each person is reached along the
 *  chart's walk by the way with the fewest people below the threshold, so
 *  nobody stays who isn't needed. */
export function chartPeople(
  tree: LoadedTree,
  settings: ChartSettings,
  scope: ChartScope,
): ChartPeople {
  const keep = scopePeople(tree, settings, scope);
  const shown = scopeDrawn(tree, keep);
  const min = settings.minSourceQuality;
  if (min === 'all') return {keep, shown, dimmed: new Set(), only: undefined};
  if (shown.size === 0) return {keep, shown, dimmed: new Set(), only: shown};

  const passing = new Map<string, boolean>();
  const passes = (id: string) => {
    let yes = passing.get(id);
    if (yes === undefined) {
      const indi = tree.indis.get(id);
      yes = !!indi && personMeetsQuality(indi, min);
      passing.set(id, yes);
    }
    return yes;
  };

  // Cheapest ways first: a stop with someone below the threshold costs one.
  const cameFrom = new Map<string, Stop | undefined>();
  const firstStop = new Map<string, Stop>();
  const start = chartWalk(tree, settings, keep, shown, scope.rootId);
  let layer: Array<[Stop, Stop | undefined]> = [[start, undefined]];
  while (layer.length > 0) {
    const dearer: typeof layer = [];
    for (let i = 0; i < layer.length; i++) {
      const [stop, from] = layer[i]!;
      if (cameFrom.has(stop.key)) continue;
      cameFrom.set(stop.key, from);
      if (stop.indi && !firstStop.has(stop.indi))
        firstStop.set(stop.indi, stop);
      for (const next of stop.next()) {
        if (cameFrom.has(next.key)) continue;
        const free = next.indi === undefined || passes(next.indi);
        (free ? layer : dearer).push([next, stop]);
      }
    }
    layer = dearer;
  }

  const kept = new Set([scope.rootId]);
  const walked = new Set<string>();
  for (const [id, first] of firstStop) {
    if (!passes(id)) continue;
    let at: Stop | undefined = first;
    while (at && !walked.has(at.key)) {
      walked.add(at.key);
      if (at.indi) kept.add(at.indi);
      at = cameFrom.get(at.key);
    }
  }
  const dimmed = new Set([...kept].filter((id) => !passes(id)));
  return {keep, shown: kept, dimmed, only: kept};
}
