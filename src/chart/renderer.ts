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
import {familyBox, marriageOrder} from './family';
import {cropBox, photoOf, type Photo} from './photo';
import {wrapLife, wrapName, type Measure} from './text';
import {
  birthYear,
  decadeFill,
  decadeScale,
  type DecadeScale,
} from '../model/decades';

export const BOX_W = 176;
export const BOX_H = 128;
/** Space between the two boxes of a couple (and half of it around a box). */
export const COUPLE_GAP = 24;
/** Extra height under a couple: the family box and room for the links. */
export const FAMILY_H = 60;
/** The family box starts this far under the cards (the copies' connector
 *  runs at half of it). */
export const FAMILY_GAP = 16;
const FAMILY_BOX_H = 44;
/** Family box text (13px regular) against the 15px medium name font. */
const FAMILY_SCALE = 0.82;

const PAD = 14;
const PHOTO = 40; // portrait (or initials) diameter, top left
const NAME_TOP = PAD + PHOTO + 10 + 14; // baseline of the first name line
const NAME_LINE = 18.5;
/** Life dates are set at 13px regular; `measure` is the 15px medium name font. */
const LIFE_SCALE = 0.85;
const LIFE_LINE = 16;
/** Numbers the portraits' clip paths: each needs an id of its own. */
let clipCount = 0;

export interface RendererContext {
  tree: LoadedTree;
  settings: ChartSettings;
  intl: IntlShape;
  measure: Measure;
  /** The selected person (read at every render: it changes when re-rooting). */
  selectedId: () => string;
  /** The person the chart counts from; marked on their box. */
  rootId?: string;
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

  /** The decade scale of the whole file, when cards are coloured by it. */
  private readonly decades: DecadeScale | undefined;

  constructor(
    options: RendererOptions<IndiDetails, FamDetails>,
    private readonly ctx: RendererContext,
  ) {
    super(options);
    this.decades =
      ctx.settings.cardColor === 'decade'
        ? decadeScale(ctx.tree, ctx.settings)
        : undefined;
  }

