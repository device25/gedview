// Person boxes for topola charts: white cards with a sex dot, the name and
// the life dates, drawn with theme tokens (see chart.css).

import type {HierarchyPointNode} from 'd3-hierarchy';
import {select, type Selection} from 'd3-selection';
import {
  CompositeRenderer,
  type FamDetails,
  type IndiDetails,
  type Renderer,
  type RendererOptions,
  type TreeNode,
  type TreeNodeSelection,
} from 'topola';
import type {IntlShape} from 'react-intl';
import type {ChartSettings, IndiView, LoadedTree} from '../gedcom/types';
import {displayName, lifeSpan} from '../ui/format';
import {wrapName, type Measure} from './text';

export const BOX_W = 220;
export const BOX_H = 72;
/** Space between the two boxes of a couple (and half of it around a box). */
export const COUPLE_GAP = 24;
/** Extra height under a row of boxes: room for the link and its label. */
export const FAMILY_H = 32;

const PAD_LEFT = 14;
const NAME_X = 30; // after the dot
const NAME_RIGHT = 14;
const NAME_LINE = 17.5;

export interface RendererContext {
  tree: LoadedTree;
  settings: ChartSettings;
  intl: IntlShape;
  measure: Measure;
  /** The selected person (read at every render: it changes when re-rooting). */
  selectedId: () => string;
}

/** How a person is drawn and announced; independent of where. */
export interface PersonLook {
  id: string;
  name: string;
  life: string;
  sex?: 'M' | 'F';
  /** Accessible name: name and life dates. */
  label: string;
}

const isRestricted = (r: readonly string[]) =>
  r.includes('CONFIDENTIAL') || r.includes('PRIVACY');

/** Life dates as shown in the box, honouring "hide restricted details". */
function lifeOf(indi: IndiView, ctx: RendererContext): string {
  const {settings, intl} = ctx;
  const options = {locale: intl.locale, style: settings.dateStyle};
  if (!settings.hideRestricted) return lifeSpan(indi, options);
  if (isRestricted(indi.restrictions)) return '';
  const events = indi.events.filter((e) => !isRestricted(e.restrictions));
  return lifeSpan({...indi, events}, options);
}

export function personLook(ctx: RendererContext, id: string): PersonLook {
  const indi = ctx.tree.indis.get(id);
  const name = displayName(indi, id);
  const life = indi ? lifeOf(indi, ctx) : '';
  return {
    id,
    name,
    life,
    sex: indi?.sex === 'M' || indi?.sex === 'F' ? indi.sex : undefined,
    label: life ? `${name}, ${life}` : name,
  };
}

type Group = Selection<SVGGElement, unknown, null, undefined>;

/** Draws the boxes of a node: a person and, next to them, the spouse. */
export class GedviewRenderer extends CompositeRenderer implements Renderer {
  private readonly looks = new Map<string, PersonLook>();
  /** The nodes drawn by the last render (exiting nodes are not in it). */
  nodes: Array<HierarchyPointNode<TreeNode>> = [];

  constructor(
    options: RendererOptions<IndiDetails, FamDetails>,
    private readonly ctx: RendererContext,
  ) {
    super(options);
  }

  private look(id: string): PersonLook {
    let look = this.looks.get(id);
    if (!look) {
      look = personLook(this.ctx, id);
      this.looks.set(id, look);
    }
    return look;
  }

  getPreferredIndiSize(): [number, number] {
    return [BOX_W + COUPLE_GAP, BOX_H];
  }

  getPreferredFamSize(): [number, number] {
    return [0, FAMILY_H];
  }

  // Styles live in chart.css (they use the page's theme tokens).
  getCss(): string {
    return '';
  }

  render(enter: TreeNodeSelection, update: TreeNodeSelection): void {
    // Boxes of nodes that stay are drawn anew: the same node can hold other
    // people after re-rooting.
    update.selectAll('g.gv-pair').remove();
    const all = enter.merge(update);
    this.nodes = all.data();
    const pairs = all.append('g').attr('class', 'gv-pair');
    pairs.each((node, i, groups) => {
      const g = select(groups[i] as SVGGElement) as unknown as Group;
      const {indi, spouse} = node.data;
      if (indi) this.person(g, node.id!, 'indi', indi.id, 0);
      if (spouse) {
        const x = indi ? indi.width! : 0;
        this.person(g, node.id!, 'spouse', spouse.id, x);
      }
      if (indi && spouse) {
        // The marriage line between the two boxes.
        const y = BOX_H / 2;
        g.append('path')
          .attr('class', 'gv-union')
          .attr(
            'd',
            `M${indi.width! - COUPLE_GAP / 2} ${y}H${indi.width! + COUPLE_GAP / 2}`,
          );
      }
    });
  }

  private person(
    parent: Group,
    nodeId: string,
    role: 'indi' | 'spouse',
    id: string,
    x: number,
  ): void {
    const {settings} = this.ctx;
    const look = this.look(id);
    const selected = id === this.ctx.selectedId();
    const inset = COUPLE_GAP / 2;
    const g = parent
      .append('g')
      .attr('class', 'gv-person')
      .attr('transform', `translate(${x + inset} 0)`)
      .attr('data-id', id)
      .attr('data-key', `${nodeId}:${role}`)
      .attr('role', 'button')
      .attr('tabindex', -1)
      .attr('aria-label', look.label);
    if (selected) g.classed('gv-selected', true).attr('aria-current', 'true');

    g.append('rect')
      .attr('class', 'gv-ring')
      .attr('x', -1)
      .attr('y', -1)
      .attr('width', BOX_W + 2)
      .attr('height', BOX_H + 2)
      .attr('rx', 15);
    g.append('rect')
      .attr('class', 'gv-focus')
      .attr('x', -4)
      .attr('y', -4)
      .attr('width', BOX_W + 8)
      .attr('height', BOX_H + 8)
      .attr('rx', 18);
    g.append('rect')
      .attr('class', 'gv-card')
      .attr('width', BOX_W)
      .attr('height', BOX_H)
      .attr('rx', 14);

    const idWidth = settings.showIds ? this.ctx.measure(id) + 10 : 0;
    const maxText = BOX_W - NAME_X - NAME_RIGHT - idWidth;
    const lines = wrapName(look.name, maxText, this.ctx.measure);
    const block = lines.length * NAME_LINE + (look.life ? 4 + 15 : 0);
    const top = (BOX_H - block) / 2;
    const nameBase = top + 13;

    g.append('circle')
      .attr(
        'class',
        settings.sexColors && look.sex ? `gv-dot gv-${look.sex}` : 'gv-dot',
      )
      .attr('cx', PAD_LEFT + 4)
      .attr('cy', top + NAME_LINE / 2)
      .attr('r', 4);
    lines.forEach((line, i) => {
      g.append('text')
        .attr('class', 'gv-name')
        .attr('x', NAME_X)
        .attr('y', nameBase + i * NAME_LINE)
        .text(`${line} `);
    });
    if (look.life) {
      g.append('text')
        .attr('class', 'gv-life')
        .attr('x', NAME_X)
        .attr('y', top + lines.length * NAME_LINE + 4 + 11)
        .text(` ${look.life}`);
    }
    if (settings.showIds) {
      g.append('text')
        .attr('class', 'gv-id')
        .attr('x', BOX_W - 10)
        .attr('y', 19)
        .attr('text-anchor', 'end')
        .text(id);
    }
  }
}
