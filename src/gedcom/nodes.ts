// Small helpers for reading the raw GedcomNode tree.

import type {GedcomNode} from './types';
import {VOID_POINTER} from './types';

/** First direct child with the tag. */
export function child(node: GedcomNode, tag: string): GedcomNode | undefined {
  for (const c of node.children) if (c.tag === tag) return c;
  return undefined;
}

/** All direct children with the tag, in file order. */
export function children(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.tag === tag);
}

/** `value` of the first child with the tag (pointers give their id). */
export function childValue(node: GedcomNode, tag: string): string | undefined {
  return child(node, tag)?.value;
}

/** Target id of a pointer node; undefined for @VOID@ and for non-pointers. */
export function pointerId(node: GedcomNode | undefined): string | undefined {
  if (!node?.pointer || node.value === undefined) return undefined;
  return node.value === VOID_POINTER ? undefined : node.value;
}

/** True for `@VOID@`. */
export function isVoid(node: GedcomNode): boolean {
  return node.pointer === true && node.value === VOID_POINTER;
}

/** Visits `node` and all descendants, parents before children, without
 *  recursion. */
export function walk(
  node: GedcomNode,
  visit: (n: GedcomNode, parent: GedcomNode | undefined) => void,
): void {
  const stack: Array<[GedcomNode, GedcomNode | undefined]> = [
    [node, undefined],
  ];
  while (stack.length > 0) {
    const [n, parent] = stack.pop()!;
    visit(n, parent);
    for (let i = n.children.length - 1; i >= 0; i--) {
      stack.push([n.children[i]!, n]);
    }
  }
}

/** Splits a List payload (comma with any spaces around it). Empty items are
 *  kept: ", Oneida, Idaho" has an empty first item. */
export function splitList(value: string): string[] {
  return value.split(',').map((s) => s.trim());
}
