// One row per generation. Topola's relatives chart stacks each ancestor's
// block (their other children and those children's descendants) above the
// next generation, so an uncle stands higher than the father. Here every
// generation gets one row and the blocks are packed side by side instead:
// the root's brothers and sisters beside the root, the father's side of the
// family to the left, the mother's to the right, each branch moved in as
// close as the rows it spans allow.

import {H_SPACING, V_SPACING, type RelativesChart} from 'topola';

interface LaidOut {
  id?: string;
  x: number;
  y: number;
  parent?: LaidOut | null;
  children?: LaidOut[];
  data: {
    width?: number;
    height?: number;
    generation?: number;
    indi?: {id?: string; width?: number};
    spouse?: {width?: number};
    indiParentNodeId?: string;
    spouseParentNodeId?: string;
  };
}

type Side = 'left' | 'right' | 'middle';

const GAP = H_SPACING * 2;
const gen = (n: LaidOut) => n.data.generation ?? 0;
const half = (n: LaidOut) => (n.data.width ?? 0) / 2;
const couple = (n: LaidOut) => !!n.data.indi && !!n.data.spouse;
/** Centre of the blood person's box, of the spouse's, and the point
 *  between them where the family's links start. */
const indiX = (n: LaidOut) =>
  couple(n) ? n.x - half(n) + (n.data.indi!.width ?? 0) / 2 : n.x;
const spouseX = (n: LaidOut) =>
  couple(n) ? n.x + half(n) - (n.data.spouse!.width ?? 0) / 2 : n.x;
const unionX = (n: LaidOut) =>
  couple(n) ? n.x - half(n) + (n.data.indi!.width ?? 0) : n.x;

function subtree(n: LaidOut): LaidOut[] {
  const out: LaidOut[] = [];
  const walk = (m: LaidOut) => {
    out.push(m);
    m.children?.forEach(walk);
  };
  walk(n);
  return out;
}

/**
 * @param older whether a brother or sister of the root was born before
 *   the root (they go to the root's left); undefined = not known.
 */