  /** The card's fill by decade of birth; none = the plain card. */
  private fillOf(id: string): string | null {
    const indi = this.ctx.tree.indis.get(id);
    if (!this.decades || !indi) return null;
    const year = birthYear(indi, this.ctx.settings);
    return year === undefined ? null : decadeFill(year, this.decades);
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
    this.famsCache = undefined;
    const pairs = all.append('g').attr('class', 'gv-pair');
    pairs.each((node, i, groups) => {
      const g = select(groups[i] as SVGGElement) as unknown as Group;
      const {indi, spouse} = node.data;
      const famId = node.data.family?.id;
      if (indi) this.person(g, node.id!, 'indi', indi.id, 0, famId);
      if (spouse) {
        const x = indi ? indi.width! : 0;
        this.person(g, node.id!, 'spouse', spouse.id, x, famId);
      }
      if (indi && spouse && famId) this.familyBox(g, famId, indi.width!);
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
    famId?: string,
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
      .attr('rx', 14)
      .style('fill', () => this.fillOf(id));

    const photo = photoOf(this.ctx.tree.indis.get(id), this.ctx.tree, {
      allowRemote: settings.loadRemoteMedia,
      hideRestricted: settings.hideRestricted,
    });
    const sexClass = settings.sexColors && look.sex ? ` gv-${look.sex}` : '';
    // Drawn beside the button, not inside it: the initials are not part of
    // the accessible name, and clicks go through to the card underneath.
    this.portrait(parent, x + inset, id, photo, look.name, sexClass);
    const isRoot = id === this.ctx.rootId;
    if (settings.showIds) {
      // Beside the button too: the id is not part of the person's name.
      parent
        .append('text')
        .attr('class', 'gv-id')
        .attr('data-for', id)
        .attr('aria-hidden', 'true')
        .attr('x', x + inset + BOX_W - 12)
        .attr('y', PAD + (isRoot ? 30 : 12))
        .attr('text-anchor', 'end')
        .text(id);
    }
    const tags: string[] = [];
    if (isRoot) tags.push(this.ctx.intl.formatMessage({id: 'chart.root'}));
    const indiView = this.ctx.tree.indis.get(id);
    const order =
      famId && indiView
        ? marriageOrder(this.ctx.tree, indiView, famId, (f) =>
            this.drawnFams.has(f),
          )
        : undefined;
    if (order)
      tags.push(this.ctx.intl.formatMessage({id: 'family.order'}, {n: order}));

    // Name and dates under the portrait, across the whole width.
    const maxText = BOX_W - 2 * PAD;
    const lines = wrapName(look.name, maxText, this.ctx.measure);
    // A name cut with an ellipsis is drawn beside the button, like the
    // portrait: the accessible name has it whole, and the shown text must
    // not contradict it.
    const cut = lines.join(' ') !== look.name;
    const nameLayer = cut
      ? parent
          .append('g')
          .attr('class', 'gv-name-cut')
          .attr('data-for', id)
          .attr('aria-hidden', 'true')
          .attr('transform', `translate(${x + inset} 0)`)
      : g;
    lines.forEach((line, i) => {
      nameLayer
        .append('text')
        .attr('class', 'gv-name')
        .attr('x', PAD)
        .attr('y', NAME_TOP + i * NAME_LINE)
        .text(`${line} `);
    });
    // Full dates when they fit, else the years only (never abbreviated); the
    // accessible name keeps the full dates.
    const indi = this.ctx.tree.indis.get(id);
    const life =
      look.life && indi && this.ctx.measure(look.life) * LIFE_SCALE > maxText
        ? lifeOf(indi, this.ctx, true)
        : look.life;
    // The accessible name matches what is shown; the full dates, when only
    // the years fit, go to the description.
    if (life !== look.life) {
      g.attr('aria-label', life ? `${look.name}, ${life}` : look.name);
      g.attr('aria-description', look.life);
    }
    if (tags.length)
      g.attr('aria-label', [g.attr('aria-label'), ...tags].join(', '));
    if (life) {
      // Dates still too wide take a second line under a one-line name.
      const lifeLines = wrapLife(
        life,
        maxText / LIFE_SCALE,
        this.ctx.measure,
        lines.length === 1 ? 2 : 1,
      );
      lifeLines.forEach((line, i) => {
        g.append('text')
          .attr('class', 'gv-life')
          .attr('x', PAD)
          .attr(
            'y',
            NAME_TOP + (lines.length - 1) * NAME_LINE + 19 + i * LIFE_LINE,
          )
          .text(` ${line}`);
      });
    }
    // Last in the box, so the text reads in the order of the accessible
    // name; drawn in the portrait row so the card keeps its height.
    tags.forEach((tag, i) => {
      g.append('text')
        .attr('class', 'gv-tag')
        .attr('x', BOX_W - 12)
        .attr('y', PAD + 12 + i * 15)
        .attr('text-anchor', 'end')
        .text(` ${tag}`);
    });
  }

  /** Families drawn in this chart (a marriage order counts only these). */
  private get drawnFams(): Set<string> {
    if (!this.famsCache) {
      this.famsCache = new Set(
        this.nodes.flatMap((n) => (n.data.family ? [n.data.family.id] : [])),
      );
    }
    return this.famsCache;
  }
  private famsCache?: Set<string>;

  /** The family box under a couple, on the line of descent. Decorative for
   *  assistive technology: the card lists the same marriage. */
  private familyBox(parent: Group, famId: string, unionX: number) {
    const box = familyBox(this.ctx, famId);
    if (!box) return;
    const lines = [
      (box.married ? '⚭ ' : '') + box.line1,
      ...(box.line2 ? [box.line2] : []),
    ];
    const width = Math.min(
      2 * BOX_W,
      Math.max(
        96,
        ...lines.map((l) => this.ctx.measure(l) * FAMILY_SCALE + 24),
      ),
    );
    const top = BOX_H + FAMILY_GAP;
    const g = parent
      .append('g')
      .attr('class', 'gv-family')
      .attr('data-fam', famId)
      .attr('aria-hidden', 'true');
    // From the marriage line down to the box, also when there are no children.
    g.append('path')
      .attr('class', 'gv-family-stem')
      .attr('d', `M${unionX} ${BOX_H / 2}V${top}`);
    g.append('rect')
      .attr('class', 'gv-family-box')
      .attr('x', unionX - width / 2)
      .attr('y', top)
      .attr('width', width)
      .attr('height', lines.length > 1 ? FAMILY_BOX_H : FAMILY_BOX_H - 18)
      .attr('rx', 10);
    lines.forEach((line, i) => {
      g.append('text')
        .attr('class', i === 0 ? 'gv-family-line1' : 'gv-family-line2')
        .attr('x', unionX)
        .attr('y', top + 17 + i * 18)
        .attr('text-anchor', 'middle')
        .text(line);
    });
  }

  /** A round portrait at the top left of the box: the photo over the
   *  initials, which show when there is no photo or it cannot be loaded.
   *  Decorative: the box's accessible name already says who it is. */
  private portrait(
    parent: Group,
    x: number,
    id: string,
    photo: Photo | undefined,
    name: string,
    sexClass: string,
  ) {
    const r = PHOTO / 2;
    const p = parent
      .append('g')
      .attr('class', 'gv-photo')
      .attr('data-for', id)
      .attr('aria-hidden', 'true')
      .attr('transform', `translate(${x + PAD} ${PAD})`);
    p.append('circle')
      .attr('class', 'gv-photo-bg')
      .attr('cx', r)
      .attr('cy', r)
      .attr('r', r);
    p.append('text')
      .attr('class', 'gv-initials')
      .attr('x', r)
      .attr('y', r + 5)
      .attr('text-anchor', 'middle')
      .text(initials(name));
    if (photo) this.photoFrame(p, photo);
    p.append('circle')
      .attr('class', `gv-photo-ring${sexClass}`)
      .attr('cx', r)
      .attr('cy', r)
      .attr('r', r - 1);
  }

  private photoFrame(p: Group, photo: Photo) {
    // A shown photo opens the media viewer (pointer only: on the keyboard
    // the card's portrait does it).
    p.attr('data-photo', '');
    // The circle is cut by a clip path on a group, not by CSS on the frame:
    // Firefox lays CSS clip-path shapes out inside the frame's view box, so
    // a crop away from the image's corner cut the whole photo away.
    const r = PHOTO / 2;
    const id = `gv-photo-clip-${++clipCount}`;
    p.append('clipPath')
      .attr('id', id)
      .append('circle')
      .attr('cx', r)
      .attr('cy', r)
      .attr('r', r);
    const clipped = p.append('g').attr('clip-path', `url(#${id})`);
    const frame = clipped
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
    image.on('error', () => {
      clipped.remove();
      p.attr('data-photo', null);
    });
  }
}
