import {describe, expect, it} from 'vitest';
import {navigate, type NavBox, type NavEdge} from './nav';

// Grandparents (G1 | G2) above parents (P1 | P2) above children (C1, C2),
// plus a second couple (G3 | G4) to the right of the grandparents:
//
//   G1 G2   G3 G4        y = 0
//   P1 P2                y = 100   (P1 is the child of G1+G2)
//   C1 C2                y = 200   (children of P1+P2)
const box = (key: string, node: string, cx: number, cy: number): NavBox => ({
  key,
  node,
  cx,
  cy,
});
const boxes: NavBox[] = [
  box('g1', 'FG', 0, 0),
  box('g2', 'FG', 250, 0),
  box('g3', 'FH', 700, 0),
  box('g4', 'FH', 950, 0),
  box('p1', 'FP', 100, 100),
  box('p2', 'FP', 350, 100),
  box('c1', 'C1', 0, 200),
  box('c2', 'C2', 300, 200),
];
const edges: NavEdge[] = [
  {parentNode: 'FG', childKey: 'p1'},
  {parentNode: 'FP', childKey: 'c1'},
  {parentNode: 'FP', childKey: 'c2'},
];
const go = (from: string, key: Parameters<typeof navigate>[3]) =>
  navigate(boxes, edges, from, key);

describe('navigate', () => {
  it('Up goes to the nearest parent, Down to the first child', () => {
    expect(go('p1', 'ArrowUp')).toBe('g1'); // 100 is nearer to 0 than to 250
    expect(go('c1', 'ArrowUp')).toBe('p1');
    expect(go('c2', 'ArrowUp')).toBe('p2');
    expect(go('p1', 'ArrowDown')).toBe('c1');
    expect(go('p2', 'ArrowDown')).toBe('c1'); // the couple shares its children
    expect(go('g2', 'ArrowDown')).toBe('p1');
  });

  it('Left and Right step to the spouse, siblings and the next family in the row', () => {
    expect(go('p1', 'ArrowRight')).toBe('p2');
    expect(go('p2', 'ArrowLeft')).toBe('p1');
    expect(go('c1', 'ArrowRight')).toBe('c2');
    expect(go('g2', 'ArrowRight')).toBe('g3');
    expect(go('g3', 'ArrowLeft')).toBe('g2');
  });

  it('stays put at the ends', () => {
    expect(go('c1', 'ArrowLeft')).toBeUndefined();
    expect(go('g4', 'ArrowRight')).toBeUndefined();
    expect(go('c1', 'ArrowDown')).toBeUndefined();
    expect(go('g1', 'ArrowUp')).toBeUndefined();
    expect(go('g3', 'ArrowDown')).toBeUndefined();
    expect(go('missing', 'ArrowUp')).toBeUndefined();
  });

  it('Left and Right ignore other rows', () => {
    expect(go('p2', 'ArrowRight')).toBeUndefined();
  });

  it('works on an upside-down chart: Up goes to what is drawn above', () => {
    // The fan chart draws children above their parents.
    const flipped = boxes.map((b) => ({...b, cy: -b.cy}));
    expect(navigate(flipped, edges, 'p1', 'ArrowUp')).toBe('c1');
    expect(navigate(flipped, edges, 'p1', 'ArrowDown')).toBe('g1');
  });
});