export function alignRows(
  nodes: LaidOut[],
  older: (indiId: string) => boolean | undefined = () => undefined,
): void {
  // ------------------------------------------------------------ rows
  const byGen = new Map<number, LaidOut[]>();
  for (const n of nodes) byGen.set(gen(n), [...(byGen.get(gen(n)) ?? []), n]);
  const gens = [...byGen.keys()].sort((a, b) => a - b);
  const height = new Map(
    gens.map((g) => [
      g,
      Math.max(...byGen.get(g)!.map((n) => n.data.height ?? 0)),
    ]),
  );
  const center = new Map<number, number>([[0, 0]]);
  for (let g = 1; g <= gens[gens.length - 1]!; g++) {
    center.set(
      g,
      center.get(g - 1)! +
        ((height.get(g - 1) ?? 0) + (height.get(g) ?? 0)) / 2 +
        V_SPACING,
    );
  }
  for (let g = -1; g >= gens[0]!; g--) {
    center.set(
      g,
      center.get(g + 1)! -
        ((height.get(g + 1) ?? 0) + (height.get(g) ?? 0)) / 2 -
        V_SPACING,
    );
  }
  for (const n of nodes) {
    n.data.height = height.get(gen(n));
    n.y = center.get(gen(n))!;
  }

  // ------------------------------------------------------------ blocks
  // Ancestors hang from the person below them (topola links them that
  // way); the root's own block is everything else reachable downward.
  const all = new Set(nodes);
  const isAncestor = (n: LaidOut) =>
    !!n.parent && all.has(n.parent) && gen(n.parent) > gen(n);
  const core = new Set<LaidOut>();
  for (const n of nodes) {
    if (!n.parent || !all.has(n.parent)) subtree(n).forEach((m) => core.add(m));
  }

  // The outermost box edge in every row so far.
  const leftEdge = new Map<number, number>();
  const rightEdge = new Map<number, number>();
  const placed = new Set<LaidOut>();
  const mark = (n: LaidOut) => {
    placed.add(n);
    const g = gen(n);
    leftEdge.set(g, Math.min(leftEdge.get(g) ?? Infinity, n.x - half(n)));
    rightEdge.set(g, Math.max(rightEdge.get(g) ?? -Infinity, n.x + half(n)));
  };
  core.forEach(mark);

  /** Moves a branch to the given side of everything placed, row by row. */
  const pack = (root: LaidOut, side: 'left' | 'right') => {
    const branch = subtree(root);
    let shift = side === 'left' ? Infinity : -Infinity;
    for (const m of branch) {
      const g = gen(m);
      if (side === 'left' && leftEdge.has(g)) {
        shift = Math.min(shift, leftEdge.get(g)! - GAP - (m.x + half(m)));
      }
      if (side === 'right' && rightEdge.has(g)) {
        shift = Math.max(shift, rightEdge.get(g)! + GAP - (m.x - half(m)));
      }
    }
    if (!Number.isFinite(shift)) shift = 0;
    for (const m of branch) {
      m.x += shift;
      mark(m);
    }
  };

  /** Moves a group of boxes by up to `delta`, stopping at the first box
   *  of anyone else in any of their rows. */
  const shiftWithin = (group: LaidOut[], delta: number) => {
    if (Math.abs(delta) < 0.5) return;
    const own = new Set(group);
    let free = Math.abs(delta);
    for (const m of group) {
      for (const o of placed) {
        if (own.has(o) || gen(o) !== gen(m)) continue;
        const gap =
          delta > 0
            ? o.x - half(o) - (m.x + half(m)) - GAP
            : m.x - half(m) - (o.x + half(o)) - GAP;
        // Only boxes on the side it moves to stand in the way.
        if ((delta > 0 ? o.x > m.x : o.x < m.x) && gap < free)
          free = Math.max(0, gap);
      }
    }
    const step = Math.sign(delta) * free;
    for (const m of group) m.x += step;
  };

  const ancestors = nodes.filter(isAncestor);
  // The ancestor tree: each couple's parents' couples, the father's first.
  const above = new Map<LaidOut, LaidOut[]>();
  for (const a of ancestors) {
    const list = above.get(a.parent!) ?? [];
    list.push(a);
    above.set(a.parent!, list);
  }
  for (const list of above.values()) {
    list.sort((p, q) => {
      const c = p.parent!;
      const rank = (a: LaidOut) =>
        c.data.indiParentNodeId === a.id
          ? 0
          : c.data.spouseParentNodeId === a.id
            ? 2
            : 1;
      return rank(p) - rank(q);
    });
  }
  const lineage = (a: LaidOut): LaidOut[] => [
    a,
    ...(above.get(a) ?? []).flatMap(lineage),
  ];

  // Room for each couple and all their ancestors, as in a pedigree, so a
  // couple can stand over their child without anyone else's line crossing.
  const room = new Map<LaidOut, number>();
  const roomOf = (a: LaidOut): number => {
    const parents = above.get(a) ?? [];
    const sum =
      parents.reduce((w, p) => w + roomOf(p), 0) +
      GAP * Math.max(0, parents.length - 1);
    const r = Math.max(a.data.width ?? 0, sum);
    room.set(a, r);
    return r;
  };
  /** Puts the parents of `c` over them, inside the room kept for `c`
   *  (none for the root's own block). */
  const placeAbove = (c: LaidOut, slot?: [number, number]) => {
    const parents = above.get(c) ?? [];
    if (!parents.length) return;
    parents.forEach(roomOf);
    const total =
      parents.reduce((w, p) => w + room.get(p)!, 0) +
      GAP * (parents.length - 1);
    const both =
      parents.some((a) => c.data.indiParentNodeId === a.id) &&
      parents.some((a) => c.data.spouseParentNodeId === a.id);
    // Over the one of the couple whose parents these are, or the middle.
    const anchor = both
      ? c.x
      : parents.some((a) => c.data.spouseParentNodeId === a.id)
        ? spouseX(c)
        : indiX(c);
    let left = anchor - total / 2;
    if (slot) left = Math.min(Math.max(left, slot[0]), slot[1] - total);
    for (const a of parents) {
      const r = room.get(a)!;
      a.x = left + r / 2;
      placeAbove(a, [left, left + r]);
      left += r + GAP;
    }
  };
  [...core].forEach((c) => placeAbove(c));

  const side = new Map<LaidOut, Side>();
  for (let g = -1; g >= (gens[0] ?? 0); g--) {
    const row = ancestors.filter((a) => gen(a) === g);
    if (!row.length) continue;
    for (const a of row) {
      const c = a.parent!;
      const s = side.get(c);
      side.set(
        a,
        core.has(c)
          ? 'middle'
          : s === 'middle'
            ? c.data.spouseParentNodeId === a.id
              ? 'right'
              : 'left'
            : s!,
      );
    }
  }
  // Rows above the root hold only ancestors until their brothers and
  // sisters are packed in, generation by generation, from the root up.
  ancestors.forEach(mark);

  for (let g = -1; g >= (gens[0] ?? 0); g--) {
    const row = ancestors.filter((a) => gen(a) === g);
    if (!row.length) continue;

    // Their other children, nearest the centre first.
    for (const a of [...row].sort((p, q) => Math.abs(p.x) - Math.abs(q.x))) {
      const kids = a.children ?? [];
      const s = side.get(a)!;
      if (s === 'middle') {
        const before = kids.filter(
          (k) => older(k.data.indi?.id ?? '') === true,
        );
        const after = kids.filter((k) => !before.includes(k));
        [...before].reverse().forEach((k) => pack(k, 'left'));
        after.forEach((k) => pack(k, 'right'));
      } else if (s === 'left') {
        [...kids].reverse().forEach((k) => pack(k, 'left'));
      } else {
        kids.forEach((k) => pack(k, 'right'));
      }
    }

    // Then each couple, with their ancestors, toward the middle of all
    // their children, as far as the rows above allow.
    for (const a of row) {
      if (!a.children?.length) continue;
      const c = a.parent!;
      const xs = [
        c.data.spouseParentNodeId === a.id ? spouseX(c) : indiX(c),
        ...a.children.map(indiX),
      ];
      const delta = (Math.min(...xs) + Math.max(...xs)) / 2 - unionX(a);
      shiftWithin(lineage(a), delta);
    }
    leftEdge.clear();
    rightEdge.clear();
    [...placed].forEach(mark);
  }
}

/** Makes a relatives chart lay out its nodes in rows before it draws them.
 *  Topola has no hook for this; its layout and drawing meet in
 *  `util.renderChart`. */
export function drawInRows(
  chart: RelativesChart<never, never>,
  older: (indiId: string) => boolean | undefined,
): void {
  const util = (
    chart as unknown as {util: {renderChart: (n: never[]) => unknown}}
  ).util;
  const draw = util.renderChart.bind(util);
  util.renderChart = (nodes) => {
    alignRows(nodes, older);
    return draw(nodes);
  };
}
