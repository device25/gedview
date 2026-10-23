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
import {displayName, initials, lifeSpan} from '../ui/format';
import {cropBox, photoOf, type Photo} from './photo';
import {wrapName, type Measure} from './text';

export const BOX_W = 220;
export const BOX_H = 72;
/** Space between the two boxes of a couple (and half of it around a box). */
export const COUPLE_GAP = 24;
/** Extra height under a row of boxes: room for the link and its label. */
export const FAMILY_H = 32;

const PAD_LEFT = 14;
const NAME_X = 30; // after the dot
const PHOTO = 36; // portrait diameter
const NAME_X_PHOTO = PAD_LEFT + PHOTO + 10;
const NAME_RIGHT = 14;
const NAME_LINE = 17.5;
/** Life dates are set at 12px regular; `measure` is the 14px medium name font. */
const LIFE_SCALE = 0.84;

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
function lifeOf(indi: IndiView, ctx: RendererContext, years = false): string {
  const {settings, intl} = ctx;
  const options = {locale: intl.locale, style: settings.dateStyle};
  if (!settings.hideRestricted) return lifeSpan(indi, options, {years});
  if (isRestricted(indi.restrictions)) return '';
  const events = indi.events.filter((e) => !isRestricted(e.restrictions));
  return lifeSpan({...indi, events}, options, {years});
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

    const photo = photoOf(this.ctx.tree.indis.get(id), this.ctx.tree, {
      allowRemote: settings.loadRemoteMedia,
      hideRestricted: settings.hideRestricted,
    });
    const textX = photo ? NAME_X_PHOTO : NAME_X;
    const idWidth = settings.showIds ? this.ctx.measure(id) + 10 : 0;
    const maxText = BOX_W - textX - NAME_RIGHT - idWidth;
    const lines = wrapName(look.name, maxText, this.ctx.measure);
    // Full dates when they fit, else the years only (never abbreviated); the
    // accessible name keeps the full dates.
    const indi = this.ctx.tree.indis.get(id);
    const life =
      look.life && indi && this.ctx.measure(look.life) * LIFE_SCALE > maxText
        ? lifeOf(indi, this.ctx, true)
        : look.life;
    const block = lines.length * NAME_LINE + (life ? 4 + 15 : 0);
    const top = (BOX_H - block) / 2;
    const nameBase = top + 13;

    const sexClass = settings.sexColors && look.sex ? ` gv-${look.sex}` : '';
    if (photo) {
      this.portrait(g, photo, look.name, sexClass);
    } else {
      g.append('circle')
        .attr('class', `gv-dot${sexClass}`)
        .attr('cx', PAD_LEFT + 4)
        .attr('cy', top + NAME_LINE / 2)
        .attr('r', 4);
    }
    lines.forEach((line, i) => {
      g.append('text')
        .attr('class', 'gv-name')
        .attr('x', textX)
        .attr('y', nameBase + i * NAME_LINE)
        .text(`${line} `);
    });
    if (life) {
      g.append('text')
        .attr('class', 'gv-life')
        .attr('x', textX)
        .attr('y', top + lines.length * NAME_LINE + 4 + 11)
        .text(` ${life}`);
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

  /** A round portrait at the left of the box; the initials stay underneath
   *  and show when the image cannot be loaded. Decorative: the box's
   *  accessible name already says who it is. */
  private portrait(g: Group, photo: Photo, name: string, sexClass: string) {
    const r = PHOTO / 2;
    const p = g
      .append('g')
      .attr('class', 'gv-photo')
      .attr('aria-hidden', 'true')
      .attr('transform', `translate(${PAD_LEFT} ${(BOX_H - PHOTO) / 2})`);
    p.append('circle')
      .attr('class', 'gv-photo-bg')
      .attr('cx', r)
      .attr('cy', r)
      .attr('r', r);
    p.append('text')
      .attr('class', 'gv-initials')
      .attr('x', r)
      .attr('y', r + 4.5)
      .attr('text-anchor', 'middle')
      .text(initials(name));
    const frame = p
      .append('svg')
      .attr('class', 'gv-photo-frame')
      .attr('width', PHOTO)
      .attr('height', PHOTO)
      .attr('preserveAspectRatio', 'xMidYMid slice');
    const image = frame
      .append('image')
      .attr('href', photo.src)
      .attr('preserveAspectRatio', 'xMidYMid slice');
    const box = cropBox(photo.crop);
    if (box) {
      // The image keeps its natural size; the view box picks the region.
      frame.attr('viewBox', box.join(' '));
    } else if (photo.crop) {
      // A crop without width or height: it needs the image size.
      const probe = new Image();
      probe.onload = () => {
        const size = {width: probe.naturalWidth, height: probe.naturalHeight};
        const full = cropBox(photo.crop, size);
        if (full) frame.attr('viewBox', full.join(' '));
        else image.attr('width', PHOTO).attr('height', PHOTO);
      };
      probe.src = photo.src;
    } else {
      image.attr('width', PHOTO).attr('height', PHOTO);
    }
    image.on('error', () => frame.remove());
    p.append('circle')
      .attr('class', `gv-photo-ring${sexClass}`)
      .attr('cx', r)
      .attr('cy', r)
      .attr('r', r - 1);
  }
}
