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
import {parentGraph, type ParentGraph} from './chart';
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
  {children, famc}: ParentGraph,
  keep: ReadonlySet<string>,
  drawn: ReadonlySet<string>,
  rootId: string,
): Stop {
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

/** The most links followed in trying to take people out of one chart: with
 *  many marriages among relatives the tries would otherwise take seconds. */
const TRYING_LIMIT = 5_000_000;

/** Takes out, one by one, those below the threshold the others can do without.
 *  First come the walk's dominators (Cooper, Harvey, Kennedy): the people every
 *  way to someone who passes leads through. They stay whoever else goes, which
 *  leaves few to try. Those nearest the root are tried first. */
function withoutNeedless(
  start: Stop,
  rootId: string,
  passes: (id: string) => boolean,
): Set<string> {
  // The walk in numbers, in post-order: the start has the highest.
  const stops: Stop[] = [];
  const nextKeys: string[][] = [];
  const number = new Map<string, number>();
  const seen = new Set([start.key]);
  const stack = [{stop: start, next: start.next(), i: 0}];
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const next = top.next[top.i++];
    if (!next) {
      number.set(top.stop.key, stops.length);
      stops.push(top.stop);
      nextKeys.push(top.next.map((n) => n.key));
      stack.pop();
    } else if (!seen.has(next.key)) {
      seen.add(next.key);
      stack.push({stop: next, next: next.next(), i: 0});
    }
  }
  const last = stops.length - 1;
  const onward = nextKeys.map((keys) => keys.map((k) => number.get(k)!));
  const backward: number[][] = stops.map(() => []);
  onward.forEach((to, n) => to.forEach((m) => backward[m]!.push(n)));

  // Each person's places on the walk.
  const people: string[] = [];
  const personNumber = new Map<string, number>();
  const personAt = stops.map((stop) => {
    if (!stop.indi) return -1;
    let n = personNumber.get(stop.indi);
    if (n === undefined) {
      n = people.length;
      personNumber.set(stop.indi, n);
      people.push(stop.indi);
    }
    return n;
  });
  const places: number[][] = people.map(() => []);
  personAt.forEach((p, n) => {
    if (p !== -1) places[p]!.push(n);
  });
  const wanted = people.flatMap((id, p) => (passes(id) ? [p] : []));

  // Dominators, then those of everyone wanted.
  const above = new Array<number>(stops.length).fill(-1);
  above[last] = last;
  const meet = (a: number, b: number) => {
    while (a !== b) {
      while (a < b) a = above[a]!;
      while (b < a) b = above[b]!;
    }
    return a;
  };
  for (let changed = true; changed;) {
    changed = false;
    for (let n = last - 1; n >= 0; n--) {
      let common = -1;
      for (const from of backward[n]!) {
        if (above[from] === -1) continue;
        common = common === -1 ? from : meet(common, from);
      }
      if (common !== above[n]) {
        above[n] = common;
        changed = true;
      }
    }
  }
  const needed = new Set<number>();
  const marked = new Set<number>();
  for (const p of wanted) {
    let n = places[p]!.reduce(meet);
    while (!marked.has(n)) {
      marked.add(n);
      if (personAt[n] !== -1) needed.add(personAt[n]!);
      n = above[n]!;
    }
  }

  // Who is reached with the people taken out so far; `enough` stops as soon as
  // everyone wanted is.
  const out = new Uint8Array(people.length);
  const stopSeen = new Int32Array(stops.length);
  const personSeen = new Int32Array(people.length);
  const isWanted = new Uint8Array(people.length);
  for (const p of wanted) isWanted[p] = 1;
  let round = 0;
  let followed = 0;
  const reach = (enough: boolean) => {
    round++;
    let missing = wanted.length;
    const todo = [last];
    stopSeen[last] = round;
    while (todo.length > 0 && !(enough && missing === 0)) {
      const n = todo.pop()!;
      const p = personAt[n]!;
      if (p !== -1 && personSeen[p] !== round) {
        personSeen[p] = round;
        if (isWanted[p]) missing--;
      }
      for (const m of onward[n]!) {
        followed++;
        if (stopSeen[m] === round) continue;
        const q = personAt[m]!;
        if (q !== -1 && out[q]) continue;
        stopSeen[m] = round;
        todo.push(m);
      }
    }
    return missing === 0;
  };

  const rootPerson = personNumber.get(rootId);
  const tried = new Uint8Array(people.length);
  for (let n = last; n >= 0 && followed < TRYING_LIMIT; n--) {
    const p = personAt[n]!;
    if (p === -1 || tried[p] || p === rootPerson) continue;
    tried[p] = 1;
    if (isWanted[p] || needed.has(p)) continue;
    out[p] = 1;
    if (!reach(true)) out[p] = 0;
  }
  reach(false);
  return new Set(people.filter((_, p) => personSeen[p] === round));
}

/** Applies the threshold to the people of a scope: those below it go, unless
 *  a branch would come apart without them. Each person who passes is reached
 *  along the chart's walk by the way with the fewest people below the
 *  threshold. Those ways together can still carry someone the others make
 *  needless, who then goes too: without any of the pale people that stay,
 *  someone who passes would be lost, unless the root's other marriages go and
 *  the chart climbs to the parents of the spouse left, which isn't counted on,
 *  or the chart is too tangled to try everyone. That doesn't make their number
 *  the smallest possible. */
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
  const graph = parentGraph(tree, settings);
  const walk = (drawn: ReadonlySet<string>) =>
    chartWalk(tree, graph, keep, drawn, scope.rootId);
  const start = walk(shown);
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

  const left = withoutNeedless(walk(kept), scope.rootId, passes);
  const dimmed = new Set([...left].filter((id) => !passes(id)));
  return {keep, shown: left, dimmed, only: left};
}
