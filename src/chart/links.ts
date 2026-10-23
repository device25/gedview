// Which child link a topola path draws, and how to style it. Pure functions:
// the DOM is never consulted, only the node data topola binds to each path.

import type {
  ChartSettings,
  ChartView,
  ChildLinkStatus,
  LoadedTree,
} from '../gedcom/types';

/** The part of a laid-out topola node that link logic needs. */
export interface LinkNode {
  id: string;
  /** Position of the node centre (a point node of topola's layout). */
  y?: number;
  data: {
    generation: number;
    indi?: {id: string};
    spouse?: {id: string};
    family?: {id: string};
    spouseParentNodeId?: string;
    additionalMarriage?: boolean;
  };
  parent?: LinkNode | null;
}

export interface ChildLink {
  /** The node of the parents (it carries the family). */
  parentNode: LinkNode;
  /** The node that contains the child. */
  childNode: LinkNode;
  famId: string;
  childId: string;
  /** Which box of `childNode` is the child. */
  childRole: 'indi' | 'spouse';
}

/**
 * The child link drawn by the path bound to `d` (a node and its hierarchy
 * parent). Topola decides the direction by the generation number; the fan
 * chart is laid out upside down, so there the hierarchy child is always the
 * genealogical child. Marriage links between spouses have no child.
 */
export function childLinkOf(
  d: LinkNode,
  view: ChartView,
): ChildLink | undefined {
  const other = d.parent;
  if (!other || d.data.additionalMarriage) return undefined;
  const dIsChild =
    view === 'fancy' ? true : d.data.generation > other.data.generation;
  const childNode = dIsChild ? d : other;
  const parentNode = dIsChild ? other : d;
  const famId = parentNode.data.family?.id;
  if (!famId) return undefined;
  // A node holds a person and a spouse; the spouse is the child when the
  // spouse's own parents are the other end of this link.
  const childRole =
    childNode.data.spouseParentNodeId === parentNode.id ? 'spouse' : 'indi';
  const childId = childNode.data[childRole]?.id;
  if (!childId) return undefined;
  return {parentNode, childNode, famId, childId, childRole};
}

export type LinkLook = 'solid' | 'dashed' | 'dotted' | 'hidden';

/** How a link with this status is drawn under the given settings. */
export function linkLook(
  status: ChildLinkStatus | undefined,
  settings: Pick<ChartSettings, 'dashChallenged' | 'disproven'>,
): LinkLook {
  if (status === 'CHALLENGED')
    return settings.dashChallenged ? 'dashed' : 'solid';
  if (status === 'DISPROVEN') {
    return settings.disproven === 'dotted' ? 'dotted' : 'hidden';
  }
  return 'solid';
}

export interface LinkInfo {
  look: LinkLook;
  status?: ChildLinkStatus;
  phrase?: string;
}

/** Style and status of the link of `famId` to `childId`. */
export function linkInfo(
  tree: Pick<LoadedTree, 'childLinkStatus'>,
  settings: Pick<ChartSettings, 'dashChallenged' | 'disproven'>,
  famId: string,
  childId: string,
): LinkInfo {
  const entry = tree.childLinkStatus.get(`${famId}|${childId}`);
  return {
    look: linkLook(entry?.status, settings),
    status: entry?.status,
    phrase: entry?.phrase,
  };
}
