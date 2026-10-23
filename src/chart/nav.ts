// Keyboard navigation between the boxes of a chart, as pure functions on
// the box centres and the parent -> child links.

export interface NavBox {
  key: string;
  /** Topola node the box belongs to (a couple shares one node). */
  node: string;
  cx: number;
  cy: number;
}

/** A parent node and the box of the child it leads to. */
export interface NavEdge {
  parentNode: string;
  childKey: string;
}

export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export const isNavKey = (key: string): key is NavKey =>
  key === 'ArrowUp' ||
  key === 'ArrowDown' ||
  key === 'ArrowLeft' ||
  key === 'ArrowRight';

/** Boxes whose centres differ by less than this vertically share a row. */
export const ROW_TOLERANCE = 36;

/**
 * The box to focus after `key` from the box `from`, or undefined when there
 * is none.
 * - Left/Right: the nearest box in the same row on that side (spouse,
 *   siblings, then the neighbouring family).
 * - Up/Down: the linked box (a parent or a child) that lies above/below;
 *   among several parents the nearest one, among children the first one
 *   from the left. The fan chart is drawn upside down; that needs no
 *   special case because the choice is by position.
 */
export function navigate(
  boxes: readonly NavBox[],
  edges: readonly NavEdge[],
  from: string,
  key: NavKey,
): string | undefined {
  const here = boxes.find((b) => b.key === from);
  if (!here) return undefined;

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const sign = key === 'ArrowLeft' ? -1 : 1;
    let best: NavBox | undefined;
    for (const b of boxes) {
      const dx = (b.cx - here.cx) * sign;
      if (b === here || dx <= 0 || Math.abs(b.cy - here.cy) >= ROW_TOLERANCE) {
        continue;
      }
      if (
        !best ||
        dx < (best.cx - here.cx) * sign ||
        (dx === (best.cx - here.cx) * sign &&
          Math.abs(b.cy - here.cy) < Math.abs(best.cy - here.cy))
      ) {
        best = b;
      }
    }
    return best?.key;
  }

  const byKey = new Map(boxes.map((b) => [b.key, b]));
  const linked = new Set<NavBox>();
  for (const e of edges) {
    if (e.childKey === here.key) {
      for (const b of boxes) if (b.node === e.parentNode) linked.add(b);
    }
    if (e.parentNode === here.node) {
      const child = byKey.get(e.childKey);
      if (child) linked.add(child);
    }
  }
  const up = key === 'ArrowUp';
  const targets = [...linked].filter((b) =>
    up ? b.cy < here.cy - 1 : b.cy > here.cy + 1,
  );
  targets.sort((a, b) =>
    up
      ? Math.abs(a.cx - here.cx) - Math.abs(b.cx - here.cx) || a.cx - b.cx
      : a.cx - b.cx,
  );
  return targets[0]?.key;
}
